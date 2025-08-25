import { database, storage } from '@/lib/firebase';
import { ref, get, push, set, query, orderByChild, limitToFirst, startAt } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Part, BoMComponent, PartApplication } from '@/types';

export class FirebaseService {
  // Parts operations with pagination and search
  static async getAllParts(): Promise<Record<string, Part>> {
    try {
      const partsRef = ref(database, 'material_summary_2025');
      const snapshot = await get(partsRef);
      return snapshot.val() || {};
    } catch (error) {
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
      const imageRef = storageRef(storage, 'applications/' + ticketId + '.png');
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
      const imageRef = storageRef(storage, `partApplications/${applicationId}.png`);
      const snapshot = await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading application image:', error);
      throw error;
    }
  }

  static async renamePartApplicationImage(applicationId: string, partCode: string): Promise<void> {
    try {
      // In a real implementation, this would involve copying the file to a new location
      // For now, we'll just log this action
      console.log(`Renaming image from ${applicationId} to ${partCode}`);
    } catch (error) {
      console.error('Error renaming image:', error);
      throw error;
    }
  }

  // Upload part image with part code as filename (for Take Photo page)
  static async uploadPartImageWithCode(file: File, partCode: string): Promise<string> {
    try {
      const imageRef = storageRef(storage, `parts/${partCode}.png`);
      const snapshot = await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading part image:', error);
      throw error;
    }
  }
}