import { database, storage } from '@/lib/firebase';
import { ref, get, push, set, query, orderByChild, limitToFirst, startAt } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Part, BoMComponent, PartApplication } from '@/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const DEFAULT_R2_PUBLIC_BASE = 'https://pub-7e56631fd9fb4c6e9686364d876155f8.r2.dev';

export class FirebaseService {
  private static getR2Config() {
    const endpoint = (import.meta.env.VITE_R2_ENDPOINT || '').trim().replace(/\/+$/, '');
    const accessKeyId = (import.meta.env.VITE_R2_ACCESS_KEY || '').trim();
    const secretAccessKey = (import.meta.env.VITE_R2_SECRET_KEY || '').trim();
    const bucket = (import.meta.env.VITE_R2_BUCKET || 'parts').trim();
    return { endpoint, accessKeyId, secretAccessKey, bucket };
  }

  private static async hmacSha256(key: ArrayBuffer | Uint8Array | string, message: string): Promise<ArrayBuffer> {
    const enc = new TextEncoder();
    const keyData = typeof key === 'string'
      ? enc.encode(key)
      : key instanceof Uint8Array
        ? new Uint8Array(key)
        : new Uint8Array(key);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  }

  private static async sha256Hex(payload: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private static toAmzDate(date: Date) {
    const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    return { amzDate: iso, dateStamp: iso.slice(0, 8) };
  }

  private static async uploadToCloudflareR2(file: Blob, objectKey: string, contentType: string): Promise<string> {
    const { endpoint, accessKeyId, secretAccessKey, bucket } = this.getR2Config();
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('Missing R2 config. Set VITE_R2_ENDPOINT, VITE_R2_ACCESS_KEY, VITE_R2_SECRET_KEY');
    }

    const host = new URL(endpoint).host;
    const normalizedObjectKey = this.toR2ObjectKey(objectKey);
    const canonicalUri = `/${bucket}/${normalizedObjectKey}`;
    const now = new Date();
    const { amzDate, dateStamp } = this.toAmzDate(now);
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const canonicalRequestHash = await this.sha256Hex(canonicalRequest);

    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${canonicalRequestHash}`;

    const kDate = await this.hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = await this.hmacSha256(kDate, 'auto');
    const kService = await this.hmacSha256(kRegion, 's3');
    const kSigning = await this.hmacSha256(kService, 'aws4_request');
    const signatureBuffer = await this.hmacSha256(kSigning, stringToSign);
    const signature = Array.from(new Uint8Array(signatureBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const putUrl = `${endpoint}${canonicalUri}`;
    const response = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        Authorization: authorization,
      },
      body: file,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`R2 upload failed (${response.status}): ${text}`);
    }

    return this.buildCloudflareImageUrl(normalizedObjectKey);
  }

  private static buildCloudflareImageUrl(filename: string): string {
    const publicBase = (
      import.meta.env.VITE_CF_PUBLIC_BASE ||
      import.meta.env.VITE_R2_PUBLIC_BASE ||
      DEFAULT_R2_PUBLIC_BASE
    ).trim();
    if (!publicBase) return '';
    const normalizedBase = publicBase.replace(/\/+$/, '');
    const sanitizedFilename = filename.replace(/^\/+/, '');
    const normalizedKey = sanitizedFilename.startsWith('partsfolder/')
      ? sanitizedFilename
      : `partsfolder/${sanitizedFilename}`;
    const encodedKey = normalizedKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${normalizedBase}/${encodedKey}`;
  }

