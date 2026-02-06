/**
 * User model for database operations
 */
import { sql } from '../db';

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
    const result = await sql<User>`
      SELECT id, email, password_hash, region, role, created_at
      FROM users
      WHERE email = ${email}
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
    const { email, password_hash, region, role = 'user' } = params;
    
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
