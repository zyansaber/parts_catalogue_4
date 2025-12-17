import { database, storage } from '@/lib/firebase';
import { ref, get, push, set, query, orderByChild, limitToFirst, startAt } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Part, BoMComponent, PartApplication } from '@/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class FirebaseService {
  // Parts operations with pagination and search
  static async getAllParts(): Promise<Record<string, Part>> {
    try {
      const partsRef = ref(database, 'material_summary_2025');
      const adminPartsRef = ref(database, 'Parts');

      const [baseSnapshot, adminSnapshot] = await Promise.all([
        get(partsRef),
        get(adminPartsRef)
      ]);

      const baseParts: Record<string, Part> = {};
      const adminParts: Record<string, Part> = {};

      const baseVal = baseSnapshot.val();
      if (isRecord(baseVal)) {
        Object.entries(baseVal).forEach(([material, part]) => {
          if (isRecord(part)) {
            baseParts[material] = part as Part;
          }
        });
      }

      const adminVal = adminSnapshot.val();
      if (isRecord(adminVal)) {
        Object.entries(adminVal).forEach(([material, overrides]) => {
          if (isRecord(overrides)) {
            adminParts[material] = overrides as Part;
          }
        });
      }

      // Merge admin overrides (notes, visibility, etc.) into the base dataset
      const merged: Record<string, Part> = { ...baseParts };
      Object.entries(adminParts).forEach(([material, overrides]) => {
        merged[material] = {
          ...(merged[material] ?? {}),
          ...overrides,
        } as Part;
      });

      return merged;
      console.error('Error fetching parts:', error);
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
        const matchesDescription = (part.SPRAS_EN || '').toLowerCase().includes(searchLower);
        const matchesSupplier = (part.Supplier_Name || '').toLowerCase().includes(searchLower);

        if (matchesMaterial || matchesDescription || matchesSupplier) {
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
      
      return Object.values(data).reverse() as PartApplication[];
    } catch (error) {
      console.error('Error fetching part applications:', error);
      return [];
    }
  }

  static async getPartApplication(ticketId: string): Promise<PartApplication | null> {
    try {
      const appRef = ref(database, 'PartApplications/' + ticketId);
      const snapshot = await get(appRef);
      return snapshot.val();
    } catch (error) {
      console.error('Error fetching part application:', error);
      return null;
    }
  }

  static async uploadApplicationImage(ticketId: string, file: File): Promise<string> {
    try {
      const imageRef = storageRef(storage, ticketId + '.png');
      const snapshot = await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading application image:', error);
      throw error;
    }
  }

  static getPartImageUrl(material: string): string {
    const baseUrl = 'https://firebasestorage.googleapis.com/v0/b/partssr.firebasestorage.app/o/';
    return baseUrl + encodeURIComponent(material) + '.png?alt=media';
  }

  static getPartImageUrlWithFallback(material: string): string[] {
    const baseUrl = 'https://firebasestorage.googleapis.com/v0/b/partssr.firebasestorage.app/o/';
    return [
      baseUrl + encodeURIComponent(material) + '.png?alt=media',
      baseUrl + encodeURIComponent(material) + '.jpg?alt=media',
      baseUrl + encodeURIComponent(material) + '.webp?alt=media',
    ];
  }

  static async uploadPartImage(partCode: string, file: File): Promise<string> {
    try {
      const imageRef = storageRef(storage, partCode + '.png');
      const snapshot = await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
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
      const partRef = ref(database, 'Parts/' + material);
      const currentData = await get(partRef);
      const updatedData = { ...currentData.val(), ...updates };
      await set(partRef, updatedData);
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
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
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
      const imageRef = storageRef(storage, applicationId + '.png');
      const snapshot = await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
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
      const newImageRef = storageRef(storage, `${partCode}.png`);
      const uploadSnapshot = await uploadBytes(newImageRef, imageBlob);
      const newImageUrl = await getDownloadURL(uploadSnapshot.ref);
      
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
              const newImageRef = storageRef(storage, `${partCode}.png`);
              const uploadSnapshot = await uploadBytes(newImageRef, blob);
              const newImageUrl = await getDownloadURL(uploadSnapshot.ref);
              
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
      const imageRef = storageRef(storage, `${partCode}.png`);
      const snapshot = await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading part image:', error);
      throw error;
    }
  }
}
