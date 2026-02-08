/**
 * Database-aware user operations with fallback to file-based auth
 */
import { checkDatabaseConnection } from "./db";
import { getUserByEmail as getUserByEmailDB } from "./models/users";
import { getUserByEmail as getUserByEmailFile } from "./users";
import { getBootstrapAdmins, getAllRegionUsers, ADMIN_REGION, generateStableEnvUserId } from "./config";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";

export interface User {
  id?: number;
  email: string;
  passwordHash: string;
  region?: string;
  role?: string;
}

export interface BootstrapAdminCheckResult {
  isBootstrapAdmin: boolean;
  user?: {
    id: number;
    email: string;
    region: string;
    role: string;
    passwordHash?: string; // Added to avoid re-hashing
  };
}

/**
 * Check if credentials match a bootstrap admin from ENV
 * Bootstrap admins are checked FIRST before database/file lookup
 * Returns user with stable ENV-based ID (negative to distinguish from DB IDs)
 */
export async function checkBootstrapAdmin(
  email: string,
  password: string
): Promise<BootstrapAdminCheckResult> {
  const bootstrapAdmins = getBootstrapAdmins();
  
  // Normalize email for comparison
  const normalizedEmail = email.trim().toLowerCase();

  for (const admin of bootstrapAdmins) {
    if (admin.email !== normalizedEmail) {
      continue;
    }

    let passwordHash: string | undefined;

    // Check plain password first (takes priority)
    if (admin.password) {
      try {
        const passwordBuffer = Buffer.from(password, 'utf8');
        const adminPasswordBuffer = Buffer.from(admin.password, 'utf8');
        
        // timingSafeEqual requires buffers of equal length
        let isValid = false;
        if (passwordBuffer.length === adminPasswordBuffer.length) {
          isValid = timingSafeEqual(passwordBuffer, adminPasswordBuffer);
        } else {
          // Perform dummy comparison to maintain constant time
          // Use different buffers to avoid always returning true
          const dummyBuffer1 = Buffer.alloc(32, 0);
          const dummyBuffer2 = Buffer.alloc(32, 1);
          try {
            timingSafeEqual(dummyBuffer1, dummyBuffer2);
          } catch {
            // Expected to throw since buffers differ, but maintains timing
          }
        }

        if (isValid) {
          // Hash password once for DB storage (don't re-hash on every login)
          passwordHash = await bcrypt.hash(password, 10);
          
          return {
            isBootstrapAdmin: true,
            user: {
              id: generateStableEnvUserId(admin.email),
              email: admin.email,
              region: admin.region,
              role: admin.role,
              passwordHash,
            },
          };
        }
      } catch {
        // Error during comparison - continue to next admin
        // Maintain constant time with dummy comparison
        const dummyBuffer1 = Buffer.alloc(32, 0);
        const dummyBuffer2 = Buffer.alloc(32, 1);
        try {
          timingSafeEqual(dummyBuffer1, dummyBuffer2);
        } catch {
          // Expected to throw, but maintains timing
        }
      }
    }

    // Check bcrypt hash
    if (admin.passwordHash) {
      try {
        const isValid = await bcrypt.compare(password, admin.passwordHash);
        if (isValid) {
          return {
            isBootstrapAdmin: true,
            user: {
              id: generateStableEnvUserId(admin.email),
              email: admin.email,
              region: admin.region,
              role: admin.role,
              passwordHash: admin.passwordHash, // Already hashed
            },
          };
        }
      } catch {
        // Error during bcrypt compare - continue to next admin
      }
    }
  }

  return { isBootstrapAdmin: false };
}

/**
 * Check if credentials match a region user from ENV (REGION_USERS + USER_PASSWORD_MAP)
 * Region users are checked AFTER bootstrap admins but BEFORE database/file
 * Returns user with stable ENV-based ID (negative to distinguish from DB IDs)
 */
export async function checkRegionUser(
  email: string,
  password: string
): Promise<BootstrapAdminCheckResult> {
  const regionUsers = getAllRegionUsers();
  
  // Normalize email for comparison
  const normalizedEmail = email.trim().toLowerCase();
  
  for (const user of regionUsers) {
    if (user.email !== normalizedEmail) {
      continue;
    }
    
    // Check plain password
    try {
      const passwordBuffer = Buffer.from(password, 'utf8');
      const userPasswordBuffer = Buffer.from(user.password, 'utf8');
      
      let isValid = false;
      if (passwordBuffer.length === userPasswordBuffer.length) {
        isValid = timingSafeEqual(passwordBuffer, userPasswordBuffer);
      } else {
        // Perform dummy comparison to maintain constant time
        const dummyBuffer1 = Buffer.alloc(32, 0);
        const dummyBuffer2 = Buffer.alloc(32, 1);
        try {
          timingSafeEqual(dummyBuffer1, dummyBuffer2);
        } catch {
          // Expected to throw
        }
      }
      
      if (isValid) {
        // Hash password once for DB storage
        const passwordHash = await bcrypt.hash(password, 10);
        
        return {
          isBootstrapAdmin: true, // Reusing this flag for ENV users
          user: {
            id: generateStableEnvUserId(user.email),
            email: user.email,
            region: user.region,
            role: user.role,
            passwordHash,
          },
        };
      }
    } catch {
      // Error during comparison - continue
      const dummyBuffer1 = Buffer.alloc(32, 0);
      const dummyBuffer2 = Buffer.alloc(32, 1);
      try {
        timingSafeEqual(dummyBuffer1, dummyBuffer2);
      } catch {
        // Expected to throw
      }
    }
  }
  
  return { isBootstrapAdmin: false };
}

/**
 * Get user by email from database or fallback to file-based auth (dev only)
 * Note: users.json fallback is automatically disabled in production by lib/users.ts
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  // Normalize email for lookup
  const normalizedEmail = email.trim().toLowerCase();
  
  // Try database first
  const hasDB = await checkDatabaseConnection();
  
  if (hasDB) {
    try {
      const dbUser = await getUserByEmailDB(normalizedEmail);
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
  
  // Fallback to file/env based auth (users.json is blocked in production)
  const fileUser = getUserByEmailFile(normalizedEmail);
  if (fileUser) {
    // For file-based auth, we'll use default values for region and role
    return {
      email: fileUser.email,
      passwordHash: fileUser.passwordHash,
      region: ADMIN_REGION,
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
