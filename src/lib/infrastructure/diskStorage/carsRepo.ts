/**
 * Disk Storage: Cars Repository
 * Manages car data using only Yandex Disk (no database)
 * 
 * Storage Structure:
 * - Region index: {regionPath}/_REGION.json (list of cars)
 * - Car metadata: {carRoot}/_CAR.json
 * - Photo index: {slotPath}/_PHOTOS.json (SSOT with version, limit)
 * - Slot stats: {slotPath}/_SLOT.json (count, cover, updated_at)
 * - Slot locks: {slotPath}/_LOCK.json
 * - Links: {carRoot}/_LINKS.json
 * - Published URLs: {slotPath}/_PUBLISHED.json
 * - Used markers: {slotPath}/_USED.json (legacy)
 */

import { 
  getRegionPath, 
  carRoot, 
  getAllSlotPaths,
  normalizeDiskPath,
  type SlotType 
} from "@/lib/domain/disk/paths";
import { 
  listFolder, 
  exists, 
  downloadFile, 
  uploadText,
  createFolder,
  deleteFile
} from "@/lib/infrastructure/yandexDisk/client";
import { MAX_PHOTOS_PER_SLOT } from "@/lib/config/disk";

/**
 * Expected total number of slot folders per car
 * 1 dealer + 8 buyout + 5 dummies = 14 total
 */
const EXPECTED_SLOT_COUNT = 14;

export interface Car {
  region: string;
  make: string;
  model: string;
  vin: string;
  disk_root_path: string;
  created_by?: string | null;
  /**
   * Created timestamp from _CAR.json metadata.
   * Undefined indicates no metadata file was found on disk.
   */
  created_at?: string;
}

export interface CarWithProgress extends Car {
  total_slots: number;
  locked_slots: number;
  empty_slots: number;
  /**
   * Indicates whether slot counts have been loaded.
   * When false, total_slots/locked_slots/empty_slots may be 0 or estimates.
   */
  counts_loaded?: boolean;
}

export interface Slot {
  slot_type: SlotType;
  slot_index: number;
  disk_slot_path: string;
  locked: boolean;
  file_count: number;
  total_size_mb: number;
  public_url?: string;
  is_used?: boolean;
  /**
   * Indicates whether the slot stats have been loaded from disk.
   * When false, file_count and total_size_mb are placeholder values (0).
   */
  stats_loaded?: boolean;
}

export interface Link {
  id: string; // Generated UUID
  title: string;
  url: string;
  created_by?: string;
  created_at: string;
}

/**
 * Photo item in _PHOTOS.json index
 */
export interface PhotoItem {
  name: string;
  size: number;
  modified: string; // ISO timestamp
}

/**
 * Photo index for a slot (_PHOTOS.json)
 * Hard limit: MAX_PHOTOS_PER_SLOT (40) photos per slot
 * This is the SSOT (Single Source of Truth) for slot photo metadata
 */
export interface PhotoIndex {
  version: number; // Schema version for future compatibility
  updatedAt: string; // ISO timestamp
  count: number;
  limit: number; // Hard limit (40 photos per slot)
  cover: string | null; // First photo filename or null if empty
  items: PhotoItem[];
}

/**
 * Parse car folder name to extract make, model, and VIN
 * Format: "<Make> <Model> <VIN>"
 * Example: "Toyota Camry 1HGBH41JXMN109186"
 */
function parseCarFolderName(folderName: string): { make: string; model: string; vin: string } | null {
  const parts = folderName.trim();
  
  // VIN is always the last 17 characters (alphanumeric)
  const vinMatch = parts.match(/([A-HJ-NPR-Z0-9]{17})$/i);
  if (!vinMatch) {
    return null;
  }
  
  const vin = vinMatch[1];
  const makeModel = parts.substring(0, parts.length - 17).trim();
  
  // Split make and model (assume first word is make, rest is model)
  const spaceIndex = makeModel.indexOf(' ');
  if (spaceIndex === -1) {
    return null;
  }
  
  const make = makeModel.substring(0, spaceIndex);
  const model = makeModel.substring(spaceIndex + 1);
  
  return { make, model, vin };
}

/**
 * Read car metadata from _CAR.json file
 * Repairs paths on read if they contain spaces around slashes
 */
