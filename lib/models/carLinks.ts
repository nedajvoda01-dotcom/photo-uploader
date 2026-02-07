/**
 * Car links model for database operations
 */
import { sql, ensureDbSchema } from '../db';

export interface CarLink {
  id: number;
  car_id: number;
  label: string;
  url: string;
  created_by: string | null;
  created_at: Date;
}

export interface CreateCarLinkParams {
  car_id: number;
  label: string;
  url: string;
  created_by?: string | null;
}

/**
 * Create a new car link
 */
export async function createCarLink(params: CreateCarLinkParams): Promise<CarLink> {
  try {
    await ensureDbSchema();
    const { car_id, label, url, created_by } = params;
    
    const result = await sql<CarLink>`
      INSERT INTO car_links (car_id, label, url, created_by)
      VALUES (${car_id}, ${label}, ${url}, ${created_by})
      RETURNING id, car_id, label, url, created_by, created_at
    `;
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating car link:', error);
    throw error;
  }
}

/**
 * Get car link by ID
 */
export async function getCarLinkById(id: number): Promise<CarLink | null> {
  try {
    await ensureDbSchema();
    const result = await sql<CarLink>`
      SELECT id, car_id, label, url, created_by, created_at
      FROM car_links
      WHERE id = ${id}
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting car link by id:', error);
    throw error;
  }
}

/**
 * List all links for a car
 */
export async function listCarLinks(car_id: number): Promise<CarLink[]> {
  try {
    await ensureDbSchema();
    const result = await sql<CarLink>`
      SELECT id, car_id, label, url, created_by, created_at
      FROM car_links
      WHERE car_id = ${car_id}
      ORDER BY created_at DESC
    `;
    
    return result.rows;
  } catch (error) {
    console.error('Error listing car links:', error);
    throw error;
  }
}

/**
 * Delete a car link
 */
export async function deleteCarLink(id: number): Promise<void> {
  try {
    await ensureDbSchema();
    await sql`
      DELETE FROM car_links WHERE id = ${id}
    `;
  } catch (error) {
    console.error('Error deleting car link:', error);
    throw error;
  }
}
