import fs from "fs";
import path from "path";

export interface User {
  email: string;
  passwordHash: string;
}

const USERS_FILE = path.join(process.cwd(), "data", "users.json");

/**
 * Load users from data/users.json
 * @returns Array of users
 * @throws Error if users.json doesn't exist or is invalid
 */
function loadUsers(): User[] {
  if (!fs.existsSync(USERS_FILE)) {
    throw new Error(
      `Users file not found: ${USERS_FILE}\n\n` +
        "Please create data/users.json based on data/users.example.json.\n" +
        "See README.md for instructions on how to generate password hashes."
    );
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
  const users = loadUsers();
  return users.find((user) => user.email === email);
}