async function readCarMetadata(carRootPath: string): Promise<Partial<Car> | null> {
  try {
    const metadataPath = `${carRootPath}/_CAR.json`;
    const metadataExists = await exists(metadataPath);
    
    if (!metadataExists) {
      return null;
    }
    
    const result = await downloadFile(metadataPath);
    if (!result.success || !result.data) {
      return null;
    }
    
    const content = result.data.toString('utf-8');
    const metadata = JSON.parse(content);
    
    // Repair-on-read: normalize disk_root_path if present
    let needsRepair = false;
    if (metadata.disk_root_path && typeof metadata.disk_root_path === 'string') {
      const originalPath = metadata.disk_root_path;
      try {
        const normalized = normalizeDiskPath(originalPath);
        if (normalized !== originalPath) {
          console.log(`[DiskStorage] Repairing path in _CAR.json: "${originalPath}" → "${normalized}"`);
          metadata.disk_root_path = normalized;
          needsRepair = true;
        }
      } catch (error) {
        console.warn(`[DiskStorage] Failed to normalize path in _CAR.json: ${originalPath}`, error);
      }
    }
    
    // Write back if we made repairs
    if (needsRepair) {
      try {
        await uploadText(metadataPath, metadata);
        console.log(`[DiskStorage] Repaired _CAR.json at ${metadataPath}`);
      } catch (error) {
        console.error(`[DiskStorage] Failed to write repaired _CAR.json:`, error);
        // Continue - we still return the corrected metadata
      }
    }
    
    return metadata;
  } catch (error) {
    console.error(`Error reading car metadata from ${carRootPath}:`, error);
    return null;
  }
}

/**
 * Parse slot folder name to extract slot type and index
 */
function parseSlotTypeFolderName(folderName: string): { slotType: SlotType; number: number } | null {
  const match = folderName.match(/^(\d+)\.\s*(.+)$/);
  if (!match) {
    return null;
  }
  
  const number = parseInt(match[1]);
  const name = match[2].trim();
  
  // Map Russian names to slot types
  const typeMap: Record<string, SlotType> = {
    'Дилер фото': 'dealer',
    'Выкуп фото': 'buyout',
    'Муляги фото': 'dummies',
  };
  
  const slotType = typeMap[name];
  if (!slotType) {
    return null;
  }
  
  return { slotType, number };
}

/**
 * Parse slot subfolder name to extract index
 */
function parseSlotSubfolderName(folderName: string, slotType: string): number | null {
  if (slotType === 'dealer') {
    return 1;
  }
  
  const match = folderName.match(/^(\d+)\.\s+/);
  if (!match) {
    return null;
  }
  
  return parseInt(match[1]);
}

/**
 * Check if a slot is locked
 */
async function isSlotLocked(slotPath: string): Promise<boolean> {
  try {
    return await exists(`${slotPath}/_LOCK.json`);
  } catch (error) {
    console.error(`Error checking lock for ${slotPath}:`, error);
    return false;
  }
}

/**
 * Get slot statistics (file count and size)
 * Optimization: Tries to read cached stats from _PHOTOS.json first, then _SLOT.json
 * If not available, lists folder and writes stats to _SLOT.json for future use
 */
async function getSlotStats(slotPath: string): Promise<{ fileCount: number; totalSizeMB: number }> {
  try {
    // Priority 1: Try to read from _PHOTOS.json (most detailed index)
    const photosIndex = await readPhotosIndex(slotPath);
    if (photosIndex && photosIndex.count !== undefined) {
      const totalSizeBytes = photosIndex.items.reduce((sum, item) => sum + item.size, 0);
      const totalSizeMB = totalSizeBytes / (1024 * 1024);
      return {
        fileCount: photosIndex.count,
        totalSizeMB: totalSizeMB,
      };
    }
    
    // Priority 2: Try to read from _SLOT.json (stats cache)
    const slotJsonPath = `${slotPath}/_SLOT.json`;
    const slotJsonExists = await exists(slotJsonPath);
    
    if (slotJsonExists) {
      const slotFile = await downloadFile(slotJsonPath);
      if (slotFile.success && slotFile.data) {
        try {
          const slotContent = slotFile.data.toString('utf-8');
          const slotData = JSON.parse(slotContent);
          
          // Use stats from _SLOT.json if available
          if (slotData.count !== undefined) {
            const totalSizeMB = slotData.total_size_mb || 0;
            return {
              fileCount: slotData.count,
              totalSizeMB: totalSizeMB,
            };
          }
        } catch {
          // Fall through to next method
        }
      }
    }
    
    // Priority 3: Try to read from _LOCK.json (legacy fallback)
    const lockPath = `${slotPath}/_LOCK.json`;
    const lockExists = await exists(lockPath);
    
    if (lockExists) {
      const lockFile = await downloadFile(lockPath);
      if (lockFile.success && lockFile.data) {
        try {
          const lockContent = lockFile.data.toString('utf-8');
          const lockData = JSON.parse(lockContent);
          
          if (lockData.file_count !== undefined && lockData.total_size_mb !== undefined) {
            return {
              fileCount: lockData.file_count,
              totalSizeMB: lockData.total_size_mb,
            };
          }
        } catch {
          // Fall through to listing
        }
      }
    }
    
    // Fallback: list folder and calculate (expensive operation)
    const result = await listFolder(slotPath);
    if (!result.success || !result.items) {
      return { fileCount: 0, totalSizeMB: 0 };
    }
    
    const files = result.items.filter(item => 
      item.type === 'file' && !item.name.startsWith('_')
    );
    
    const fileCount = files.length;
    const totalSizeBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024);
    
    // Write stats to _SLOT.json for future use (fire and forget)
    try {
      const cover = files.length > 0 ? files[0].name : null;
      const statsData = {
        count: fileCount,
        cover: cover,
        total_size_mb: totalSizeMB,
        updated_at: new Date().toISOString(),
      };
      await uploadText(slotJsonPath, statsData);
    } catch (error) {
      // Don't fail if we can't write stats
      console.warn(`Failed to write stats cache to ${slotJsonPath}:`, error);
    }
    
    return { fileCount, totalSizeMB };
  } catch (error) {
    console.error(`Error getting slot stats for ${slotPath}:`, error);
    return { fileCount: 0, totalSizeMB: 0 };
  }
}

