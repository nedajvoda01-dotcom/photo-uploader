import fs from "fs";
import path from "path";

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
 * @param email User's email address
 * @returns User object if found, undefined otherwise
 */
export function getUserByEmail(email: string): User | undefined {
  // Try to load users from file first (priority over env)
  const users = loadUsers();
  
  if (users !== null) {
    // File exists and was loaded successfully
    return users.find((user) => user.email === email);
  }
  
  // Fallback to environment variables (for Vercel deployment)
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  
  if (adminEmail && adminPasswordHash && email === adminEmail) {
    return {
      email: adminEmail,
      passwordHash: adminPasswordHash,
    };
  }
  
  return undefined;
}
