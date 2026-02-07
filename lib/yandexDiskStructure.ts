/**
 * Yandex Disk structure helpers for canonical folder paths
 */
import { YANDEX_DISK_BASE_DIR } from "./config";

export type SlotType = 'dealer' | 'buyout' | 'dummies';

/**
 * Generate root path for a car on Yandex Disk
 * Format: <YANDEX_DISK_BASE_DIR>/<REGION>/<Марка> <Модель> <VIN>
 * Example: /Фото/MSK/Toyota Camry ABC123XYZ
 */
export function carRoot(region: string, make: string, model: string, vin: string): string {
  return `${YANDEX_DISK_BASE_DIR}/${region}/${make} ${model} ${vin}`;
}

/**
 * Generate slot path for a specific slot
 * 
 * Slot types and their paths:
 * - dealer (single): 1. Дилер фото/<Марка> <Модель> <VIN>
 * - buyout (8 slots): 2. Выкуп фото/<i>. <Марка> <Модель> <VIN> where i=1..8
 * - dummies (5 slots): 3. Муляги фото/<i>. <Марка> <Модель> <VIN> where i=1..5
 */
export function slotPath(
  carRootPath: string,
  slotType: SlotType,
  slotIndex: number
): string {
  const parts = carRootPath.split('/');
  const carName = parts[parts.length - 1]; // "<Марка> <Модель> <VIN>"
  
  switch (slotType) {
    case 'dealer':
      // Only one dealer slot (index should be 1)
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
 * Get all slot paths for a car (14 total: 1 dealer + 8 buyout + 5 dummies)
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
 */
export function getLockMarkerPath(slotPath: string): string {
  return `${slotPath}/_LOCK.json`;
}

/**
 * Validate slot type and index combination
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
