/**
 * Yandex Disk Path Builder - Single Source of Truth
 * 
 * This module is the ONLY place where Yandex Disk paths should be constructed.
 * All code must use these functions to ensure consistency with the canonical
 * structure defined in DISK_STRUCTURE.md.
 * 
 * Path Structure:
 * ${YANDEX_DISK_BASE_DIR}/Фото/<REGION>/<Make> <Model> <VIN>/...
 * 
 * @see DISK_STRUCTURE.md for complete documentation
 */

import { YANDEX_DISK_BASE_DIR } from "@/lib/config/disk";

export type SlotType = 'dealer' | 'buyout' | 'dummies';

/**
 * Get the base path for all photo storage
 * Pattern: ${YANDEX_DISK_BASE_DIR}/Фото
 * 
 * @returns Base path for photo storage
 * @example getBasePath() // Returns: "/Фото/Фото"
 */
export function getBasePath(): string {
  return `${YANDEX_DISK_BASE_DIR}/Фото`;
}

/**
 * Get the region path
 * Pattern: ${BASE_PATH}/<REGION>
 * 
 * @param region - Region code (e.g., "MSK", "SPB")
 * @returns Region path
 * @example getRegionPath("MSK") // Returns: "/Фото/Фото/MSK"
 */
export function getRegionPath(region: string): string {
  return `${getBasePath()}/${region}`;
}

/**
 * Get the archive path (ALL region)
 * Pattern: ${BASE_PATH}/ALL
 * 
 * This is the destination for archived cars from all regions.
 * When a car is archived, it's moved from its region folder to this central archive.
 * 
 * @returns Archive path
 * @example getArchivePath() // Returns: "/Фото/Фото/ALL"
 */
export function getArchivePath(): string {
  return `${getBasePath()}/ALL`;
}

/**
 * Generate full archive path for a specific car
 * Pattern: ${BASE_PATH}/ALL/{region}_{make}_{model}_{vin}
 * 
 * @param region - Original region code of the car
 * @param make - Car manufacturer
 * @param model - Car model
 * @param vin - Vehicle Identification Number (17 characters)
 * @returns Full archive path for the car
 * @example getCarArchivePath("MSK", "Toyota", "Camry", "1HGBH41JXMN109186")
 *          // Returns: "/Фото/Фото/ALL/MSK_Toyota_Camry_1HGBH41JXMN109186"
 */
export function getCarArchivePath(region: string, make: string, model: string, vin: string): string {
  const archiveName = `${region}_${make}_${model}_${vin}`.replace(/\s+/g, '_');
  return `${getArchivePath()}/${archiveName}`;
}

/**
 * Generate root path for a car on Yandex Disk
 * Pattern: ${BASE_PATH}/<REGION>/<Make> <Model> <VIN>
 * 
 * @param region - Region code
 * @param make - Car manufacturer
 * @param model - Car model
 * @param vin - Vehicle Identification Number (17 characters)
 * @returns Car root path
 * @example carRoot("MSK", "Toyota", "Camry", "1HGBH41JXMN109186")
 *          // Returns: "/Фото/Фото/MSK/Toyota Camry 1HGBH41JXMN109186"
 */
export function carRoot(region: string, make: string, model: string, vin: string): string {
  return `${getRegionPath(region)}/${make} ${model} ${vin}`;
}

/**
 * Generate slot path for a specific slot
 * 
 * Slot types and their paths:
 * - dealer (1 slot): 1. Дилер фото/<Make> <Model> <VIN>
 * - buyout (8 slots): 2. Выкуп фото/<index>. <Make> <Model> <VIN> where index=1..8
 * - dummies (5 slots): 3. Муляги фото/<index>. <Make> <Model> <VIN> where index=1..5
 * 
 * @param carRootPath - Root path of the car
 * @param slotType - Type of slot (dealer, buyout, dummies)
 * @param slotIndex - Slot index (dealer: 1, buyout: 1-8, dummies: 1-5)
 * @returns Slot path
 * @throws Error if slot type/index combination is invalid
 */
export function slotPath(
  carRootPath: string,
  slotType: SlotType,
  slotIndex: number
): string {
  const parts = carRootPath.split('/');
  const carName = parts[parts.length - 1]; // "<Make> <Model> <VIN>"
  
  switch (slotType) {
    case 'dealer':
      // Only one dealer slot (index should be 1)
      if (slotIndex !== 1) {
        throw new Error(`Invalid dealer slot index: ${slotIndex}. Must be 1.`);
      }
      return `${carRootPath}/1. Дилер фото/${carName}`;
    
    case 'buyout':
      // 8 buyout slots (index 1-8)
      if (slotIndex < 1 || slotIndex > 8) {
        throw new Error(`Invalid buyout slot index: ${slotIndex}. Must be 1-8.`);
      }
      return `${carRootPath}/2. Выкуп фото/${slotIndex}. ${carName}`;
    
    case 'dummies':
      // 5 dummy slots (index 1-5)
      if (slotIndex < 1 || slotIndex > 5) {
        throw new Error(`Invalid dummies slot index: ${slotIndex}. Must be 1-5.`);
      }
      return `${carRootPath}/3. Муляги фото/${slotIndex}. ${carName}`;
    
    default:
      throw new Error(`Unknown slot type: ${slotType}`);
  }
}

