/**
 * Car model for database operations
 */
import { sql } from '../db';

export interface Car {
  id: number;
  region: string;
  make: string;
  model: string;
  vin: string;
  disk_root_path: string;
  created_by: number;
  created_at: Date;
  deleted_at: Date | null;
}

export interface CreateCarParams {
  region: string;
  make: string;
  model: string;
  vin: string;
  disk_root_path: string;
  created_by: number;
}

export interface CarWithProgress extends Car {
  total_slots: number;
  locked_slots: number;
  empty_slots: number;
}

/**
 * Create a new car
 */
export async function createCar(params: CreateCarParams): Promise<Car> {
  try {
    const { region, make, model, vin, disk_root_path, created_by } = params;
    
    const result = await sql<Car>`
      INSERT INTO cars (region, make, model, vin, disk_root_path, created_by)
      VALUES (${region}, ${make}, ${model}, ${vin}, ${disk_root_path}, ${created_by})
      RETURNING id, region, make, model, vin, disk_root_path, created_by, created_at
    `;
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating car:', error);
    throw error;
  }
}

/**
 * Get car by ID
 */
export async function getCarById(id: number): Promise<Car | null> {
  try {
    const result = await sql<Car>`
      SELECT id, region, make, model, vin, disk_root_path, created_by, created_at, deleted_at
      FROM cars
      WHERE id = ${id}
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting car by id:', error);
    throw error;
  }
}

/**
 * Get car by region and VIN
 * VIN is the canonical identifier within a region
 */
export async function getCarByRegionAndVin(region: string, vin: string): Promise<Car | null> {
  try {
    const result = await sql<Car>`
      SELECT id, region, make, model, vin, disk_root_path, created_by, created_at, deleted_at
      FROM cars
      WHERE region = ${region} AND UPPER(vin) = UPPER(${vin})
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting car by region and vin:', error);
    throw error;
  }
}

/**
 * Check if car exists by region and VIN
 */
export async function carExistsByRegionAndVin(region: string, vin: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT COUNT(*) as count
      FROM cars
      WHERE region = ${region} AND UPPER(vin) = UPPER(${vin})
    `;
    
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error('Error checking car existence:', error);
    throw error;
  }
}

/**
 * List cars by region with progress
 */
export async function listCarsByRegion(region: string): Promise<CarWithProgress[]> {
  try {
    const result = await sql<CarWithProgress>`
      SELECT 
        c.id, c.region, c.make, c.model, c.vin, c.disk_root_path, c.created_by, c.created_at, c.deleted_at,
        COUNT(cs.id) as total_slots,
        SUM(CASE WHEN cs.status = 'locked' THEN 1 ELSE 0 END) as locked_slots,
        SUM(CASE WHEN cs.status = 'empty' THEN 1 ELSE 0 END) as empty_slots
      FROM cars c
      LEFT JOIN car_slots cs ON c.id = cs.car_id
      WHERE c.region = ${region}
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;
    
    return result.rows;
  } catch (error) {
    console.error('Error listing cars by region:', error);
    throw error;
  }
}

/**
 * Delete car (will cascade to slots and links)
 */
export async function deleteCar(id: number): Promise<void> {
  try {
    await sql`
      DELETE FROM cars WHERE id = ${id}
    `;
  } catch (error) {
    console.error('Error deleting car:', error);
    throw error;
  }
}