/**
 * Read published URL from _PUBLISHED.json
 */
async function readPublishedUrl(slotPath: string): Promise<string | undefined> {
  try {
    const publishedPath = `${slotPath}/_PUBLISHED.json`;
    const publishedExists = await exists(publishedPath);
    
    if (!publishedExists) {
      return undefined;
    }
    
    const result = await downloadFile(publishedPath);
    if (!result.success || !result.data) {
      return undefined;
    }
    
    const content = result.data.toString('utf-8');
    const data = JSON.parse(content);
    return data.public_url;
  } catch {
    return undefined;
  }
}

/**
 * Write published URL to _PUBLISHED.json
 */
async function writePublishedUrl(slotPath: string, publicUrl: string): Promise<boolean> {
  try {
    const publishedPath = `${slotPath}/_PUBLISHED.json`;
    const data = {
      public_url: publicUrl,
      published_at: new Date().toISOString(),
    };
    
    const result = await uploadText(publishedPath, data);
    return result.success;
  } catch (error) {
    console.error(`Error writing published URL to ${slotPath}:`, error);
    return false;
  }
}

/**
 * Update _SLOT.json and _PHOTOS.json with current stats
 * Call this synchronously after every upload/delete operation
 * Keeps both indexes consistent
 */
export async function updateSlotStats(slotPath: string): Promise<boolean> {
  try {
    // List folder to get current files
    const result = await listFolder(slotPath);
    if (!result.success || !result.items) {
      return false;
    }
    
    const files = result.items.filter(item => 
      item.type === 'file' && !item.name.startsWith('_')
    );
    
    const fileCount = files.length;
    const totalSizeBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024);
    const cover = files.length > 0 ? files[0].name : null;
    const now = new Date().toISOString();
    
    // Write _SLOT.json
    const slotJsonPath = `${slotPath}/_SLOT.json`;
    const statsData = {
      count: fileCount,
      cover: cover,
      total_size_mb: totalSizeMB,
      updated_at: now,
    };
    
    const slotUploadResult = await uploadText(slotJsonPath, statsData);
    
    // Write _PHOTOS.json to keep consistent
    const photosJsonPath = `${slotPath}/_PHOTOS.json`;
    const photoItems: PhotoItem[] = files.map(file => ({
      name: file.name,
      size: file.size || 0,
      modified: now,
    }));
    
    const photosData: PhotoIndex = {
      version: 1,
      updatedAt: now,
      count: fileCount,
      limit: MAX_PHOTOS_PER_SLOT,
      cover: cover,
      items: photoItems,
    };
    
    const photosUploadResult = await uploadText(photosJsonPath, photosData);
    
    return slotUploadResult.success && photosUploadResult.success;
  } catch (error) {
    console.error(`Error updating slot stats at ${slotPath}:`, error);
    return false;
  }
}

/**
 * Read _PHOTOS.json index from slot
 * Returns null if file doesn't exist or is invalid
 * Validates JSON schema and auto-rebuilds if broken
 */
async function readPhotosIndex(slotPath: string): Promise<PhotoIndex | null> {
  try {
    const photosIndexPath = `${slotPath}/_PHOTOS.json`;
    const indexExists = await exists(photosIndexPath);
    
    if (!indexExists) {
      return null;
    }
    
    const result = await downloadFile(photosIndexPath);
    if (!result.success || !result.data) {
      return null;
    }
    
    const content = result.data.toString('utf-8');
    const indexData = JSON.parse(content) as PhotoIndex;
    
    // JSON schema validation
    const isValid = validatePhotosIndexSchema(indexData);
    if (!isValid) {
      console.warn(`[PhotoIndex] Invalid _PHOTOS.json schema at ${slotPath}, rebuilding...`);
      // Auto-rebuild broken JSON
      return await rebuildPhotosIndex(slotPath);
    }
    
    return indexData;
  } catch (error) {
    console.error(`[PhotoIndex] Error reading _PHOTOS.json from ${slotPath}:`, error);
    // Auto-rebuild on parse error
    console.log(`[PhotoIndex] Attempting to rebuild due to error...`);
    return await rebuildPhotosIndex(slotPath);
  }
}

/**
 * Validate PhotoIndex JSON schema
 * Returns true if valid, false otherwise
 */