/**
 * Get all slot paths for a car
 * Returns 14 total slots: 1 dealer + 8 buyout + 5 dummies
 * 
 * @param region - Region code
 * @param make - Car manufacturer
 * @param model - Car model
 * @param vin - Vehicle Identification Number
 * @returns Array of slot configurations with paths
 */
export function getAllSlotPaths(
  region: string,
  make: string,
  model: string,
  vin: string
): Array<{ slotType: SlotType; slotIndex: number; path: string }> {
  const root = carRoot(region, make, model, vin);
  const slots: Array<{ slotType: SlotType; slotIndex: number; path: string }> = [];
  
  // 1 dealer slot
  slots.push({
    slotType: 'dealer',
    slotIndex: 1,
    path: slotPath(root, 'dealer', 1),
  });
  
  // 8 buyout slots
  for (let i = 1; i <= 8; i++) {
    slots.push({
      slotType: 'buyout',
      slotIndex: i,
      path: slotPath(root, 'buyout', i),
    });
  }
  
  // 5 dummies slots
  for (let i = 1; i <= 5; i++) {
    slots.push({
      slotType: 'dummies',
      slotIndex: i,
      path: slotPath(root, 'dummies', i),
    });
  }
  
  return slots;
}

/**
 * Get the lock marker file path for a slot
 * The lock marker indicates a slot is filled and locked
 * 
 * @param slotPath - Path to the slot folder
 * @returns Path to the _LOCK.json file
 * @example getLockMarkerPath("/Фото/Фото/MSK/Toyota Camry ABC123/1. Дилер фото/Toyota Camry ABC123")
 *          // Returns: "/Фото/Фото/MSK/Toyota Camry ABC123/1. Дилер фото/Toyota Camry ABC123/_LOCK.json"
 */
export function getLockMarkerPath(slotPath: string): string {
  return `${slotPath}/_LOCK.json`;
}

/**
 * Validate slot type and index combination
 * 
 * @param slotType - Type of slot
 * @param slotIndex - Slot index
 * @returns true if valid, false otherwise
 */
export function validateSlot(slotType: SlotType, slotIndex: number): boolean {
  switch (slotType) {
    case 'dealer':
      return slotIndex === 1;
    case 'buyout':
      return slotIndex >= 1 && slotIndex <= 8;
    case 'dummies':
      return slotIndex >= 1 && slotIndex <= 5;
    default:
      return false;
  }
}

/**
 * Get total number of slots for a slot type
 * 
 * @param slotType - Type of slot
 * @returns Number of slots available for this type
 */
export function getSlotCount(slotType: SlotType): number {
  switch (slotType) {
    case 'dealer':
      return 1;
    case 'buyout':
      return 8;
    case 'dummies':
      return 5;
    default:
      return 0;
  }
}

/**
 * Get slot type name in Russian
 * 
 * @param slotType - Type of slot
 * @returns Russian name of the slot type
 */
export function getSlotTypeNameRu(slotType: SlotType): string {
  switch (slotType) {
    case 'dealer':
      return 'Дилер фото';
    case 'buyout':
      return 'Выкуп фото';
    case 'dummies':
      return 'Муляги фото';
    default:
      return '';
  }
}

/**
 * Get slot type number (used in folder naming)
 * 
 * @param slotType - Type of slot
 * @returns Number prefix for the slot type folder
 */
export function getSlotTypeNumber(slotType: SlotType): number {
  switch (slotType) {
    case 'dealer':
      return 1;
    case 'buyout':
      return 2;
    case 'dummies':
      return 3;
    default:
      return 0;
  }
}

/**
 * Sanitize a path segment to prevent directory traversal
 * - Remove/replace dangerous characters: / \ .. : * ? " < > |
 * - Limit length to 255 chars
 * - Trim whitespace
 * - Strip leading/trailing dots
 * 
 * @param segment - Path segment to sanitize
 * @returns Sanitized path segment
 */
export function sanitizePathSegment(segment: string): string {
  return segment
    .replace(/[\/\\:\*\?"<>\|]/g, '_') // replace dangerous chars
    .replace(/\.\.+/g, '.') // collapse multiple dots
    .replace(/^\.+|\.+$/g, '') // strip leading/trailing dots
    .trim()
    .substring(0, 255); // filesystem limit
}

/**
 * Sanitize filename for Yandex Disk upload
 * Preserves file extension but sanitizes the name
 * 
 * @param filename - Original filename
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  // Handle dotfiles (files starting with .)
  if (filename.startsWith('.') && filename.indexOf('.', 1) === -1) {
    // This is a dotfile like .gitignore - treat entire name as the basename
    return sanitizePathSegment(filename);
  }
  
  const lastDotIndex = filename.lastIndexOf('.');
  
  // No extension or filename is just an extension
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return sanitizePathSegment(filename);
  }
  
  const name = filename.substring(0, lastDotIndex);
  const ext = filename.substring(lastDotIndex + 1);
  
  const safeName = sanitizePathSegment(name);
  const safeExt = sanitizePathSegment(ext);
  
  // If sanitization removed everything from name, use a default
  if (!safeName && !safeExt) {
    return 'file';
  }
  
  if (!safeName) {
    return safeExt ? `file.${safeExt}` : 'file';
  }
  
  return safeExt ? `${safeName}.${safeExt}` : safeName;
}
