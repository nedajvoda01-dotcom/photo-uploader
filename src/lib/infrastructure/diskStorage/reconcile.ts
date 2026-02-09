/**
 * Reconcile/Repair Utilities
 * 
 * Self-healing functions to rebuild indexes when missing or corrupted
 */

import { listFolder, downloadFile, uploadText, exists } from '@/lib/infrastructure/yandexDisk/client';
import { getRegionPath } from '@/lib/domain/disk/paths';
import type { PhotoIndex, PhotoItem } from './carsRepo';

export interface ReconcileResult {
  actionsPerformed: string[];
  repairedFiles: string[];
  errors: string[];
}

/**
 * Reconcile a region: rebuild _REGION.json from actual folders
 */
export async function reconcileRegion(region: string): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    actionsPerformed: [],
    repairedFiles: [],
    errors: [],
  };
  
  try {
    const regionPath = getRegionPath(region);
    result.actionsPerformed.push(`Scanning region: ${regionPath}`);
    
    // List car folders
    const listResult = await listFolder(regionPath);
    if (!listResult.success || !listResult.items) {
      result.errors.push(`Failed to list region folder: ${regionPath}`);
      return result;
    }
    
    const carFolders = listResult.items.filter(item => item.type === 'dir');
    result.actionsPerformed.push(`Found ${carFolders.length} car folders`);
    
    // Parse each car folder and read _CAR.json
    const cars = [];
    for (const carFolder of carFolders) {
      try {
        const carMetadataPath = `${carFolder.path}/_CAR.json`;
        const metadataExists = await exists(carMetadataPath);
        
        if (metadataExists) {
          const metadataResult = await downloadFile(carMetadataPath);
          if (metadataResult.success && metadataResult.data) {
            const metadata = JSON.parse(metadataResult.data.toString('utf-8'));
            cars.push(metadata);
          }
        }
      } catch (error) {
        result.errors.push(`Failed to read _CAR.json for ${carFolder.name}: ${error}`);
      }
    }
    
    // Write _REGION.json
    const regionIndexPath = `${regionPath}/_REGION.json`;
    const regionData = {
      cars,
      updated_at: new Date().toISOString(),
    };
    
    const uploadResult = await uploadText(regionIndexPath, regionData);
    if (uploadResult.success) {
      result.actionsPerformed.push(`Rebuilt _REGION.json with ${cars.length} cars`);
      result.repairedFiles.push(regionIndexPath);
    } else {
      result.errors.push(`Failed to write _REGION.json: ${uploadResult.error}`);
    }
    
  } catch (error) {
    result.errors.push(`Region reconcile error: ${error}`);
  }
  
  return result;
}

/**
 * Reconcile a car: rebuild slot indexes
 */
export async function reconcileCar(carRootPath: string): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    actionsPerformed: [],
    repairedFiles: [],
    errors: [],
  };
  
  try {
    result.actionsPerformed.push(`Scanning car: ${carRootPath}`);
    
    // List slot type folders
    const listResult = await listFolder(carRootPath);
    if (!listResult.success || !listResult.items) {
      result.errors.push(`Failed to list car folder: ${carRootPath}`);
      return result;
    }
    
    const slotTypeFolders = listResult.items.filter(item => item.type === 'dir');
    result.actionsPerformed.push(`Found ${slotTypeFolders.length} slot type folders`);
    
    // Reconcile each slot type folder
    for (const slotTypeFolder of slotTypeFolders) {
      const slotsResult = await listFolder(slotTypeFolder.path);
      if (slotsResult.success && slotsResult.items) {
        const slotFolders = slotsResult.items.filter(item => item.type === 'dir');
        
        for (const slotFolder of slotFolders) {
          const slotReconcile = await reconcileSlot(slotFolder.path);
          result.actionsPerformed.push(...slotReconcile.actionsPerformed);
          result.repairedFiles.push(...slotReconcile.repairedFiles);
          result.errors.push(...slotReconcile.errors);
        }
      }
    }
    
  } catch (error) {
    result.errors.push(`Car reconcile error: ${error}`);
  }
  
  return result;
}

/**
 * Reconcile a slot: rebuild _SLOT.json and _PHOTOS.json from actual files
 */
export async function reconcileSlot(slotPath: string): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    actionsPerformed: [],
    repairedFiles: [],
    errors: [],
  };
  
  try {
    result.actionsPerformed.push(`Reconciling slot: ${slotPath}`);
    
    // List files in slot
    const listResult = await listFolder(slotPath);
    if (!listResult.success || !listResult.items) {
      result.errors.push(`Failed to list slot folder: ${slotPath}`);
      return result;
    }
    
    const files = listResult.items.filter(item => 
      item.type === 'file' && !item.name.startsWith('_')
    );
    
    const fileCount = files.length;
    const totalSizeBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024);
    const cover = files.length > 0 ? files[0].name : null;
    const now = new Date().toISOString();
    
    // Rebuild _SLOT.json
    const slotJsonPath = `${slotPath}/_SLOT.json`;
    const slotData = {
      count: fileCount,
      cover,
      total_size_mb: totalSizeMB,
      updated_at: now,
    };
    
    const slotUploadResult = await uploadText(slotJsonPath, slotData);
    if (slotUploadResult.success) {
      result.repairedFiles.push(slotJsonPath);
    } else {
      result.errors.push(`Failed to write _SLOT.json: ${slotUploadResult.error}`);
    }
    
    // Rebuild _PHOTOS.json
    const photosJsonPath = `${slotPath}/_PHOTOS.json`;
    const photoItems: PhotoItem[] = files.map(file => ({
      name: file.name,
      size: file.size || 0,
      modified: now,
    }));
    
    const photosData: PhotoIndex = {
      count: fileCount,
      updatedAt: now,
      cover,
      items: photoItems,
    };
    
    const photosUploadResult = await uploadText(photosJsonPath, photosData);
    if (photosUploadResult.success) {
      result.repairedFiles.push(photosJsonPath);
    } else {
      result.errors.push(`Failed to write _PHOTOS.json: ${photosUploadResult.error}`);
    }
    
    result.actionsPerformed.push(`Rebuilt slot indexes (${fileCount} photos)`);
    
  } catch (error) {
    result.errors.push(`Slot reconcile error: ${error}`);
  }
  
  return result;
}

/**
 * Reconcile photos: just rebuild _PHOTOS.json (same as reconcileSlot)
 */
export async function reconcilePhotos(slotPath: string): Promise<ReconcileResult> {
  return reconcileSlot(slotPath);
}