function validatePhotosIndexSchema(data: any): data is PhotoIndex {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  // Required fields with correct types
  if (typeof data.version !== 'number' || data.version < 1) {
    return false;
  }
  
  if (typeof data.count !== 'number' || data.count < 0) {
    return false;
  }
  
  if (typeof data.limit !== 'number' || data.limit !== MAX_PHOTOS_PER_SLOT) {
    return false;
  }
  
  if (typeof data.updatedAt !== 'string' || !data.updatedAt) {
    return false;
  }
  
  if (data.cover !== null && typeof data.cover !== 'string') {
    return false;
  }
  
  if (!Array.isArray(data.items)) {
    return false;
  }
  
  // Validate each item
  for (const item of data.items) {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    if (typeof item.name !== 'string' || !item.name) {
      return false;
    }
    if (typeof item.size !== 'number' || item.size < 0) {
      return false;
    }
    if (typeof item.modified !== 'string' || !item.modified) {
      return false;
    }
  }
  
  // Consistency check: count should match items.length
  if (data.count !== data.items.length) {
    return false;
  }
  
  return true;
}

/**
 * Rebuild _PHOTOS.json from disk by listing folder
 * Used when index is missing or corrupted
 */
async function rebuildPhotosIndex(slotPath: string): Promise<PhotoIndex | null> {
  try {
    console.log(`[PhotoIndex] Rebuilding _PHOTOS.json for ${slotPath}`);
    
    const result = await listFolder(slotPath);
    if (!result.success || !result.items) {
      console.error(`[PhotoIndex] Failed to list folder for rebuild: ${slotPath}`);
      return null;
    }
    
    const photos = result.items.filter(item => 
      item.type === 'file' && !item.name.startsWith('_')
    );
    
    const now = new Date().toISOString();
    const items: PhotoItem[] = photos.map(photo => ({
      name: photo.name,
      size: photo.size || 0,
      modified: now, // Use current time since Yandex API doesn't return modified date in list
    }));
    
    const index: PhotoIndex = {
      version: 1,
      updatedAt: now,
      count: items.length,
      limit: MAX_PHOTOS_PER_SLOT,
      cover: items.length > 0 ? items[0].name : null,
      items: items,
    };
    
    // Write the rebuilt index
    const photosIndexPath = `${slotPath}/_PHOTOS.json`;
    const uploadResult = await uploadText(photosIndexPath, index);
    
    if (!uploadResult.success) {
      console.error(`[PhotoIndex] Failed to write rebuilt index: ${slotPath}`);
      return null;
    }
    
    console.log(`[PhotoIndex] Successfully rebuilt _PHOTOS.json for ${slotPath} (${items.length} photos)`);
    return index;
  } catch (error) {
    console.error(`[PhotoIndex] Error rebuilding _PHOTOS.json for ${slotPath}:`, error);
    return null;
  }
}

/**
 * Write _PHOTOS.json index to slot
 * Uses read-merge-write pattern for concurrency safety
 */
