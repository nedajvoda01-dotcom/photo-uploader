/**
 * Unified configuration module - Single Source of Truth for all ENV variables
 * This module validates and exports all environment configuration
 */

// Critical ENV variables (fail-fast if missing)
const AUTH_SECRET = process.env.AUTH_SECRET;
const YANDEX_DISK_TOKEN = process.env.YANDEX_DISK_TOKEN;

if (!AUTH_SECRET) {
  throw new Error("AUTH_SECRET environment variable is required");
}

if (!YANDEX_DISK_TOKEN) {
  throw new Error("YANDEX_DISK_TOKEN environment variable is required");
}

// Database configuration
export const POSTGRES_URL = process.env.POSTGRES_URL || null;

// Yandex Disk configuration
export const YANDEX_DISK_BASE_DIR = process.env.YANDEX_DISK_BASE_DIR || "/Фото";

// Step 3 ZIP limits
export const ZIP_MAX_FILES = parseInt(process.env.ZIP_MAX_FILES || "500", 10);
export const ZIP_MAX_TOTAL_MB = parseInt(process.env.ZIP_MAX_TOTAL_MB || "1500", 10);

// Regions configuration (required)
const REGIONS_ENV = process.env.REGIONS;
if (!REGIONS_ENV) {
  throw new Error("REGIONS environment variable is required (comma-separated list, e.g., 'R1,R2,R3,K1,V,S1,S2')");
}
export const REGIONS = REGIONS_ENV.split(",").map(r => r.trim()).filter(r => r.length > 0);

if (REGIONS.length === 0) {
  throw new Error("REGIONS must contain at least one region");
}

// Admin region (default: ALL)
export const ADMIN_REGION = process.env.ADMIN_REGION || "ALL";

// Bootstrap admin credentials (2 pairs supported)
// Admin pair #1
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || null;
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;
export const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || null;

// Admin pair #2 (optional but support is mandatory)
export const ADMIN_EMAIL_2 = process.env.ADMIN_EMAIL_2 || null;
export const ADMIN_PASSWORD_2 = process.env.ADMIN_PASSWORD_2 || null;
export const ADMIN_PASSWORD_HASH_2 = process.env.ADMIN_PASSWORD_HASH_2 || null;

// Validate admin pairs - at least one complete pair must be configured
const hasAdmin1 = ADMIN_EMAIL && (ADMIN_PASSWORD || ADMIN_PASSWORD_HASH);
const hasAdmin2 = ADMIN_EMAIL_2 && (ADMIN_PASSWORD_2 || ADMIN_PASSWORD_HASH_2);

if (!hasAdmin1 && !hasAdmin2 && !POSTGRES_URL) {
  console.warn(
    "WARNING: No bootstrap admin configured and no database connection. " +
    "You must configure at least one of: " +
    "(ADMIN_EMAIL + ADMIN_PASSWORD/ADMIN_PASSWORD_HASH), " +
    "(ADMIN_EMAIL_2 + ADMIN_PASSWORD_2/ADMIN_PASSWORD_HASH_2), " +
    "or POSTGRES_URL with users in database."
  );
}

// Auth configuration
export const AUTH_DEBUG = process.env.AUTH_DEBUG === "1";

// Legacy ENV (kept for backward compatibility but not SSOT)
// UPLOAD_DIR is legacy - new code should use YANDEX_DISK_BASE_DIR
export const LEGACY_UPLOAD_DIR = process.env.UPLOAD_DIR || "/mvp_uploads";
export const UPLOAD_MAX_MB = parseInt(process.env.UPLOAD_MAX_MB || "20", 10);

// Export AUTH_SECRET as named export (not default)
export { AUTH_SECRET, YANDEX_DISK_TOKEN };

/**
 * Get all bootstrap admin credentials
 * Returns array of admin configurations
 */
export function getBootstrapAdmins(): Array<{
  email: string;
  password?: string;
  passwordHash?: string;
  region: string;
  role: string;
}> {
  const admins = [];

  if (ADMIN_EMAIL && (ADMIN_PASSWORD || ADMIN_PASSWORD_HASH)) {
    admins.push({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD || undefined,
      passwordHash: ADMIN_PASSWORD_HASH || undefined,
      region: ADMIN_REGION,
      role: "admin",
    });
  }

  if (ADMIN_EMAIL_2 && (ADMIN_PASSWORD_2 || ADMIN_PASSWORD_HASH_2)) {
    admins.push({
      email: ADMIN_EMAIL_2,
      password: ADMIN_PASSWORD_2 || undefined,
      passwordHash: ADMIN_PASSWORD_HASH_2 || undefined,
      region: ADMIN_REGION,
      role: "admin",
    });
  }

  return admins;
}

/**
 * Check if a user has permission to access a specific region
 */
export function hasRegionAccess(userRegion: string, targetRegion: string): boolean {
  // Admin region (ALL) has access to everything
  if (userRegion === "ALL") {
    return true;
  }

  // User can only access their own region
  return userRegion === targetRegion;
}

/**
 * Validate ZIP download limits
 */
export function validateZipLimits(fileCount: number, totalSizeMB: number): {
  valid: boolean;
  error?: string;
} {
  if (fileCount > ZIP_MAX_FILES) {
    return {
      valid: false,
      error: `Too many files: ${fileCount}. Maximum allowed: ${ZIP_MAX_FILES}`,
    };
  }

  if (totalSizeMB > ZIP_MAX_TOTAL_MB) {
    return {
      valid: false,
      error: `Total size too large: ${totalSizeMB}MB. Maximum allowed: ${ZIP_MAX_TOTAL_MB}MB`,
    };
  }

  return { valid: true };
}

/**
 * Configuration summary for debugging
 */
export function getConfigSummary() {
  return {
    hasAuthSecret: !!AUTH_SECRET,
    hasYandexDiskToken: !!YANDEX_DISK_TOKEN,
    yandexDiskBaseDir: YANDEX_DISK_BASE_DIR,
    regions: REGIONS,
    adminRegion: ADMIN_REGION,
    hasPostgresUrl: !!POSTGRES_URL,
    bootstrapAdminCount: getBootstrapAdmins().length,
    zipMaxFiles: ZIP_MAX_FILES,
    zipMaxTotalMB: ZIP_MAX_TOTAL_MB,
    authDebug: AUTH_DEBUG,
  };
}
