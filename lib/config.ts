/**
 * Unified configuration module - Single Source of Truth for all ENV variables
 * This module validates and exports all environment configuration
 */

// Critical ENV variables (fail-fast if missing at runtime, not at build time)
const AUTH_SECRET = process.env.AUTH_SECRET;
const YANDEX_DISK_TOKEN = process.env.YANDEX_DISK_TOKEN;

// Only fail-fast in non-build environments
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

if (!isBuildTime) {
  if (!AUTH_SECRET) {
    throw new Error("AUTH_SECRET environment variable is required");
  }
  
  // Validate AUTH_SECRET length (minimum 32 characters for security)
  if (AUTH_SECRET.length < 32) {
    throw new Error(`AUTH_SECRET must be at least 32 characters long (current: ${AUTH_SECRET.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
  }

  if (!YANDEX_DISK_TOKEN) {
    console.warn("WARNING: YANDEX_DISK_TOKEN is not configured. Upload functionality will fail.");
  }
}

// Database configuration
export const POSTGRES_URL = process.env.POSTGRES_URL || null;

// Yandex Disk configuration
export const YANDEX_DISK_BASE_DIR = process.env.YANDEX_DISK_BASE_DIR || "/Фото";

// Step 3 ZIP limits
export const ZIP_MAX_FILES = parseInt(process.env.ZIP_MAX_FILES || "500", 10);
export const ZIP_MAX_TOTAL_MB = parseInt(process.env.ZIP_MAX_TOTAL_MB || "1500", 10);

// Upload file size limits (Issue D)
export const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "50", 10); // per file
export const MAX_TOTAL_UPLOAD_SIZE_MB = parseInt(process.env.MAX_TOTAL_UPLOAD_SIZE_MB || "200", 10); // per request
export const MAX_FILES_PER_UPLOAD = parseInt(process.env.MAX_FILES_PER_UPLOAD || "50", 10);

// Archive retry configuration
export const ARCHIVE_RETRY_DELAY_MS = parseInt(process.env.ARCHIVE_RETRY_DELAY_MS || "1000", 10);

// Regions configuration (required)
const REGIONS_ENV = process.env.REGIONS;
if (!isBuildTime && !REGIONS_ENV) {
  throw new Error("REGIONS environment variable is required (comma-separated list, e.g., 'R1,R2,R3,K1,V,S1,S2')");
}
// Normalize regions: trim + toUpperCase
export const REGIONS = REGIONS_ENV ? REGIONS_ENV.split(",").map(r => r.trim().toUpperCase()).filter(r => r.length > 0) : [];

if (!isBuildTime && REGIONS.length === 0) {
  throw new Error("REGIONS must contain at least one region");
}

// Admin region (default: ALL)
export const ADMIN_REGION = process.env.ADMIN_REGION ? process.env.ADMIN_REGION.trim().toUpperCase() : "ALL";

// Validate ADMIN_REGION configuration
if (!isBuildTime) {
  // ADMIN_REGION can be "ALL" (special value for full access) or must be in REGIONS list
  if (ADMIN_REGION !== "ALL" && REGIONS.length > 0 && !REGIONS.includes(ADMIN_REGION)) {
    console.warn(
      `WARNING: ADMIN_REGION is set to "${ADMIN_REGION}" but this region is not in REGIONS list [${REGIONS.join(', ')}]. ` +
      `Admins will only have access to region "${ADMIN_REGION}". ` +
      `Consider setting ADMIN_REGION="ALL" for full admin access.`
    );
  }
}

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

if (!isBuildTime && !hasAdmin1 && !hasAdmin2 && !POSTGRES_URL) {
  console.warn(
    "WARNING: No bootstrap admin configured and no database connection. " +
    "You must configure at least one of: " +
    "(ADMIN_EMAIL + ADMIN_PASSWORD/ADMIN_PASSWORD_HASH), " +
    "(ADMIN_EMAIL_2 + ADMIN_PASSWORD_2/ADMIN_PASSWORD_HASH_2), " +
    "or POSTGRES_URL with users in database."
  );
}

// Auth configuration
// AUTH_DEBUG accepts both "1" (legacy) and "true" for flexibility
export const AUTH_DEBUG = process.env.AUTH_DEBUG === "1" || process.env.AUTH_DEBUG === "true";

// Node environment (development or production)
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

// Region-based user mappings (REGION_<REGION>_USERS)
// Format: email1@x.com,email2@x.com (no spaces)
interface RegionUsers {
  [region: string]: string[];
}

export const REGION_USERS: RegionUsers = {};

if (!isBuildTime) {
  for (const region of REGIONS) {
    const envKey = `REGION_${region}_USERS`;
    const usersEnv = process.env[envKey];
    if (usersEnv) {
      REGION_USERS[region] = usersEnv.split(',').map(email => email.trim().toLowerCase()).filter(email => email.length > 0);
    } else {
      REGION_USERS[region] = [];
    }
  }
}

// User password map (USER_PASSWORD_MAP)
// Format: email1:password1,email2:password2
interface UserPasswordMap {
  [email: string]: string;
}

export const USER_PASSWORD_MAP: UserPasswordMap = {};

if (!isBuildTime) {
  const passwordMapEnv = process.env.USER_PASSWORD_MAP;
  if (passwordMapEnv) {
    const pairs = passwordMapEnv.split(',');
    for (const pair of pairs) {
      const [email, password] = pair.split(':').map(s => s.trim());
      if (email && password) {
        // Normalize email to lowercase, but keep password as-is
        USER_PASSWORD_MAP[email.toLowerCase()] = password;
      }
    }
  }
}

// Validation: Each email in REGION_*_USERS should have a password
if (!isBuildTime) {
  const allRegionUsers: string[] = [];
  const emailToRegion: Map<string, string[]> = new Map();
  const missingPasswords: string[] = [];
  
  for (const [region, users] of Object.entries(REGION_USERS)) {
    for (const email of users) {
      allRegionUsers.push(email);
      
      // Track which regions this email appears in
      if (!emailToRegion.has(email)) {
        emailToRegion.set(email, []);
      }
      emailToRegion.get(email)!.push(region);
      
      // Check if email has a password in USER_PASSWORD_MAP
      if (!USER_PASSWORD_MAP[email]) {
        missingPasswords.push(`${email} (region: ${region})`);
      }
    }
  }
  
  // Warn about missing passwords but don't throw (allow service to start)
  if (missingPasswords.length > 0) {
    console.warn(
      `\nWARNING: Missing passwords in USER_PASSWORD_MAP for the following region users:\n` +
      missingPasswords.map(email => `  - ${email}`).join('\n') + '\n' +
      `These users will not be able to log in until passwords are added to USER_PASSWORD_MAP.\n` +
      `Format: email1:password1,email2:password2\n`
    );
  }
  
  // Check for email duplicates across regions (this is an error)
  const duplicates: string[] = [];
  for (const [email, regions] of emailToRegion.entries()) {
    if (regions.length > 1) {
      duplicates.push(`${email} (regions: ${regions.join(', ')})`);
    }
  }
  
  if (duplicates.length > 0) {
    console.warn(
      `\nWARNING: Email duplicates found across regions:\n` +
      duplicates.map(d => `  - ${d}`).join('\n') + '\n' +
      `Each user must belong to exactly one region. Using first occurrence.\n`
    );
  }
}

// Database configuration - support both pooled and non-pooled
export const POSTGRES_URL_NON_POOLING = process.env.POSTGRES_URL_NON_POOLING || null;

// Legacy ENV (kept for backward compatibility but not SSOT)
// UPLOAD_DIR is legacy - new code should use YANDEX_DISK_BASE_DIR
export const LEGACY_UPLOAD_DIR = process.env.UPLOAD_DIR || "/mvp_uploads";
export const UPLOAD_MAX_MB = parseInt(process.env.UPLOAD_MAX_MB || "20", 10);

// Export AUTH_SECRET and YANDEX_DISK_TOKEN as named exports
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
      email: ADMIN_EMAIL.trim().toLowerCase(),
      password: ADMIN_PASSWORD || undefined,
      passwordHash: ADMIN_PASSWORD_HASH || undefined,
      region: ADMIN_REGION,
      role: "admin",
    });
  }

  if (ADMIN_EMAIL_2 && (ADMIN_PASSWORD_2 || ADMIN_PASSWORD_HASH_2)) {
    admins.push({
      email: ADMIN_EMAIL_2.trim().toLowerCase(),
      password: ADMIN_PASSWORD_2 || undefined,
      passwordHash: ADMIN_PASSWORD_HASH_2 || undefined,
      region: ADMIN_REGION,
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
    hash = hash & hash; // Convert to 32bit integer
  }
  // Return negative number to distinguish from DB IDs
  // Use absolute value and negate to ensure it's always negative
  return -(Math.abs(hash) % 2147483647 + 1);
}

/**
 * Get region for a user email from REGION_USERS mappings
 * Returns region code if found, null otherwise
 */
export function getRegionForUser(email: string): string | null {
  for (const [region, users] of Object.entries(REGION_USERS)) {
    if (users.includes(email)) {
      return region;
    }
  }
  return null;
}

/**
 * Get all users from REGION_USERS and USER_PASSWORD_MAP
 * Returns array of user configurations
 */
export function getAllRegionUsers(): Array<{
  email: string;
  password: string;
  region: string;
  role: string;
}> {
  const users = [];
  
  for (const [region, emails] of Object.entries(REGION_USERS)) {
    for (const email of emails) {
      const password = USER_PASSWORD_MAP[email];
      if (password) {
        users.push({
          email,
          password,
          region,
          role: 'user',
        });
      }
    }
  }
  
  return users;
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
    hasPostgresUrlNonPooling: !!POSTGRES_URL_NON_POOLING,
    bootstrapAdminCount: getBootstrapAdmins().length,
    regionUserCount: Object.keys(REGION_USERS).reduce((sum, region) => sum + REGION_USERS[region].length, 0),
    userPasswordMapCount: Object.keys(USER_PASSWORD_MAP).length,
    zipMaxFiles: ZIP_MAX_FILES,
    zipMaxTotalMB: ZIP_MAX_TOTAL_MB,
    authDebug: AUTH_DEBUG,
  };
}

/**
 * Log startup configuration summary (without secrets)
 * Should be called once at application startup
 * 
 * Note: This function is safe to call in both server and edge environments,
 * but will only log in traditional Node.js server environments.
 */
export function logStartupConfig() {
  // Skip in browser and edge runtime environments
  try {
    // Check if we're in a server environment where console.log is meaningful
    if (typeof window !== 'undefined') {
      return;
    }
    
    // Check if we have access to process (may not exist in Edge Runtime)
    if (typeof process === 'undefined') {
      return;
    }

  console.log('\n========================================');
  console.log('APPLICATION CONFIGURATION');
  console.log('========================================');
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Auth Debug: ${AUTH_DEBUG ? 'ENABLED' : 'disabled'}`);
  console.log('');
  
  // Database mode
  const dbMode = POSTGRES_URL || POSTGRES_URL_NON_POOLING ? 'Database' : 'File/ENV';
  console.log(`Auth Mode: ${dbMode}`);
  if (POSTGRES_URL) {
    console.log('  - Using POSTGRES_URL (pooled)');
  }
  if (POSTGRES_URL_NON_POOLING) {
    console.log('  - Using POSTGRES_URL_NON_POOLING (direct)');
  }
  console.log('');
  
  // Users and regions
  const bootstrapAdmins = getBootstrapAdmins();
  const regionUsers = getAllRegionUsers();
  
  console.log(`Bootstrap Admins: ${bootstrapAdmins.length}`);
  bootstrapAdmins.forEach((admin, i) => {
    console.log(`  ${i + 1}. ${admin.email} (region: ${admin.region})`);
  });
  console.log('');
  
  console.log(`Regions: ${REGIONS.length}`);
  console.log(`  ${REGIONS.join(', ')}`);
  console.log('');
  
  console.log(`Region Users: ${regionUsers.length}`);
  REGIONS.forEach(region => {
    const users = REGION_USERS[region] || [];
    console.log(`  ${region}: ${users.length} user(s)`);
  });
  console.log('');
  
  // Yandex Disk
  console.log('Yandex Disk:');
  console.log(`  Base Dir: ${YANDEX_DISK_BASE_DIR}`);
  console.log(`  Token: ${YANDEX_DISK_TOKEN ? 'configured' : 'NOT CONFIGURED'}`);
  console.log('');
  
  // Limits
  console.log('ZIP Download Limits:');
  console.log(`  Max Files: ${ZIP_MAX_FILES}`);
  console.log(`  Max Total Size: ${ZIP_MAX_TOTAL_MB} MB`);
  console.log('========================================\n');
  } catch {
    // Silently fail if logging is not available (e.g., in Edge Runtime)
    return;
  }
}
