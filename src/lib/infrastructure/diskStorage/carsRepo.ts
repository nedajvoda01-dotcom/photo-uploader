/**
 * Disk Storage: Cars Repository
 * Manages car data using only Yandex Disk (no database)
 * 
 * Storage Structure:
 * - Car metadata: {carRoot}/_CAR.json
 * - Slot locks: {slotPath}/_LOCK.json
 * - Links: {carRoot}/_LINKS.json
 * - Published URLs: {slotPath}/_PUBLISHED.json
 * - Used markers: {slotPath}/_USED.json
 */

import { 
  getRegionPath, 
  carRoot, 
  getAllSlotPaths,
  getLockMarkerPath,
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

export interface Car {
  region: string;
  make: string;
  model: string;
  vin: string;
  disk_root_path: string;
  created_by?: string | null;
  created_at?: string;
}

export interface CarWithProgress extends Car {
  total_slots: number;
  locked_slots: number;
  empty_slots: number;
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
}

export interface Link {
  id: string; // Generated UUID
  title: string;
  url: string;
  created_by?: string;
  created_at: string;
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
    return JSON.parse(content);
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
 */
async function getSlotStats(slotPath: string): Promise<{ fileCount: number; totalSizeMB: number }> {
  try {
    // Try to read from _LOCK.json first
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
        } catch (parseError) {
          // Fall through to listing
        }
      }
    }
    
    // Fallback: list folder and calculate
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
  } catch (error) {
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
 * Check if slot is marked as used
 */
async function isSlotUsed(slotPath: string): Promise<boolean> {
  try {
    return await exists(`${slotPath}/_USED.json`);
  } catch (error) {
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
        });
      }
    }
  } catch (error) {
    console.error(`Error getting car slots from ${carRootPath}:`, error);
  }
  
  return slots;
}

/**
 * List all cars in a region
 */
export async function listCarsByRegion(region: string): Promise<CarWithProgress[]> {
  const cars: CarWithProgress[] = [];
  
  try {
    const regionPath = getRegionPath(region);
    
    // List car folders in the region
    const carsResult = await listFolder(regionPath);
    if (!carsResult.success || !carsResult.items) {
      console.log(`[DiskStorage] No cars found in region ${region}`);
      return cars;
    }
    
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
      
      // Get slot statistics
      const slots = await getCarSlots(carRootPath);
      const totalSlots = slots.length;
      const lockedSlots = slots.filter(s => s.locked).length;
      const emptySlots = totalSlots - lockedSlots;
      
      cars.push({
        region,
        make,
        model,
        vin,
        disk_root_path: carRootPath,
        created_by: metadata?.created_by || null,
        created_at: metadata?.created_at || undefined, // undefined signals no metadata available
        total_slots: totalSlots,
        locked_slots: lockedSlots,
        empty_slots: emptySlots,
      });
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
  
  // Create all slot folders
  const slotPaths = getAllSlotPaths(region, make, model, vin);
  for (const slot of slotPaths) {
    await createFolder(slot.path);
  }
  
  return {
    region,
    make,
    model,
    vin,
    disk_root_path: rootPath,
    created_by: created_by || null,
    created_at: metadata.created_at,
  };
}

/**
 * Get car with all slots
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
    
    const slots = await getCarSlots(car.disk_root_path);
    
    return { car, slots };
  } catch (error) {
    console.error(`[DiskStorage] Error getting car with slots ${region}/${vin}:`, error);
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
