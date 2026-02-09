/**
 * Application: Login Use Case
 * Unified login logic handling bootstrap admins, region users, and database users
 */

import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { getUserByEmail as getUserByEmailFile } from "@/lib/infrastructure/dev/usersJson";
import { getBootstrapAdmins, generateStableEnvUserId } from "@/lib/config/auth";
import { ADMIN_REGION } from "@/lib/config/regions";
import { getAllRegionUsers } from "@/lib/config/regions";

// Database removed per Problem Statement #7
// Auth now works purely from ENV and file-based config

export interface User {
  id: number;
  email: string;
  passwordHash: string;
  region: string;
  role: string;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  error?: string;
  source?: 'bootstrap-admin' | 'region-user' | 'file';
}

/**
 * Check if credentials match a bootstrap admin from ENV
 * Bootstrap admins are checked FIRST before database/file lookup
 * Returns user with stable ENV-based ID (negative to distinguish from DB IDs)
 */
async function checkBootstrapAdmin(
  email: string,
  password: string
): Promise<{ isMatch: boolean; user?: User }> {
  const bootstrapAdmins = getBootstrapAdmins(ADMIN_REGION);
  
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
            isMatch: true,
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
            isMatch: true,
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

  return { isMatch: false };
}

/**
 * Check if credentials match a region user from ENV (REGION_USERS + USER_PASSWORD_MAP)
 * Region users are checked AFTER bootstrap admins but BEFORE database/file
 * Returns user with stable ENV-based ID (negative to distinguish from DB IDs)
 */
async function checkRegionUser(
  email: string,
  password: string
): Promise<{ isMatch: boolean; user?: User }> {
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
          isMatch: true,
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
  
  return { isMatch: false };
}

/**
 * Get user by email from file-based auth (dev/bootstrap only)
 * Database removed per Problem Statement #7
 */
async function getUserByEmail(email: string): Promise<User | null> {
  // Normalize email for lookup
  const normalizedEmail = email.trim().toLowerCase();
  
  // File/env based auth only (users.json is blocked in production)
  const fileUser = getUserByEmailFile(normalizedEmail);
  if (fileUser) {
    // For file-based auth, use default values for region and role
    // Generate a stable ID for file users
    return {
      id: generateStableEnvUserId(fileUser.email),
      email: fileUser.email,
      passwordHash: fileUser.passwordHash,
      region: ADMIN_REGION,
      role: 'admin', // File-based users are admins by default
    };
  }
  
  return null;
}

/**
 * Login Use Case
 * Handles unified login flow from ENV and file-based config only:
 * 1. Check bootstrap admins from ENV
 * 2. Check region users from ENV
 * 3. Fallback to file-based users (dev only)
 * 
 * Database removed per Problem Statement #7 - all auth from ENV/files
 */
export async function loginUseCase(
  email: string,
  password: string
): Promise<LoginResult> {
  // Normalize credentials
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();

  // Step 1: Check bootstrap admins FIRST (from ENV)
  const bootstrapResult = await checkBootstrapAdmin(normalizedEmail, normalizedPassword);
  
  if (bootstrapResult.isMatch && bootstrapResult.user) {
    return {
      success: true,
      user: bootstrapResult.user,
      source: 'bootstrap-admin',
    };
  }

  // Step 2: Check region users from ENV (REGION_USERS + USER_PASSWORD_MAP)
  const regionUserResult = await checkRegionUser(normalizedEmail, normalizedPassword);
  
  if (regionUserResult.isMatch && regionUserResult.user) {
    return {
      success: true,
      user: regionUserResult.user,
      source: 'region-user',
    };
  }

  // Step 3: Find user in file/env only
  const user = await getUserByEmail(normalizedEmail);
  if (!user) {
    return {
      success: false,
      error: "Invalid email or password",
    };
  }

  // Step 4: Verify password using bcrypt hash
  let isValid = false;
  try {
    isValid = await bcrypt.compare(normalizedPassword, user.passwordHash);
  } catch {
    return {
      success: false,
      error: "Invalid email or password",
    };
  }

  if (!isValid) {
    return {
      success: false,
      error: "Invalid email or password",
    };
  }

  // Forbid userId = 0 in sessions (security requirement)
  if (!user.id || user.id === 0) {
    console.error('[loginUseCase] Cannot create session: user has no valid ID');
    return {
      success: false,
      error: "Authentication configuration error",
    };
  }

  return {
    success: true,
    user,
    source: 'file',
  };
}
