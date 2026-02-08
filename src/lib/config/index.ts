/**
 * Unified Configuration Module
 * 
 * This is the main entry point for all configuration.
 * Re-exports from domain-specific config modules.
 * 
 * NOTE: process.env should ONLY be read in lib/config/** modules.
 * All other code should import from this module or domain-specific config modules.
 */

// Auth configuration
export {
  AUTH_SECRET,
  AUTH_DEBUG,
  NODE_ENV,
  IS_PRODUCTION,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_PASSWORD_HASH,
  ADMIN_EMAIL_2,
  ADMIN_PASSWORD_2,
  ADMIN_PASSWORD_HASH_2,
  getBootstrapAdmins,
  generateStableEnvUserId,
} from './auth';

// Database configuration
export {
  POSTGRES_URL,
  POSTGRES_URL_NON_POOLING,
} from './db';

// Disk/Upload configuration
export {
  YANDEX_DISK_TOKEN,
  YANDEX_DISK_BASE_DIR,
  ZIP_MAX_FILES,
  ZIP_MAX_TOTAL_MB,
  MAX_FILE_SIZE_MB,
  MAX_TOTAL_UPLOAD_SIZE_MB,
  MAX_FILES_PER_UPLOAD,
  ARCHIVE_RETRY_DELAY_MS,
  LEGACY_UPLOAD_DIR,
  UPLOAD_MAX_MB,
  validateZipLimits,
} from './disk';

// Regions configuration
export {
  REGIONS,
  ADMIN_REGION,
  REGION_USERS,
  USER_PASSWORD_MAP,
  getRegionForUser,
  getAllRegionUsers,
} from './regions';

// Re-export hasRegionAccess from domain layer (commonly used with config)
export { hasRegionAccess } from '@/lib/domain/region/validation';

/**
 * Configuration summary for debugging
 */
export function getConfigSummary() {
  // Import directly from modules
  const authConfig = import('./auth');
  const diskConfig = import('./disk');
  const dbConfig = import('./db');
  const regionsConfig = import('./regions');
  
  // Use already exported symbols
  const AUTH_SECRET_val = AUTH_SECRET;
  const YANDEX_DISK_TOKEN_val = YANDEX_DISK_TOKEN;
  const YANDEX_DISK_BASE_DIR_val = YANDEX_DISK_BASE_DIR;
  const ZIP_MAX_FILES_val = ZIP_MAX_FILES;
  const ZIP_MAX_TOTAL_MB_val = ZIP_MAX_TOTAL_MB;
  const POSTGRES_URL_val = POSTGRES_URL;
  const POSTGRES_URL_NON_POOLING_val = POSTGRES_URL_NON_POOLING;
  const REGIONS_val = REGIONS;
  const ADMIN_REGION_val = ADMIN_REGION;
  const bootstrapAdmins = getBootstrapAdmins(ADMIN_REGION);
  const AUTH_DEBUG_val = AUTH_DEBUG;
  const REGION_USERS_val = REGION_USERS;
  const USER_PASSWORD_MAP_val = USER_PASSWORD_MAP;
  
  return {
    hasAuthSecret: !!AUTH_SECRET_val,
    hasYandexDiskToken: !!YANDEX_DISK_TOKEN_val,
    yandexDiskBaseDir: YANDEX_DISK_BASE_DIR_val,
    regions: REGIONS_val,
    adminRegion: ADMIN_REGION_val,
    hasPostgresUrl: !!POSTGRES_URL_val,
    hasPostgresUrlNonPooling: !!POSTGRES_URL_NON_POOLING_val,
    bootstrapAdminCount: bootstrapAdmins.length,
    regionUserCount: Object.keys(REGION_USERS_val).reduce((sum: number, region: string) => sum + REGION_USERS_val[region].length, 0),
    userPasswordMapCount: Object.keys(USER_PASSWORD_MAP_val).length,
    zipMaxFiles: ZIP_MAX_FILES_val,
    zipMaxTotalMB: ZIP_MAX_TOTAL_MB_val,
    authDebug: AUTH_DEBUG_val,
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

    // Use already exported symbols
    const NODE_ENV_val = NODE_ENV;
    const AUTH_DEBUG_val = AUTH_DEBUG;
    const POSTGRES_URL_val = POSTGRES_URL;
    const POSTGRES_URL_NON_POOLING_val = POSTGRES_URL_NON_POOLING;
    const YANDEX_DISK_BASE_DIR_val = YANDEX_DISK_BASE_DIR;
    const YANDEX_DISK_TOKEN_val = YANDEX_DISK_TOKEN;
    const ZIP_MAX_FILES_val = ZIP_MAX_FILES;
    const ZIP_MAX_TOTAL_MB_val = ZIP_MAX_TOTAL_MB;
    const REGIONS_val = REGIONS;
    const REGION_USERS_val = REGION_USERS;
    const ADMIN_REGION_val = ADMIN_REGION;
    const bootstrapAdmins = getBootstrapAdmins(ADMIN_REGION_val);
    const regionUsers = getAllRegionUsers();

    console.log('\n========================================');
    console.log('APPLICATION CONFIGURATION');
    console.log('========================================');
    console.log(`Environment: ${NODE_ENV_val}`);
    console.log(`Auth Debug: ${AUTH_DEBUG_val ? 'ENABLED' : 'disabled'}`);
    console.log('');
    
    // Database mode
    const dbMode = POSTGRES_URL_val || POSTGRES_URL_NON_POOLING_val ? 'Database' : 'File/ENV';
    console.log(`Auth Mode: ${dbMode}`);
    if (POSTGRES_URL_val) {
      console.log('  - Using POSTGRES_URL (pooled)');
    }
    if (POSTGRES_URL_NON_POOLING_val) {
      console.log('  - Using POSTGRES_URL_NON_POOLING (direct)');
    }
    console.log('');
    
    // Users and regions
    console.log(`Bootstrap Admins: ${bootstrapAdmins.length}`);
    bootstrapAdmins.forEach((admin: { email: string; region: string }, i: number) => {
      console.log(`  ${i + 1}. ${admin.email} (region: ${admin.region})`);
    });
    console.log('');
    
    console.log(`Regions: ${REGIONS_val.length}`);
    console.log(`  ${REGIONS_val.join(', ')}`);
    console.log('');
    
    console.log(`Region Users: ${regionUsers.length}`);
    REGIONS_val.forEach((region: string) => {
      const users = REGION_USERS_val[region] || [];
      console.log(`  ${region}: ${users.length} user(s)`);
    });
    console.log('');
    
    // Yandex Disk
    console.log('Yandex Disk:');
    console.log(`  Base Dir: ${YANDEX_DISK_BASE_DIR_val}`);
    console.log(`  Token: ${YANDEX_DISK_TOKEN_val ? 'configured' : 'NOT CONFIGURED'}`);
    console.log('');
    
    // Limits
    console.log('ZIP Download Limits:');
    console.log(`  Max Files: ${ZIP_MAX_FILES_val}`);
    console.log(`  Max Total Size: ${ZIP_MAX_TOTAL_MB_val} MB`);
    console.log('========================================\n');
  } catch {
    // Silently fail if logging is not available (e.g., in Edge Runtime)
    return;
  }
}
