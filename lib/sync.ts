/**
 * Sync module - Database as cache, Disk as truth
 * 
 * This module implements synchronization between Yandex Disk (source of truth)
 * and the database (cache). It scans the disk structure and updates the database
 * to reflect the actual state on disk.
 * 
 * Key Principles:
 * - Disk is SSOT for `locked` state (presence of _LOCK.json)
 * - Database `used` flag is business logic only
 * - Sync discovers cars and slots from disk structure
 */

import { sql } from './db';
import { getBasePath } from './diskPaths';
import { listFolder, exists } from './yandexDisk';

/**
 * Parse car folder name to extract make, model, and VIN
 * Format: "<Make> <Model> <VIN>"
 * Example: "Toyota Camry 1HGBH41JXMN109186"
 */
function parseCarFolderName(folderName: string): { make: string; model: string; vin: string } | null {
  // VIN is always the last 17 characters (alphanumeric)
  const parts = folderName.trim();
  
  // VIN should be at the end
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
 * Parse slot folder name to extract slot type and index
 * Formats:
 * - "1. Дилер фото"
 * - "2. Выкуп фото"
 * - "3. Муляги фото"
 */
function parseSlotTypeFolderName(folderName: string): { slotType: string; number: number } | null {
  const match = folderName.match(/^(\d+)\.\s*(.+)$/);
  if (!match) {
    return null;
  }
  
  const number = parseInt(match[1]);
  const name = match[2].trim();
  
  // Map Russian names to slot types
  const typeMap: Record<string, string> = {
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
 * Formats:
 * - "<Make> <Model> <VIN>" (for dealer, index is always 1)
 * - "<index>. <Make> <Model> <VIN>" (for buyout and dummies)
 */
function parseSlotSubfolderName(folderName: string, slotType: string): number | null {
  if (slotType === 'dealer') {
    // Dealer slot has no index prefix, always index 1
    return 1;
  }
  
  // For buyout and dummies, extract index from prefix
  const match = folderName.match(/^(\d+)\.\s+/);
  if (!match) {
    return null;
  }
  
  return parseInt(match[1]);
}

/**
 * Count files and calculate total size in a folder
 */
async function getSlotStats(slotPath: string): Promise<{ fileCount: number; totalSizeMB: number }> {
  try {
    const result = await listFolder(slotPath);
    if (!result.success || !result.items) {
      return { fileCount: 0, totalSizeMB: 0 };
    }
    
    // Filter to only files (not folders) and exclude _LOCK.json
    const files = result.items.filter(item => 
      item.type === 'file' && item.name !== '_LOCK.json'
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
 * Check if a slot is locked by checking for _LOCK.json on disk
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
 * Upsert a car in the database from disk discovery
 */
async function upsertCarFromDisk(
  region: string,
  make: string,
  model: string,
  vin: string,
  diskRootPath: string
): Promise<number> {
  try {
    // Try to find existing car
    const existing = await sql`
      SELECT id FROM cars
      WHERE region = ${region} AND UPPER(vin) = UPPER(${vin})
      LIMIT 1
    `;
    
    if (existing.rows.length > 0) {
      // Car exists, update if needed (e.g., undelete)
      await sql`
        UPDATE cars
        SET make = ${make},
            model = ${model},
            disk_root_path = ${diskRootPath},
            deleted_at = NULL
        WHERE id = ${existing.rows[0].id}
      `;
      return existing.rows[0].id;
    }
    
    // Car doesn't exist, create it (use created_by = NULL for discovered cars)
    const result = await sql`
      INSERT INTO cars (region, make, model, vin, disk_root_path, created_by)
      VALUES (${region}, ${make}, ${model}, ${vin}, ${diskRootPath}, NULL)
      RETURNING id
    `;
    
    return result.rows[0].id;
  } catch (error) {
    console.error(`Error upserting car ${vin}:`, error);
    throw error;
  }
}

/**
 * Upsert a car slot in the database from disk discovery
 */
async function upsertSlotFromDisk(
  carId: number,
  slotType: string,
  slotIndex: number,
  diskSlotPath: string,
  isLocked: boolean,
  fileCount: number,
  totalSizeMB: number
): Promise<void> {
  try {
    const status = isLocked ? 'locked' : 'empty';
    
    // Check if slot exists
    const existing = await sql`
      SELECT id, is_used FROM car_slots
      WHERE car_id = ${carId} AND slot_type = ${slotType} AND slot_index = ${slotIndex}
      LIMIT 1
    `;
    
    if (existing.rows.length > 0) {
      // Slot exists, update sync fields (preserve is_used from DB)
      await sql`
        UPDATE car_slots
        SET status = ${status},
            locked = ${isLocked},
            disk_slot_path = ${diskSlotPath},
            file_count = ${fileCount},
            total_size_mb = ${totalSizeMB},
            last_sync_at = CURRENT_TIMESTAMP
        WHERE id = ${existing.rows[0].id}
      `;
    } else {
      // Slot doesn't exist, create it
      await sql`
        INSERT INTO car_slots (
          car_id, slot_type, slot_index, disk_slot_path, status, locked,
          file_count, total_size_mb, last_sync_at
        )
        VALUES (
          ${carId}, ${slotType}, ${slotIndex}, ${diskSlotPath}, ${status}, ${isLocked},
          ${fileCount}, ${totalSizeMB}, CURRENT_TIMESTAMP
        )
      `;
    }
  } catch (error) {
    console.error(`Error upserting slot ${slotType}[${slotIndex}]:`, error);
    throw error;
  }
}

/**
 * Sync a single region from Yandex Disk
 * Scans the disk structure and updates the database cache
 * Marks cars as deleted if they're in DB but not on disk
 * 
 * @param region - Region code to sync (e.g., "MSK", "SPB")
 */
export async function syncRegion(region: string): Promise<{ 
  success: boolean; 
  carsFound: number;
  slotsFound: number;
  carsMarkedDeleted: number;
  error?: string;
}> {
  try {
    const basePath = getBasePath();
    const regionPath = `${basePath}/${region}`;
    
    console.log(`[Sync] Starting sync for region: ${region} at ${regionPath}`);
    
    // Get all cars in DB for this region (not deleted)
    const dbCars = await sql`
      SELECT id, vin, disk_root_path FROM cars
      WHERE region = ${region} AND deleted_at IS NULL
    `;
    
    const dbCarVins = new Set(dbCars.rows.map(car => car.vin.toUpperCase()));
    const foundCarVins = new Set<string>();
    
    // List cars in the region folder
    const carsResult = await listFolder(regionPath);
    if (!carsResult.success) {
      console.warn(`[Sync] Region folder not found or error: ${regionPath}`);
      // Mark all DB cars as deleted if region folder doesn't exist
      if (dbCars.rows.length > 0) {
        await sql`
          UPDATE cars SET deleted_at = CURRENT_TIMESTAMP
          WHERE region = ${region} AND deleted_at IS NULL
        `;
        return { success: true, carsFound: 0, slotsFound: 0, carsMarkedDeleted: dbCars.rows.length };
      }
      return { success: true, carsFound: 0, slotsFound: 0, carsMarkedDeleted: 0 };
    }
    
    if (!carsResult.items) {
      return { success: true, carsFound: 0, slotsFound: 0, carsMarkedDeleted: 0 };
    }
    
    let carsFound = 0;
    let slotsFound = 0;
    
    // Process each car folder
    for (const carFolder of carsResult.items) {
      if (carFolder.type !== 'dir') {
        continue;
      }
      
      // Parse car folder name
      const carInfo = parseCarFolderName(carFolder.name);
      if (!carInfo) {
        console.warn(`[Sync] Could not parse car folder name: ${carFolder.name}`);
        continue;
      }
      
      const { make, model, vin } = carInfo;
      const carRootPath = carFolder.path;
      
      console.log(`[Sync] Found car: ${make} ${model} ${vin}`);
      
      // Track this VIN as found
      foundCarVins.add(vin.toUpperCase());
      
      // Upsert car in database
      const carId = await upsertCarFromDisk(region, make, model, vin, carRootPath);
      carsFound++;
      
      // List slot type folders (1. Дилер фото, 2. Выкуп фото, 3. Муляги фото)
      const slotTypesResult = await listFolder(carRootPath);
      if (!slotTypesResult.success || !slotTypesResult.items) {
        continue;
      }
      
      for (const slotTypeFolder of slotTypesResult.items) {
        if (slotTypeFolder.type !== 'dir') {
          continue;
        }
        
        // Parse slot type folder name
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
          
          // Parse slot subfolder name to get index
          const slotIndex = parseSlotSubfolderName(slotFolder.name, slotType);
          if (!slotIndex) {
            continue;
          }
          
          // Check if slot is locked (has _LOCK.json)
          const locked = await isSlotLocked(slotFolder.path);
          
          // Get file stats
          const stats = await getSlotStats(slotFolder.path);
          
          console.log(`[Sync] Found slot: ${slotType}[${slotIndex}] locked=${locked} files=${stats.fileCount}`);
          
          // Upsert slot in database
          await upsertSlotFromDisk(
            carId,
            slotType,
            slotIndex,
            slotFolder.path,
            locked,
            stats.fileCount,
            Math.round(stats.totalSizeMB * 100) / 100 // Round to 2 decimal places
          );
          slotsFound++;
        }
      }
    }
    
    // Mark cars that are in DB but not found on disk as deleted
    let carsMarkedDeleted = 0;
    for (const vinUpper of dbCarVins) {
      if (!foundCarVins.has(vinUpper)) {
        console.log(`[Sync] Car ${vinUpper} not found on disk, marking as deleted`);
        await sql`
          UPDATE cars SET deleted_at = CURRENT_TIMESTAMP
          WHERE region = ${region} AND UPPER(vin) = ${vinUpper} AND deleted_at IS NULL
        `;
        carsMarkedDeleted++;
      }
    }
    
    console.log(`[Sync] Completed sync for region ${region}: ${carsFound} cars, ${slotsFound} slots, ${carsMarkedDeleted} marked deleted`);
    
    return { success: true, carsFound, slotsFound, carsMarkedDeleted };
  } catch (error) {
    console.error(`[Sync] Error syncing region ${region}:`, error);
    return { 
      success: false, 
      carsFound: 0, 
      slotsFound: 0,
      carsMarkedDeleted: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
