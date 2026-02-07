/**
 * Database-aware user operations with fallback to file-based auth
 */
import { checkDatabaseConnection } from "./db";
import { getUserByEmail as getUserByEmailDB } from "./models/users";
import { getUserByEmail as getUserByEmailFile } from "./users";
import { getBootstrapAdmins, getAllRegionUsers, getRegionForUser, ADMIN_REGION } from "./config";
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
  };
}

/**
 * Check if credentials match a bootstrap admin from ENV
 * Bootstrap admins are checked FIRST before database/file lookup
 */
export async function checkBootstrapAdmin(
  email: string,
  password: string
): Promise<BootstrapAdminCheckResult> {
  const bootstrapAdmins = getBootstrapAdmins();

  for (const admin of bootstrapAdmins) {
    if (admin.email !== email) {
      continue;
    }

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
          return {
            isBootstrapAdmin: true,
            user: {
              id: 0, // Bootstrap admins use ID 0
              email: admin.email,
              region: admin.region,
              role: admin.role,
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
              id: 0, // Bootstrap admins use ID 0
              email: admin.email,
              region: admin.region,
              role: admin.role,
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
 */
export async function checkRegionUser(
  email: string,
  password: string
): Promise<BootstrapAdminCheckResult> {
  const regionUsers = getAllRegionUsers();
  
  for (const user of regionUsers) {
    if (user.email !== email) {
      continue;
    }
    
    // Check plain password (5 digits)
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
        return {
          isBootstrapAdmin: true, // Reusing this flag for ENV users
          user: {
            id: 0, // ENV users use ID 0 like bootstrap admins
            email: user.email,
            region: user.region,
            role: user.role,
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
      region: ADMIN_REGION, // Use ADMIN_REGION instead of DEFAULT_REGION
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
