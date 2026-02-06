/**
 * Database-aware user operations with fallback to file-based auth
 */
import { checkDatabaseConnection } from "./db";
import { getUserByEmail as getUserByEmailDB, type User as DBUser } from "./models/users";
import { getUserByEmail as getUserByEmailFile, type User as FileUser } from "./users";

export interface User {
  id?: number;
  email: string;
  passwordHash: string;
  region?: string;
  role?: string;
}

/**
 * Get user by email from database or fallback to file-based auth
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  // Try database first
  const hasDB = await checkDatabaseConnection();
  
  if (hasDB) {
    try {
      const dbUser = await getUserByEmailDB(email);
      if (dbUser) {
        return {
          id: dbUser.id,
          email: dbUser.email,
          passwordHash: dbUser.password_hash,
          region: dbUser.region,
          role: dbUser.role,
        };
      }
    } catch (error) {
      console.error("Database query failed, falling back to file/env auth:", error);
    }
  }
  
  // Fallback to file/env based auth
  const fileUser = getUserByEmailFile(email);
  if (fileUser) {
    // For file-based auth, we'll use default values for region and role
    return {
      email: fileUser.email,
      passwordHash: fileUser.passwordHash,
      region: process.env.DEFAULT_REGION || 'MSK',
      role: 'admin', // File-based users are admins by default
    };
  }
  
  return null;
}

/**
 * Check if database is being used
 */
export async function isDatabaseMode(): Promise<boolean> {
  return checkDatabaseConnection();
}