export async function writePhotosIndex(slotPath: string, newPhotos: PhotoItem[]): Promise<boolean> {
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Read current index
      let currentIndex = await readPhotosIndex(slotPath);
      
      // If no index exists, rebuild from disk first
      if (!currentIndex) {
        currentIndex = await rebuildPhotosIndex(slotPath);
      }
      
      // Merge: Add new photos to existing items
      const existingItems = currentIndex?.items || [];
      const existingNames = new Set(existingItems.map(p => p.name));
      
      // Filter out duplicates and add new photos
      const newItems = newPhotos.filter(p => !existingNames.has(p.name));
      const allItems = [...existingItems, ...newItems];
      
      // Create updated index
      const updatedIndex: PhotoIndex = {
        version: 1,
        updatedAt: new Date().toISOString(),
        count: allItems.length,
        limit: MAX_PHOTOS_PER_SLOT,
        cover: allItems.length > 0 ? allItems[0].name : null,
        items: allItems,
      };
      
      // Write back
      const photosIndexPath = `${slotPath}/_PHOTOS.json`;
      const uploadResult = await uploadText(photosIndexPath, updatedIndex);
      
      if (uploadResult.success) {
        console.log(`[PhotoIndex] Successfully updated _PHOTOS.json at ${slotPath} (attempt ${attempt})`);
        return true;
      }
      
      throw new Error(`Upload failed: ${uploadResult.error}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[PhotoIndex] Write attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
      
      if (attempt < MAX_RETRIES) {
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
  }
  
  console.error(`[PhotoIndex] Failed to write _PHOTOS.json after ${MAX_RETRIES} attempts:`, lastError);
  return false;
}

/**
 * Get current photo count in slot
 * Uses _PHOTOS.json if available, falls back to rebuild
 */
export async function getPhotoCount(slotPath: string): Promise<number> {
  try {
    // Try reading from _PHOTOS.json first
    let index = await readPhotosIndex(slotPath);
    
    // If not available or invalid, rebuild
    if (!index) {
      index = await rebuildPhotosIndex(slotPath);
    }
    
    return index?.count || 0;
  } catch (error) {
    console.error(`[PhotoIndex] Error getting photo count for ${slotPath}:`, error);
    return 0;
  }
}

/**
 * Check if slot has reached photo limit
 */
export async function checkPhotoLimit(slotPath: string, additionalPhotos: number = 0): Promise<{
  isAtLimit: boolean;
  currentCount: number;
  maxPhotos: number;
}> {
  // Import MAX_PHOTOS_PER_SLOT locally to avoid circular dependency
  const { MAX_PHOTOS_PER_SLOT } = await import('@/lib/config/index');
  
  const currentCount = await getPhotoCount(slotPath);
  const totalCount = currentCount + additionalPhotos;
  
  return {
    isAtLimit: totalCount > MAX_PHOTOS_PER_SLOT,
    currentCount,
    maxPhotos: MAX_PHOTOS_PER_SLOT,
  };
}

/**
 * Check if slot is marked as used
 */
async function isSlotUsed(slotPath: string): Promise<boolean> {
  try {
    return await exists(`${slotPath}/_USED.json`);
  } catch {
    return false;
  }
}

/**
 * Mark slot as used
 */
export async function markSlotAsUsed(slotPath: string, usedBy: string): Promise<boolean> {
  try {
    const usedPath = `${slotPath}/_USED.json`;
    const data = {
      used: true,
      used_by: usedBy,
      used_at: new Date().toISOString(),
    };
    
    const result = await uploadText(usedPath, data);
    return result.success;
  } catch (error) {
    console.error(`Error marking slot as used at ${slotPath}:`, error);
    return false;
  }
}

/**
 * Unmark slot as used
 */
export async function unmarkSlotAsUsed(slotPath: string): Promise<boolean> {
  try {
    const usedPath = `${slotPath}/_USED.json`;
    const result = await deleteFile(usedPath);
    return result.success;
  } catch (error) {
    console.error(`Error unmarking slot as used at ${slotPath}:`, error);
    return false;
  }
}

/**
 * Get all slots for a car with their status
 */
async function getCarSlots(carRootPath: string): Promise<Slot[]> {
  const slots: Slot[] = [];
  
  try {
    // List slot type folders
    const slotTypesResult = await listFolder(carRootPath);
    if (!slotTypesResult.success || !slotTypesResult.items) {
      return slots;
    }
    
    for (const slotTypeFolder of slotTypesResult.items) {
      if (slotTypeFolder.type !== 'dir') {
        continue;
      }
      
      const slotTypeInfo = parseSlotTypeFolderName(slotTypeFolder.name);
      if (!slotTypeInfo) {
        continue;
      }
      
      const { slotType } = slotTypeInfo;
      
      // List slot subfolders
      const slotsResult = await listFolder(slotTypeFolder.path);
      if (!slotsResult.success || !slotsResult.items) {
        continue;
      }
      
      for (const slotFolder of slotsResult.items) {
        if (slotFolder.type !== 'dir') {
          continue;
        }
        
        const slotIndex = parseSlotSubfolderName(slotFolder.name, slotType);
        if (!slotIndex) {
          continue;
        }
        
        const locked = await isSlotLocked(slotFolder.path);
        const stats = await getSlotStats(slotFolder.path);
        const publicUrl = await readPublishedUrl(slotFolder.path);
        const isUsed = await isSlotUsed(slotFolder.path);
        
        slots.push({
          slot_type: slotType,
          slot_index: slotIndex,
          disk_slot_path: slotFolder.path,
          locked,
          file_count: stats.fileCount,
          total_size_mb: Math.round(stats.totalSizeMB * 100) / 100,
          public_url: publicUrl,
          is_used: isUsed,
          stats_loaded: true,
        });
      }
    }
  } catch (error) {
    console.error(`Error getting car slots from ${carRootPath}:`, error);
  }
  
  return slots;
}

/**
 * Read region index from _REGION.json
 * Returns list of cars in the region without folder scanning
 */
async function readRegionIndex(regionPath: string): Promise<Car[] | null> {
  try {
    const regionIndexPath = `${regionPath}/_REGION.json`;
    const indexExists = await exists(regionIndexPath);
    
    if (!indexExists) {
      return null;
    }
    
    const result = await downloadFile(regionIndexPath);
    if (!result.success || !result.data) {
      return null;
    }
    
    const content = result.data.toString('utf-8');
    const indexData = JSON.parse(content);
    
    return indexData.cars || null;
  } catch (error) {
    console.error(`Error reading region index from ${regionPath}:`, error);
    return null;
  }
}

/**
 * Write region index to _REGION.json
 * Updates the list of cars in the region
 */
async function writeRegionIndex(regionPath: string, cars: Car[]): Promise<boolean> {
  try {
    const regionIndexPath = `${regionPath}/_REGION.json`;
    const indexData = {
      cars: cars,
      updated_at: new Date().toISOString(),
    };
    
    const result = await uploadText(regionIndexPath, indexData);
    return result.success;
  } catch (error) {
    console.error(`Error writing region index to ${regionPath}:`, error);
    return false;
  }
}

/**
 * Phase 1: Build slot structure deterministically without scanning disk
 * Creates placeholder slots based on known structure (1 dealer + 8 buyout + 5 dummies)
 * No API calls to check slot status - stats must be loaded separately
 */
function buildDeterministicSlots(carRootPath: string, region: string, make: string, model: string, vin: string): Slot[] {
  const slots: Slot[] = [];
  
  // Use getAllSlotPaths to get deterministic paths
  const slotPaths = getAllSlotPaths(region, make, model, vin);
  
  for (const slotInfo of slotPaths) {
    slots.push({
      slot_type: slotInfo.slotType,
      slot_index: slotInfo.slotIndex,
      disk_slot_path: slotInfo.path,
      locked: false, // Unknown - will be loaded on demand
      file_count: 0, // Unknown - will be loaded on demand
      total_size_mb: 0, // Unknown - will be loaded on demand
      stats_loaded: false, // Signal that stats need to be loaded separately
    });
  }
  
  return slots;
}

/**
 * List all cars in a region
 * Phase 0 optimization: Tries to read from _REGION.json first, falls back to folder listing
 * Does NOT scan slots - returns with counts_loaded=false
 * This reduces API calls from ~14+ per car to ~1 per region
 */
export async function listCarsByRegion(region: string): Promise<CarWithProgress[]> {
  const cars: CarWithProgress[] = [];
  
  try {
    const regionPath = getRegionPath(region);
    
    // Try to read from _REGION.json first
    const indexedCars = await readRegionIndex(regionPath);
    
    if (indexedCars && indexedCars.length > 0) {
      // Use indexed data - very fast, no folder scanning
      console.log(`[DiskStorage] Using _REGION.json index for region ${region}, found ${indexedCars.length} cars`);
      
      for (const car of indexedCars) {
        cars.push({
          region: car.region,
          make: car.make,
          model: car.model,
          vin: car.vin,
          disk_root_path: car.disk_root_path,
          created_by: car.created_by || null,
          created_at: car.created_at || undefined,
          total_slots: EXPECTED_SLOT_COUNT,
          locked_slots: 0, // Unknown - will be loaded on demand
          empty_slots: EXPECTED_SLOT_COUNT,
          counts_loaded: false,
        });
      }
      
      return cars;
    }
    
    // Fallback: List car folders in the region (slower)
    console.log(`[DiskStorage] _REGION.json not found or empty, falling back to folder listing for region ${region}`);
    const carsResult = await listFolder(regionPath);
    if (!carsResult.success || !carsResult.items) {
      console.log(`[DiskStorage] No cars found in region ${region}`);
      return cars;
    }
    
    const scannedCars: Car[] = [];
    
    for (const carFolder of carsResult.items) {
      if (carFolder.type !== 'dir') {
        continue;
      }
      
      // Parse car folder name
      const carInfo = parseCarFolderName(carFolder.name);
      if (!carInfo) {
        console.warn(`[DiskStorage] Could not parse car folder name: ${carFolder.name}`);
        continue;
      }
      
      const { make, model, vin } = carInfo;
      const carRootPath = carFolder.path;
      
      // Read metadata if available (use fallback if not present)
      const metadata = await readCarMetadata(carRootPath);
      
      const carData: Car = {
        region,
        make,
        model,
        vin,
        disk_root_path: carRootPath,
        created_by: metadata?.created_by || null,
        created_at: metadata?.created_at || undefined,
      };
      
      scannedCars.push(carData);
      
      // Phase 0: Do NOT scan slots - return with counts_loaded=false
      // This avoids 14+ API calls per car
      cars.push({
        ...carData,
        total_slots: EXPECTED_SLOT_COUNT, // Known deterministic count (1+8+5=14)
        locked_slots: 0, // Unknown - will be loaded on demand
        empty_slots: EXPECTED_SLOT_COUNT, // Assume all empty until loaded
        counts_loaded: false, // Signal that counts need to be loaded separately
      });
    }
    
    // Write _REGION.json for future use (fire and forget)
    if (scannedCars.length > 0) {
      writeRegionIndex(regionPath, scannedCars).catch(err => 
        console.warn(`Failed to write region index for ${region}:`, err)
      );
    }
  } catch (error) {
    console.error(`[DiskStorage] Error listing cars in region ${region}:`, error);
  }
  
  return cars;
}

/**
 * Get car by region and VIN
 */
export async function getCarByRegionAndVin(region: string, vin: string): Promise<Car | null> {
  try {
    const regionPath = getRegionPath(region);
    const carsResult = await listFolder(regionPath);
    
    if (!carsResult.success || !carsResult.items) {
      return null;
    }
    
    // Find car folder matching VIN
    for (const carFolder of carsResult.items) {
      if (carFolder.type !== 'dir') {
        continue;
      }
      
      const carInfo = parseCarFolderName(carFolder.name);
      if (!carInfo) {
        continue;
      }
      
      if (carInfo.vin.toUpperCase() === vin.toUpperCase()) {
        const metadata = await readCarMetadata(carFolder.path);
        
        return {
          region,
          make: carInfo.make,
          model: carInfo.model,
          vin: carInfo.vin,
          disk_root_path: carFolder.path,
          created_by: metadata?.created_by || null,
          created_at: metadata?.created_at || undefined, // undefined signals no metadata available
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[DiskStorage] Error getting car ${region}/${vin}:`, error);
    return null;
  }
}

