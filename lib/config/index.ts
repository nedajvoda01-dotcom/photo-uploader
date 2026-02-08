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
  // Import locally to avoid circular dependencies
  const { AUTH_SECRET } = require('./auth');
  const { YANDEX_DISK_TOKEN, YANDEX_DISK_BASE_DIR, ZIP_MAX_FILES, ZIP_MAX_TOTAL_MB } = require('./disk');
  const { POSTGRES_URL, POSTGRES_URL_NON_POOLING } = require('./db');
  const { REGIONS, ADMIN_REGION } = require('./regions');
  const { getBootstrapAdmins } = require('./auth');
  const { AUTH_DEBUG } = require('./auth');
  const { REGION_USERS, USER_PASSWORD_MAP } = require('./regions');
  
  return {
    hasAuthSecret: !!AUTH_SECRET,
    hasYandexDiskToken: !!YANDEX_DISK_TOKEN,
    yandexDiskBaseDir: YANDEX_DISK_BASE_DIR,
    regions: REGIONS,
    adminRegion: ADMIN_REGION,
    hasPostgresUrl: !!POSTGRES_URL,
    hasPostgresUrlNonPooling: !!POSTGRES_URL_NON_POOLING,
    bootstrapAdminCount: getBootstrapAdmins(ADMIN_REGION).length,
    regionUserCount: Object.keys(REGION_USERS).reduce((sum: number, region: string) => sum + REGION_USERS[region].length, 0),
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

    // Import locally to avoid issues
    const { NODE_ENV, AUTH_DEBUG } = require('./auth');
    const { POSTGRES_URL, POSTGRES_URL_NON_POOLING } = require('./db');
    const { YANDEX_DISK_BASE_DIR, YANDEX_DISK_TOKEN } = require('./disk');
    const { ZIP_MAX_FILES, ZIP_MAX_TOTAL_MB } = require('./disk');
    const { REGIONS, REGION_USERS } = require('./regions');
    const { getBootstrapAdmins } = require('./auth');
    const { getAllRegionUsers, ADMIN_REGION } = require('./regions');

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
    const bootstrapAdmins = getBootstrapAdmins(ADMIN_REGION);
    const regionUsers = getAllRegionUsers();
    
    console.log(`Bootstrap Admins: ${bootstrapAdmins.length}`);
    bootstrapAdmins.forEach((admin: any, i: number) => {
      console.log(`  ${i + 1}. ${admin.email} (region: ${admin.region})`);
    });
    console.log('');
    
    console.log(`Regions: ${REGIONS.length}`);
    console.log(`  ${REGIONS.join(', ')}`);
    console.log('');
    
    console.log(`Region Users: ${regionUsers.length}`);
    REGIONS.forEach((region: string) => {
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
