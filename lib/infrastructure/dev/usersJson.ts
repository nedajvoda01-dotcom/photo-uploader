/**
 * Infrastructure: Users JSON File Reader (Dev Only)
 * Reads users from data/users.json file
 * Only works in development mode
 */
import fs from "fs";
import path from "path";
import { ADMIN_EMAIL, ADMIN_PASSWORD_HASH, IS_PRODUCTION } from "@/lib/config/auth";

export interface User {
  email: string;
  passwordHash: string;
}

const USERS_FILE = path.join(process.cwd(), "data", "users.json");

/**
 * Load users from data/users.json
 * @returns Array of users or null if file doesn't exist
 */
function loadUsers(): User[] | null {
  // Only load users.json in development mode
  if (IS_PRODUCTION) {
    return null;
  }

  if (!fs.existsSync(USERS_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(USERS_FILE, "utf-8");
    const users = JSON.parse(content);

    if (!Array.isArray(users)) {
      throw new Error("users.json must contain an array of users");
    }

    return users;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${USERS_FILE}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get a user by email address
 * 
 * Note: This function intentionally does not cache the loaded users or environment
 * variables to allow for dynamic updates and avoid stale authentication data.
 * The file system operation is fast enough for authentication flows.
 * 
 * @param email User's email address
 * @returns User object if found, undefined otherwise
 */
export function getUserByEmail(email: string): User | undefined {
  // Normalize email for lookup
  const normalizedEmail = email.trim().toLowerCase();
  
  // Try to load users from file first (priority over env, dev only)
  const users = loadUsers();
  
  if (users !== null) {
    // File exists and was loaded successfully
    return users.find((user) => user.email.toLowerCase() === normalizedEmail);
  }
  
  // Fallback to environment variables (from config)
  if (ADMIN_EMAIL && ADMIN_PASSWORD_HASH && normalizedEmail === ADMIN_EMAIL.trim().toLowerCase()) {
    return {
      email: ADMIN_EMAIL,
      passwordHash: ADMIN_PASSWORD_HASH,
    };
  }
  
  return undefined;
}
