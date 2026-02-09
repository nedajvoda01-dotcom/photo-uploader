/**
 * Reconcile/Repair Utilities
 * 
 * Self-healing functions to rebuild indexes when missing or corrupted
 * Implements problem statement #5: Reconcile (самолечение)
 */

import { listFolder, downloadFile, uploadText, exists } from '@/lib/infrastructure/yandexDisk/client';
import { getRegionPath } from '@/lib/domain/disk/paths';
import { MAX_PHOTOS_PER_SLOT } from '@/lib/config/disk';
import type { PhotoIndex, PhotoItem } from './carsRepo';

export interface ReconcileResult {
  actionsPerformed: string[];
  repairedFiles: string[];
  errors: string[];
}

export type ReconcileDepth = 'slot' | 'car' | 'region';

/**
 * Unified reconcile function with depth parameter
 * 
 * @param path - Path to reconcile (slot path, car path, or region path)
 * @param depth - Reconcile depth: 'slot' | 'car' | 'region'
 * @returns ReconcileResult with actions performed, repaired files, and errors
 * 
 * Example:
 * - reconcile('/Фото/R1', 'region') - Reconcile entire region
 * - reconcile('/Фото/R1/Car1', 'car') - Reconcile car and all slots
 * - reconcile('/Фото/R1/Car1/1. Dealer photos/1', 'slot') - Reconcile single slot
 */
export async function reconcile(path: string, depth: ReconcileDepth = 'slot'): Promise<ReconcileResult> {
  switch (depth) {
    case 'slot':
      return reconcileSlot(path);
    case 'car':
      return reconcileCar(path);
    case 'region':
      // Extract region name from path
      const regionMatch = path.match(/\/Фото\/([^\/]+)/);
      const regionName = regionMatch ? regionMatch[1] : path;
      return reconcileRegion(regionName);
    default:
      return {
        actionsPerformed: [],
        repairedFiles: [],
        errors: [`Unknown depth: ${depth}`],
      };
  }
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
      version: 1, // Schema version
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
 * Reconcile a car: verify structure and rebuild slot indexes
 * Validates:
 * - _CAR.json exists and is valid
 * - Expected slot structure (1 dealer + 8 buyout + 5 dummy = 14 slots)
 * - All slot indexes are present
 */
export async function reconcileCar(carRootPath: string): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    actionsPerformed: [],
    repairedFiles: [],
    errors: [],
  };
  
  try {
    result.actionsPerformed.push(`Scanning car: ${carRootPath}`);
    
    // Check _CAR.json exists and is valid
    const carJsonPath = `${carRootPath}/_CAR.json`;
    const carJsonExists = await exists(carJsonPath);
    
    if (!carJsonExists) {
      result.errors.push(`Missing _CAR.json at ${carJsonPath}`);
      result.actionsPerformed.push(`⚠️ _CAR.json not found - car metadata missing`);
    } else {
      // Validate _CAR.json structure
      try {
        const carJsonResult = await downloadFile(carJsonPath);
        if (carJsonResult.success && carJsonResult.data) {
          const carData = JSON.parse(carJsonResult.data.toString('utf-8'));
          
          // Validate required fields
          const requiredFields = ['region', 'make', 'model', 'vin', 'disk_root_path'];
          const missingFields = requiredFields.filter(field => !carData[field]);
          
          if (missingFields.length > 0) {
            result.errors.push(`_CAR.json missing required fields: ${missingFields.join(', ')}`);
          } else {
            result.actionsPerformed.push(`✅ _CAR.json validated`);
          }
        }
      } catch (error) {
        result.errors.push(`Failed to parse _CAR.json: ${error}`);
      }
    }
    
    // List slot type folders
    const listResult = await listFolder(carRootPath);
    if (!listResult.success || !listResult.items) {
      result.errors.push(`Failed to list car folder: ${carRootPath}`);
      return result;
    }
    
    const slotTypeFolders = listResult.items.filter(item => item.type === 'dir' && !item.name.startsWith('_'));
    result.actionsPerformed.push(`Found ${slotTypeFolders.length} slot type folders`);
    
    // Count total slots across all types
    let totalSlots = 0;
    const expectedSlotStructure = {
      '1. Dealer photos': 1,
      '2. Buyout (front-back)': 8,
      '3. Dummy photos': 5,
    };
    
    // Reconcile each slot type folder
    for (const slotTypeFolder of slotTypeFolders) {
      const slotsResult = await listFolder(slotTypeFolder.path);
      if (slotsResult.success && slotsResult.items) {
        const slotFolders = slotsResult.items.filter(item => item.type === 'dir');
        totalSlots += slotFolders.length;
        
        // Check if slot count matches expected
        const expected = expectedSlotStructure[slotTypeFolder.name as keyof typeof expectedSlotStructure];
        if (expected && slotFolders.length !== expected) {
          result.actionsPerformed.push(`⚠️ ${slotTypeFolder.name}: found ${slotFolders.length} slots, expected ${expected}`);
        }
        
        for (const slotFolder of slotFolders) {
          const slotReconcile = await reconcileSlot(slotFolder.path);
          result.actionsPerformed.push(...slotReconcile.actionsPerformed);
          result.repairedFiles.push(...slotReconcile.repairedFiles);
          result.errors.push(...slotReconcile.errors);
        }
      }
    }
    
    // Validate total slot count (expected: 1 dealer + 8 buyout + 5 dummy = 14)
    const expectedTotal = 14;
    if (totalSlots !== expectedTotal) {
      result.actionsPerformed.push(`⚠️ Total slots: ${totalSlots}, expected ${expectedTotal}`);
    } else {
      result.actionsPerformed.push(`✅ Slot structure validated: ${totalSlots} slots`);
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
      version: 1, // Schema version
      count: fileCount,
      limit: MAX_PHOTOS_PER_SLOT, // Hard limit (40)
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