/**
 * Create a new car
 */
/**
 * Add car to region index
 * Updates _REGION.json to include the new car
 */
async function addCarToRegionIndex(region: string, car: Car): Promise<void> {
  try {
    const regionPath = getRegionPath(region);
    
    // Read existing index
    let cars = await readRegionIndex(regionPath);
    if (!cars) {
      cars = [];
    }
    
    // Check if car already exists (by VIN)
    const existingIndex = cars.findIndex(c => c.vin === car.vin);
    if (existingIndex >= 0) {
      // Update existing car
      cars[existingIndex] = car;
    } else {
      // Add new car
      cars.push(car);
    }
    
    // Write updated index
    await writeRegionIndex(regionPath, cars);
  } catch (error) {
    console.error(`Error adding car to region index:`, error);
    // Don't throw - this is best-effort caching
  }
}

/**
 * Remove car from region index
 * Updates _REGION.json to remove the car
 */
export async function removeCarFromRegionIndex(region: string, vin: string): Promise<void> {
  try {
    const regionPath = getRegionPath(region);
    
    // Read existing index
    let cars = await readRegionIndex(regionPath);
    if (!cars) {
      return;
    }
    
    // Filter out the car
    cars = cars.filter(c => c.vin !== vin);
    
    // Write updated index
    await writeRegionIndex(regionPath, cars);
  } catch (error) {
    console.error(`Error removing car from region index:`, error);
    // Don't throw - this is best-effort caching
  }
}