  private static buildCloudflareRootUrl(filename: string): string {
    const publicBase = (
      import.meta.env.VITE_CF_PUBLIC_BASE ||
      import.meta.env.VITE_R2_PUBLIC_BASE ||
      DEFAULT_R2_PUBLIC_BASE
    ).trim();
    if (!publicBase) return '';
    const normalizedBase = publicBase.replace(/\/+$/, '');
    const sanitizedFilename = filename.replace(/^\/+/, '');
    const encodedKey = sanitizedFilename
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${normalizedBase}/${encodedKey}`;
  }

  private static toR2ObjectKey(filename: string): string {
    const sanitizedFilename = filename.replace(/^\/+/, '');
    return sanitizedFilename.startsWith('partsfolder/')
      ? sanitizedFilename
      : `partsfolder/${sanitizedFilename}`;
  }

  // Parts operations with pagination and search
  static async getAllParts(): Promise<Record<string, Part>> {
    try {
      const partsRef = ref(database, 'material_summary_2025');
      const visibilityRef = ref(database, 'PartsVisibility');
      const [baseSnapshot, visibilitySnapshot] = await Promise.all([
        get(partsRef),
        get(visibilityRef),
      ]);

      const baseParts: Record<string, Part> = {};

      const baseVal = baseSnapshot.val();
      if (isRecord(baseVal)) {
        Object.entries(baseVal).forEach(([material, part]) => {
          if (isRecord(part)) {
            baseParts[material] = part as Part;
          }
        });
      }


      const visibilityVal = visibilitySnapshot.val();
      if (isRecord(visibilityVal)) {
        Object.entries(visibilityVal).forEach(([material, visibility]) => {
          if (!isRecord(visibility)) return;
          const showInCatalogue = visibility.show_in_catalogue;
          if (typeof showInCatalogue !== 'boolean') return;
          baseParts[material] = {
            ...(baseParts[material] || {}),
            show_in_catalogue: showInCatalogue,
          } as Part;
        });
      }

      return baseParts;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error fetching parts:', message);
      return {};
    }
  }

  static async searchParts(searchTerm: string, limit: number = 50): Promise<Record<string, Part>> {
    try {
      if (!searchTerm) {
        const partsRef = ref(database, 'material_summary_2025');
        const limitedQuery = query(partsRef, limitToFirst(limit));
        const snapshot = await get(limitedQuery);
        return snapshot.val() || {};
      }

      const allParts = await this.getAllParts();
      const searchLower = searchTerm.toLowerCase();
      const filtered: Record<string, Part> = {};
      let count = 0;

      Object.entries(allParts).forEach(([material, part]) => {
        if (count >= limit) return;
        
        const matchesMaterial = material.toLowerCase().includes(searchLower);
        const matchesDescription = ((part.SPRAS_EN || '').toLowerCase().includes(searchLower) || (part.SPRAS_ZH || '').toLowerCase().includes(searchLower));

        if (
          matchesMaterial ||
          matchesDescription ||
          (part.Supplier_Name || '').toLowerCase().includes(searchLower)
        ) {
          filtered[material] = part;
          count++;
        }
      });

      return filtered;
    } catch (error) {
      console.error('Error searching parts:', error);
      return {};
    }
  }

  static async getPaginatedParts(limit: number = 50, startAfter?: string): Promise<Record<string, Part>> {
    try {
      const partsRef = ref(database, 'Parts');
      let queryRef;
      
      if (startAfter) {
        queryRef = query(partsRef, startAt(startAfter), limitToFirst(limit + 1));
      } else {
        queryRef = query(partsRef, limitToFirst(limit));
      }
      
      const snapshot = await get(queryRef);
      const data = snapshot.val() || {};
      
      if (startAfter && Object.keys(data).length > 0) {
        const keys = Object.keys(data);
        if (keys[0] === startAfter) {
          delete data[keys[0]];
        }
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching paginated parts:', error);
      return {};
    }
  }

  static async getPartByMaterial(material: string): Promise<Part | null> {
    try {
      const partRef = ref(database, 'Parts/' + material);
      const snapshot = await get(partRef);
      return snapshot.val();
    } catch (error) {
      console.error('Error fetching part:', error);
      return null;
    }
  }

  static async getAllBoMModels(): Promise<string[]> {
    try {
      const bomRef = ref(database, 'BoM');
      const snapshot = await get(bomRef);
      const data = snapshot.val();
      return data ? Object.keys(data) : [];
    } catch (error) {
      console.error('Error fetching BoM models:', error);
      return [];
    }
  }

  static async getBoMComponents(modelWithMY: string): Promise<Record<string, BoMComponent>> {
    try {
      const bomRef = ref(database, `BoM/${modelWithMY}`);
      const snapshot = await get(bomRef);
      const data = snapshot.val();
      
      if (!data) return {};
      
      // Transform the data structure to match our BoMComponent interface
      const components: Record<string, BoMComponent> = {};
      
      Object.entries(data).forEach(([materialCode, componentData]: [string, any]) => {
        if (componentData && typeof componentData === 'object') {
          components[materialCode] = {
            Component_Material: materialCode,
            Component_Description: componentData.Component_Description || '',
            Standard_Price: componentData.Standard_Price || 0,
            Supplier: componentData.Supplier || ''
          };
        }
      });
      
      return components;
    } catch (error) {
      console.error('Error fetching BoM components:', error);
      return {};
    }
  }

  static async submitPartApplication(application: Omit<PartApplication, 'ticket_id' | 'created_at'>): Promise<string> {
    try {
      const applicationsRef = ref(database, 'PartApplications');
      const newRef = push(applicationsRef);
      const ticketId = newRef.key!;
      
      const fullApplication: PartApplication = {
        ...application,
        ticket_id: ticketId,
        created_at: Date.now(),
      };

      await set(newRef, fullApplication);
      return ticketId;
    } catch (error) {
      console.error('Error submitting part application:', error);
      throw error;
    }
  }

  static async getAllPartApplications(): Promise<PartApplication[]> {
    try {
      const applicationsRef = ref(database, 'PartApplications');
      const orderedQuery = query(applicationsRef, orderByChild('created_at'));
      const snapshot = await get(orderedQuery);
      const data = snapshot.val();
      
      if (!data) return [];
      
      return (Object.values(data).reverse() as PartApplication[]).map((app) => ({
        ...app,
        image_url: this.normalizeImageUrl(app.image_url || ''),
      }));
    } catch (error) {
      console.error('Error fetching part applications:', error);
      return [];
    }
  }

  static async getPartApplication(ticketId: string): Promise<PartApplication | null> {
    try {
      const appRef = ref(database, 'PartApplications/' + ticketId);
      const snapshot = await get(appRef);
      const app = snapshot.val();
      if (!app) return null;
      return {
        ...app,
        image_url: this.normalizeImageUrl(app.image_url || ''),
      };
    } catch (error) {
      console.error('Error fetching part application:', error);
      return null;
    }
  }

  static async uploadApplicationImage(ticketId: string, file: File): Promise<string> {
    try {
      return await this.uploadToCloudflareR2(file, `${ticketId}.png`, file.type || 'image/png');
    } catch (error) {
      console.error('Error uploading application image:', error);
      throw error;
    }
  }

  static getPartImageUrl(material: string): string {
    return this.buildCloudflareImageUrl(`${material}.png`);
  }

  static getPartImageUrlWithFallback(material: string): string[] {
    const candidates = [
      this.buildCloudflareImageUrl(`${material}.png`),
      this.buildCloudflareImageUrl(`${material}.jpg`),
      this.buildCloudflareImageUrl(`${material}.webp`),
      // 兼容历史文件在bucket根目录的情况
      this.buildCloudflareRootUrl(`${material}.png`),
      this.buildCloudflareRootUrl(`${material}.jpg`),
      this.buildCloudflareRootUrl(`${material}.webp`),
    ].filter(Boolean);

    return Array.from(new Set(candidates));
  }

  static normalizeImageUrl(url: string): string {
    if (!url) return '';
    if (!url.includes('firebasestorage.googleapis.com')) return url;

    const match = url.match(/\/o\/([^?]+)/);
    const encodedPath = match?.[1];
    if (!encodedPath) return url;

    const decodedPath = decodeURIComponent(encodedPath);
    const filename = decodedPath.split('/').pop();
    if (!filename) return url;

    return this.buildCloudflareImageUrl(filename) || url;
  }

  static async uploadPartImage(partCode: string, file: File): Promise<string> {
    try {
      return await this.uploadToCloudflareR2(file, `${partCode}.png`, file.type || 'image/png');
    } catch (error) {
      console.error('Error uploading part image:', error);
      throw error;
    }
  }
  
  static async updatePartData(material: string, updates: {
    notes?: string;
    year?: string;
    obsoleted_date?: string;
    alternative_parts?: string;
    show_in_catalogue?: boolean;
  }): Promise<void> {
    try {
      const { show_in_catalogue, ...restUpdates } = updates;

      // Strip undefined values to avoid Firebase "undefined" errors
      const sanitizedUpdates = Object.fromEntries(
        Object.entries(restUpdates).filter(([, value]) => value !== undefined)
      );

      // Persist non-visibility fields under Parts
      if (Object.keys(sanitizedUpdates).length > 0) {
        const partRef = ref(database, 'Parts/' + material);
        const currentData = await get(partRef);
        const baseData = currentData.val();
        const safeData = isRecord(baseData) ? baseData : {};
        const updatedData = { ...safeData, ...sanitizedUpdates };
        await set(partRef, updatedData);
      }

      // Persist show/hide flag in a dedicated dataset to avoid overwrites
      if (show_in_catalogue !== undefined) {
        const visibilityRef = ref(database, 'PartsVisibility/' + material);
        await set(visibilityRef, { show_in_catalogue });
      }
    } catch (error) {
      console.error('Error updating part data:', error);
      throw error;
    }
  }

  // Part Application Management
  static async getPartApplications(): Promise<any[]> {
    try {
      const snapshot = await get(ref(database, 'partApplications'));
      if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({
          id: key,
          ...data[key],
          imageUrl: this.normalizeImageUrl(data[key]?.imageUrl || ''),
        }));
      }
      return [];
    } catch (error) {
      console.error('Error loading applications:', error);
      return [];
    }
  }

  static async savePartApplication(application: any): Promise<void> {
    try {
      await set(ref(database, `partApplications/${application.id}`), {
        requestedBy: application.requestedBy,
        department: application.department,
        priority: application.priority,
        specifications: application.specifications,
        supplier: application.supplier,
        standardPrice: application.standardPrice,
        notes: application.notes,
        submittedAt: application.submittedAt,
        status: application.status,
        imageUrl: application.imageUrl
      });
    } catch (error) {
      console.error('Error saving application:', error);
      throw error;
    }
  }

  static async approvePartApplication(applicationId: string, partCode: string): Promise<void> {
    try {
      const appRef = ref(database, `partApplications/${applicationId}`);
      const snapshot = await get(appRef);
      if (snapshot.exists()) {
        const currentData = snapshot.val();
        const updates = {
          ...currentData,
          status: 'approved',
          partCode: partCode,
          approvedAt: new Date().toISOString()
        };
        await set(appRef, updates);
      }
    } catch (error) {
      console.error('Error approving application:', error);
      throw error;
    }
  }

  static async uploadPartApplicationImage(file: File, applicationId: string): Promise<string> {
    try {
      return await this.uploadToCloudflareR2(file, `${applicationId}.png`, file.type || 'image/png');
    } catch (error) {
      console.error('Error uploading application image:', error);
      throw error;
    }
  }

  // 新方法：复制图片到新的part code文件名
  static async copyImageToPartCode(applicationId: string, partCode: string): Promise<string> {
    try {
      console.log(`Starting image copy from ${applicationId} to ${partCode}`);
      
      // 获取当前application的数据
      const appRef = ref(database, `partApplications/${applicationId}`);
      const appSnapshot = await get(appRef);
      
      if (!appSnapshot.exists()) {
        throw new Error('Application not found');
      }
      
      const appData = appSnapshot.val();
      const currentImageUrl = appData.imageUrl;
      
      if (!currentImageUrl) {
        console.log('No image URL found, skipping copy');
        return '';
      }

      // 使用原生fetch API获取图片blob，添加no-cors模式
      const response = await fetch(currentImageUrl, { 
        mode: 'cors',
        method: 'GET'
      });
      
      if (!response.ok) {
        // 如果CORS失败，尝试通过代理方式
        console.log('Direct fetch failed, trying alternative method');
        
        // 创建一个canvas来"复制"图片
        return await this.copyImageViaCanvas(currentImageUrl, partCode);
      }
      
      const imageBlob = await response.blob();
      
      // 上传到新的part code文件名
      const newImageUrl = await this.uploadToCloudflareR2(imageBlob, `${partCode}.png`, 'image/png');
      
      console.log(`Successfully copied image to ${partCode}.png`);
      return newImageUrl;
      
    } catch (error) {
      console.error('Error copying image:', error);
      
      // 如果所有方法都失败，返回原始URL，至少保持功能可用
      const appRef = ref(database, `partApplications/${applicationId}`);
      const appSnapshot = await get(appRef);
      if (appSnapshot.exists()) {
        const appData = appSnapshot.val();
        return appData.imageUrl || '';
      }
      
      return '';
    }
  }

  // 备用方法：通过canvas复制图片
  static async copyImageViaCanvas(imageUrl: string, partCode: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = async () => {
        try {
          // 创建canvas
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error('Could not get canvas context');
          }
          
          // 设置canvas尺寸
          canvas.width = img.width;
          canvas.height = img.height;
          
          // 绘制图片到canvas
          ctx.drawImage(img, 0, 0);
          
          // 转换为blob
          canvas.toBlob(async (blob) => {
            if (!blob) {
              reject(new Error('Could not create blob from canvas'));
              return;
            }
            
            try {
              // 上传新图片
              const newImageUrl = await FirebaseService.uploadToCloudflareR2(blob, `${partCode}.png`, 'image/png');
              
              console.log(`Successfully copied image via canvas to ${partCode}.png`);
              resolve(newImageUrl);
            } catch (uploadError) {
              reject(uploadError);
            }
          }, 'image/png');
          
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image for canvas copy'));
      };
      
      // 尝试加载图片
      img.src = imageUrl;
    });
  }

  // 重命名方法：现在使用复制策略
  static async renamePartApplicationImage(applicationId: string, partCode: string): Promise<void> {
    try {
      console.log(`Starting image rename (copy) from ${applicationId} to ${partCode}`);
      
      // 复制图片到新的part code文件名
      const newImageUrl = await this.copyImageToPartCode(applicationId, partCode);
      
      if (newImageUrl) {
        // 更新数据库中的imageUrl指向新文件
        const appRef = ref(database, `partApplications/${applicationId}`);
        const appSnapshot = await get(appRef);
        
        if (appSnapshot.exists()) {
          const currentData = appSnapshot.val();
          const updatedData = {
            ...currentData,
            imageUrl: newImageUrl,
            partCodeImageUrl: newImageUrl // 额外保存一个字段记录part code图片URL
          };
          await set(appRef, updatedData);
        }
        
        console.log(`Successfully renamed (copied) image to ${partCode}.png`);
      } else {
        console.log('Image copy failed, but continuing with approval');
      }
      
    } catch (error) {
      console.error('Error in image rename (copy):', error);
      // 不抛出错误，让approval继续进行
      console.warn('Image copy failed, but application approval will continue');
    }
  }

  // Upload part image with part code as filename (for Take Photo page)
  static async uploadPartImageWithCode(file: File, partCode: string): Promise<string> {
    try {
      return await this.uploadToCloudflareR2(file, `${partCode}.png`, file.type || 'image/png');
    } catch (error) {
      console.error('Error uploading part image:', error);
      throw error;
    }
  }
}
