/**
 * Car slots model for database operations
 */
import { sql, ensureDbSchema } from '../db';

export interface CarSlot {
  id: number;
  car_id: number;
  slot_type: string;
  slot_index: number;
  status: string;
  locked_at: Date | null;
  locked_by: string | null;
  lock_meta_json: string | null;
  disk_slot_path: string;
  public_url: string | null;
  is_used: boolean;
  marked_used_at: Date | null;
  marked_used_by: string | null;
  file_count: number;
  total_size_mb: number;
  last_sync_at: Date | null;
}

export interface CreateCarSlotParams {
  car_id: number;
  slot_type: string;
  slot_index: number;
  disk_slot_path: string;
}

export interface LockMetadata {
  carId: number;
  slotType: string;
  slotIndex: number;
  uploadedBy: string;
  uploadedAt: string;
  fileCount: number;
  files: Array<{
    name: string;
    size: number;
    sha256?: string;
  }>;
}

/**
 * Create a new car slot
 */
export async function createCarSlot(params: CreateCarSlotParams): Promise<CarSlot> {
  try {
    await ensureDbSchema();
    const { car_id, slot_type, slot_index, disk_slot_path } = params;
    
    const result = await sql<CarSlot>`
      INSERT INTO car_slots (car_id, slot_type, slot_index, disk_slot_path, status)
      VALUES (${car_id}, ${slot_type}, ${slot_index}, ${disk_slot_path}, 'empty')
      RETURNING id, car_id, slot_type, slot_index, status, locked_at, locked_by, lock_meta_json, disk_slot_path, public_url, is_used, marked_used_at, marked_used_by, file_count, total_size_mb, last_sync_at
    `;
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating car slot:', error);
    throw error;
  }
}

/**
 * Get slot by car_id, slot_type, and slot_index
 */
export async function getCarSlot(
  car_id: number,
  slot_type: string,
  slot_index: number
): Promise<CarSlot | null> {
  try {
    await ensureDbSchema();
    const result = await sql<CarSlot>`
      SELECT id, car_id, slot_type, slot_index, status, locked_at, locked_by, lock_meta_json, disk_slot_path, public_url, is_used, marked_used_at, marked_used_by, file_count, total_size_mb, last_sync_at
      FROM car_slots
      WHERE car_id = ${car_id} AND slot_type = ${slot_type} AND slot_index = ${slot_index}
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting car slot:', error);
    throw error;
  }
}

/**
 * List all slots for a car
 */
export async function listCarSlots(car_id: number): Promise<CarSlot[]> {
  try {
    await ensureDbSchema();
    const result = await sql<CarSlot>`
      SELECT id, car_id, slot_type, slot_index, status, locked_at, locked_by, lock_meta_json, disk_slot_path, public_url, is_used, marked_used_at, marked_used_by, file_count, total_size_mb, last_sync_at
      FROM car_slots
      WHERE car_id = ${car_id}
      ORDER BY slot_type, slot_index
    `;
    
    return result.rows;
  } catch (error) {
    console.error('Error listing car slots:', error);
    throw error;
  }
}

/**
 * Lock a slot (mark as filled)
 */
export async function lockCarSlot(
  car_id: number,
  slot_type: string,
  slot_index: number,
  locked_by: string,
  lock_metadata: LockMetadata
): Promise<CarSlot> {
  try {
    await ensureDbSchema();
    const result = await sql<CarSlot>`
      UPDATE car_slots
      SET status = 'locked',
          locked_at = CURRENT_TIMESTAMP,
          locked_by = ${locked_by},
          lock_meta_json = ${JSON.stringify(lock_metadata)}
      WHERE car_id = ${car_id} AND slot_type = ${slot_type} AND slot_index = ${slot_index}
      RETURNING id, car_id, slot_type, slot_index, status, locked_at, locked_by, lock_meta_json, disk_slot_path, public_url, is_used, marked_used_at, marked_used_by, file_count, total_size_mb, last_sync_at
    `;
    
    if (result.rows.length === 0) {
      throw new Error('Slot not found or already locked');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error locking car slot:', error);
    throw error;
  }
}

/**
 * Unlock a slot (mark as empty) - for admin use
 */
export async function unlockCarSlot(
  car_id: number,
  slot_type: string,
  slot_index: number
): Promise<CarSlot> {
  try {
    await ensureDbSchema();
    const result = await sql<CarSlot>`
      UPDATE car_slots
      SET status = 'empty',
          locked_at = NULL,
          locked_by = NULL,
          lock_meta_json = NULL
      WHERE car_id = ${car_id} AND slot_type = ${slot_type} AND slot_index = ${slot_index}
      RETURNING id, car_id, slot_type, slot_index, status, locked_at, locked_by, lock_meta_json, disk_slot_path, public_url, is_used, marked_used_at, marked_used_by, file_count, total_size_mb, last_sync_at
    `;
    
    if (result.rows.length === 0) {
      throw new Error('Slot not found');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error unlocking car slot:', error);
    throw error;
  }
}

/**
 * Set public URL for a slot
 */
export async function setSlotPublicUrl(
  car_id: number,
  slot_type: string,
  slot_index: number,
  public_url: string
): Promise<CarSlot> {
  try {
    await ensureDbSchema();
    const result = await sql<CarSlot>`
      UPDATE car_slots
      SET public_url = ${public_url}
      WHERE car_id = ${car_id} AND slot_type = ${slot_type} AND slot_index = ${slot_index}
      RETURNING id, car_id, slot_type, slot_index, status, locked_at, locked_by, lock_meta_json, disk_slot_path, public_url, is_used, marked_used_at, marked_used_by, file_count, total_size_mb, last_sync_at
    `;
    
    if (result.rows.length === 0) {
      throw new Error('Slot not found');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error setting slot public URL:', error);
    throw error;
  }
}

/**
 * Mark a slot as used (for admin)
 */
export async function markSlotAsUsed(
  car_id: number,
  slot_type: string,
  slot_index: number,
  marked_by: string
): Promise<CarSlot> {
  try {
    await ensureDbSchema();
    const result = await sql<CarSlot>`
      UPDATE car_slots
      SET is_used = TRUE,
          marked_used_at = CURRENT_TIMESTAMP,
          marked_used_by = ${marked_by}
      WHERE car_id = ${car_id} AND slot_type = ${slot_type} AND slot_index = ${slot_index}
      RETURNING id, car_id, slot_type, slot_index, status, locked_at, locked_by, lock_meta_json, disk_slot_path, public_url, is_used, marked_used_at, marked_used_by, file_count, total_size_mb, last_sync_at
    `;
    
    if (result.rows.length === 0) {
      throw new Error('Slot not found');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error marking slot as used:', error);
    throw error;
  }
}

/**
 * Mark a slot as unused (for admin)
 */
export async function markSlotAsUnused(
  car_id: number,
  slot_type: string,
  slot_index: number
): Promise<CarSlot> {
  try {
    await ensureDbSchema();
    const result = await sql<CarSlot>`
      UPDATE car_slots
      SET is_used = FALSE,
          marked_used_at = NULL,
          marked_used_by = NULL
      WHERE car_id = ${car_id} AND slot_type = ${slot_type} AND slot_index = ${slot_index}
      RETURNING id, car_id, slot_type, slot_index, status, locked_at, locked_by, lock_meta_json, disk_slot_path, public_url, is_used, marked_used_at, marked_used_by, file_count, total_size_mb, last_sync_at
    `;
    
    if (result.rows.length === 0) {
      throw new Error('Slot not found');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error marking slot as unused:', error);
    throw error;
  }
}
