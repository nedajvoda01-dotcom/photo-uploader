/**
 * Auth Configuration
 * Single source of truth for authentication-related environment variables
 */

// Critical ENV variables (fail-fast if missing at runtime, not at build time)
const AUTH_SECRET = process.env.AUTH_SECRET;

// Only fail-fast in non-build environments
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

if (!isBuildTime) {
  if (!AUTH_SECRET) {
    throw new Error("AUTH_SECRET environment variable is required");
  }
  
  // Validate AUTH_SECRET length (minimum 32 characters for security)
  if (AUTH_SECRET.length < 32) {
    throw new Error('AUTH_SECRET must be at least 32 characters long. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
}

// Export AUTH_SECRET
export { AUTH_SECRET };

// Auth debug mode
// AUTH_DEBUG accepts both "1" (legacy) and "true" for flexibility
export const AUTH_DEBUG = process.env.AUTH_DEBUG === "1" || process.env.AUTH_DEBUG === "true";

// Node environment (development or production)
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

// Bootstrap admin credentials (2 pairs supported)
// Admin pair #1
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || null;
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;
export const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || null;

// Admin pair #2 (optional but support is mandatory)
export const ADMIN_EMAIL_2 = process.env.ADMIN_EMAIL_2 || null;
export const ADMIN_PASSWORD_2 = process.env.ADMIN_PASSWORD_2 || null;
export const ADMIN_PASSWORD_HASH_2 = process.env.ADMIN_PASSWORD_HASH_2 || null;

/**
 * Get all bootstrap admin credentials
 * Returns array of admin configurations
 */
export function getBootstrapAdmins(adminRegion: string): Array<{
  email: string;
  password?: string;
  passwordHash?: string;
  region: string;
  role: string;
}> {
  const admins = [];

  if (ADMIN_EMAIL && (ADMIN_PASSWORD || ADMIN_PASSWORD_HASH)) {
    admins.push({
      email: ADMIN_EMAIL.trim().toLowerCase(),
      password: ADMIN_PASSWORD || undefined,
      passwordHash: ADMIN_PASSWORD_HASH || undefined,
      region: adminRegion,
      role: "admin",
    });
  }

  if (ADMIN_EMAIL_2 && (ADMIN_PASSWORD_2 || ADMIN_PASSWORD_HASH_2)) {
    admins.push({
      email: ADMIN_EMAIL_2.trim().toLowerCase(),
      password: ADMIN_PASSWORD_2 || undefined,
      passwordHash: ADMIN_PASSWORD_HASH_2 || undefined,
      region: adminRegion,
      role: "admin",
    });
  }

  return admins;
}

/**
 * Generate a stable numeric ID for ENV-based users
 * Uses simple hash of email to create deterministic but unique IDs
 * IDs are negative to distinguish from real DB IDs (which are positive)
 */
export function generateStableEnvUserId(email: string): number {
  // Simple hash function that generates negative IDs
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash | 0; // Convert to 32bit signed integer
  }
  // Return negative number to distinguish from DB IDs
  // Use absolute value and negate to ensure it's always negative
  return -(Math.abs(hash) % 2147483647 + 1);
}