export async function createCar(params: {
  region: string;
  make: string;
  model: string;
  vin: string;
  created_by?: string | null;
}): Promise<Car> {
  const { region, make, model, vin, created_by } = params;
  
  const rootPath = carRoot(region, make, model, vin);
  
  // Create car root folder
  const rootFolderResult = await createFolder(rootPath);
  if (!rootFolderResult.success) {
    throw new Error(`Failed to create car folder: ${rootFolderResult.error}`);
  }
  
  // Create car metadata file
  const metadata = {
    region,
    make,
    model,
    vin,
    created_at: new Date().toISOString(),
    created_by: created_by || null,
  };
  
  await uploadText(`${rootPath}/_CAR.json`, metadata);
  
  // Create intermediate parent folders FIRST
  // These are required for getCarSlots() to scan properly
  const intermediateFolders = [
    `${rootPath}/1. Дилер фото`,
    `${rootPath}/2. Выкуп фото`,
    `${rootPath}/3. Муляги фото`
  ];
  
  console.log(`[DiskStorage] Creating ${intermediateFolders.length} intermediate folders for car ${rootPath}`);
  
  for (const folder of intermediateFolders) {
    const result = await createFolder(folder);
    if (!result.success) {
      const errorMsg = `Failed to create intermediate folder: ${folder} - ${result.error}`;
      console.error(`[DiskStorage] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    console.log(`[DiskStorage] Created intermediate folder: ${folder}`);
  }
  
  // Create all slot folders (1 dealer + 8 buyout + 5 dummies = 14 total)
  const slotPaths = getAllSlotPaths(region, make, model, vin);
  
  console.log(`[DiskStorage] Creating ${slotPaths.length} slot folders for car ${rootPath}`);
  
  for (const slot of slotPaths) {
    const slotResult = await createFolder(slot.path);
    
    if (!slotResult.success) {
      // If slot creation failed, throw error with details
      const errorMsg = `Failed to create slot ${slot.slotType}[${slot.slotIndex}] at ${slot.path}: ${slotResult.error}`;
      console.error(`[DiskStorage] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // Log successful slot creation
    console.log(`[DiskStorage] Created slot: ${slot.slotType}[${slot.slotIndex}] at ${slot.path}`);
  }
  
  // Verify all slots were created by scanning
  console.log(`[DiskStorage] Verifying all slots were created for ${rootPath}`);
  const createdSlots = await getCarSlots(rootPath);
  
  if (createdSlots.length !== EXPECTED_SLOT_COUNT) {
    const errorMsg = `Expected ${EXPECTED_SLOT_COUNT} slots but found ${createdSlots.length} after creation. Car: ${rootPath}`;
    console.error(`[DiskStorage] ${errorMsg}`);
    console.error(`[DiskStorage] Created slots:`, createdSlots.map(s => `${s.slot_type}[${s.slot_index}]`).join(', '));
    throw new Error(errorMsg);
  }
  
  console.log(`[DiskStorage] Successfully created car with all ${createdSlots.length}/${EXPECTED_SLOT_COUNT} slots: ${rootPath}`);
  
  // Update region index
  const carData: Car = {
    region,
    make,
    model,
    vin,
    disk_root_path: rootPath,
    created_by: created_by || null,
    created_at: metadata.created_at,
  };
  
  await addCarToRegionIndex(region, carData);
  
  return carData;
}

/**
 * Get car with all slots
 * Phase 1 optimization: Builds slot structure deterministically without scanning
 * Slots returned with stats_loaded=false, must call loadCarSlotCounts separately
 */
export async function getCarWithSlots(region: string, vin: string): Promise<{
  car: Car;
  slots: Slot[];
} | null> {
  try {
    const car = await getCarByRegionAndVin(region, vin);
    if (!car) {
      return null;
    }
    
    // Phase 1: Build slots deterministically (O(1) API calls)
    const slots = buildDeterministicSlots(car.disk_root_path, region, car.make, car.model, car.vin);
    
    return { car, slots };
  } catch (error) {
    console.error(`[DiskStorage] Error getting car with slots ${region}/${vin}:`, error);
    return null;
  }
}

/**
 * Phase 2: Load actual slot counts and status from disk
 * This is called separately after initial card render for lazy loading
 * Returns slots with stats_loaded=true
 */
export async function loadCarSlotCounts(region: string, vin: string): Promise<Slot[] | null> {
  try {
    const car = await getCarByRegionAndVin(region, vin);
    if (!car) {
      return null;
    }
    
    // Load full slot data with counts (this makes the disk API calls)
    const slots = await getCarSlots(car.disk_root_path);
    
    return slots;
  } catch (error) {
    console.error(`[DiskStorage] Error loading slot counts ${region}/${vin}:`, error);
    return null;
  }
}

/**
 * Get specific slot info
 */
export async function getSlot(
  carRootPath: string,
  slotType: SlotType,
  slotIndex: number
): Promise<Slot | null> {
  try {
    const slots = await getCarSlots(carRootPath);
    return slots.find(s => s.slot_type === slotType && s.slot_index === slotIndex) || null;
  } catch (error) {
    console.error(`[DiskStorage] Error getting slot ${slotType}[${slotIndex}]:`, error);
    return null;
  }
}

/**
 * Save published URL for a slot
 */
export async function savePublishedUrl(slotPath: string, publicUrl: string): Promise<boolean> {
  return writePublishedUrl(slotPath, publicUrl);
}

/**
 * Get published URL for a slot
 */
export async function getPublishedUrl(slotPath: string): Promise<string | undefined> {
  return readPublishedUrl(slotPath);
}

// ===== Links Management =====

/**
 * Read links from _LINKS.json
 */
async function readLinks(carRootPath: string): Promise<Link[]> {
  try {
    const linksPath = `${carRootPath}/_LINKS.json`;
    const linksExist = await exists(linksPath);
    
    if (!linksExist) {
      return [];
    }
    
    const result = await downloadFile(linksPath);
    if (!result.success || !result.data) {
      return [];
    }
    
    const content = result.data.toString('utf-8');
    const data = JSON.parse(content);
    return data.links || [];
  } catch (error) {
    console.error(`Error reading links from ${carRootPath}:`, error);
    return [];
  }
}

/**
 * Write links to _LINKS.json
 */
async function writeLinks(carRootPath: string, links: Link[]): Promise<boolean> {
  try {
    const linksPath = `${carRootPath}/_LINKS.json`;
    const data = {
      links,
      updated_at: new Date().toISOString(),
    };
    
    const result = await uploadText(linksPath, data);
    return result.success;
  } catch (error) {
    console.error(`Error writing links to ${carRootPath}:`, error);
    return false;
  }
}

/**
 * List all links for a car
 */
export async function listLinks(carRootPath: string): Promise<Link[]> {
  return readLinks(carRootPath);
}

/**
 * Create a new link for a car
 */
export async function createLink(
  carRootPath: string,
  title: string,
  url: string,
  createdBy?: string
): Promise<Link> {
  const links = await readLinks(carRootPath);
  
  const newLink: Link = {
    id: crypto.randomUUID(),
    title,
    url,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };
  
  links.push(newLink);
  
  await writeLinks(carRootPath, links);
  
  return newLink;
}

/**
 * Delete a link by ID
 */
export async function deleteLink(carRootPath: string, linkId: string): Promise<boolean> {
  const links = await readLinks(carRootPath);
  const filteredLinks = links.filter(link => link.id !== linkId);
  
  if (filteredLinks.length === links.length) {
    // Link not found
    return false;
  }
  
  await writeLinks(carRootPath, filteredLinks);
  return true;
}

/**
 * Find car root path by link ID across all regions
 */
export async function findCarByLinkId(regions: string[], linkId: string): Promise<{
  carRootPath: string;
  region: string;
  vin: string;
} | null> {
  for (const region of regions) {
    try {
      const regionPath = getRegionPath(region);
      const carsResult = await listFolder(regionPath);
      
      if (!carsResult.success || !carsResult.items) {
        continue;
      }
      
      for (const carFolder of carsResult.items) {
        if (carFolder.type !== 'dir') {
          continue;
        }
        
        const links = await readLinks(carFolder.path);
        if (links.some(link => link.id === linkId)) {
          const carInfo = parseCarFolderName(carFolder.name);
          if (carInfo) {
            return {
              carRootPath: carFolder.path,
              region,
              vin: carInfo.vin,
            };
          }
        }
      }
    } catch (error) {
      console.error(`Error searching links in region ${region}:`, error);
    }
  }
  
  return null;
}
