/**
 * User model for database operations
 */
import { sql, ensureDbSchema } from '../db';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  region: string;
  role: string;
  created_at: Date;
}

export interface CreateUserParams {
  email: string;
  password_hash: string;
  region: string;
  role?: string;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    await ensureDbSchema();
    // Normalize email for database lookup
    const normalizedEmail = email.trim().toLowerCase();
    const result = await sql<User>`
      SELECT id, email, password_hash, region, role, created_at
      FROM users
      WHERE LOWER(email) = ${normalizedEmail}
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    throw error;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(id: number): Promise<User | null> {
  try {
    await ensureDbSchema();
    const result = await sql<User>`
      SELECT id, email, password_hash, region, role, created_at
      FROM users
      WHERE id = ${id}
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by id:', error);
    throw error;
  }
}

/**
 * Create a new user
 */
export async function createUser(params: CreateUserParams): Promise<User> {
  try {
    await ensureDbSchema();
    const { password_hash, region, role = 'user' } = params;
    // Normalize email when creating user
    const email = params.email.trim().toLowerCase();
    
    const result = await sql<User>`
      INSERT INTO users (email, password_hash, region, role)
      VALUES (${email}, ${password_hash}, ${region}, ${role})
      RETURNING id, email, password_hash, region, role, created_at
    `;
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * List all users (admin only)
 */
export async function listUsers(): Promise<User[]> {
  try {
    await ensureDbSchema();
    const result = await sql<User>`
      SELECT id, email, password_hash, region, role, created_at
      FROM users
      ORDER BY created_at DESC
    `;
    
    return result.rows;
  } catch (error) {
    console.error('Error listing users:', error);
    throw error;
  }
}

export interface UpsertUserParams {
  email: string;
  passwordHash: string;
  region: string;
  role: string;
}

/**
 * Upsert a user (insert or update on conflict)
 * Ensures user exists in database and returns the real DB user
 * This is critical for FK constraint on cars.created_by
 */
export async function upsertUser(params: UpsertUserParams): Promise<User> {
  try {
    await ensureDbSchema();
    const { email, passwordHash, region, role } = params;
    
    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();
    
    const result = await sql<User>`
      INSERT INTO users (email, password_hash, region, role)
      VALUES (${normalizedEmail}, ${passwordHash}, ${region}, ${role})
      ON CONFLICT (email) 
      DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        region = EXCLUDED.region,
        role = EXCLUDED.role
      RETURNING id, email, password_hash, region, role, created_at
    `;
    
    return result.rows[0];
  } catch (error) {
    console.error('Error upserting user:', error);
    throw error;
  }
}
