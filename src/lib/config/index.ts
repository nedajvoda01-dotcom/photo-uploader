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

// Database configuration removed - no longer using DB

// Disk/Upload configuration
export {
  YANDEX_DISK_TOKEN,
  YANDEX_DISK_BASE_DIR,
  ZIP_MAX_FILES,
  ZIP_MAX_TOTAL_MB,
  MAX_FILE_SIZE_MB,
  MAX_TOTAL_UPLOAD_SIZE_MB,
  MAX_FILES_PER_UPLOAD,
  MAX_PHOTOS_PER_SLOT,
  DEBUG_DISK_CALLS,
  ARCHIVE_RETRY_DELAY_MS,
  LEGACY_UPLOAD_DIR,
  UPLOAD_MAX_MB,
  validateZipLimits,
} from './disk';

// Regions configuration
export {
  REGIONS,
  REGIONS_LIST,
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
  /* eslint-disable @typescript-eslint/no-require-imports */
  // Import from specific modules to avoid circular dependencies
  const authModule = require('./auth') as typeof import('./auth');
  const diskModule = require('./disk') as typeof import('./disk');
  const regionsModule = require('./regions') as typeof import('./regions');
  /* eslint-enable @typescript-eslint/no-require-imports */
  
  return {
    hasAuthSecret: !!authModule.AUTH_SECRET,
    hasYandexDiskToken: !!diskModule.YANDEX_DISK_TOKEN,
    yandexDiskBaseDir: diskModule.YANDEX_DISK_BASE_DIR,
    regions: regionsModule.REGIONS,
    adminRegion: regionsModule.ADMIN_REGION,
    bootstrapAdminCount: authModule.getBootstrapAdmins(regionsModule.ADMIN_REGION).length,
    regionUserCount: Object.keys(regionsModule.REGION_USERS).reduce((sum: number, region: string) => sum + regionsModule.REGION_USERS[region].length, 0),
    userPasswordMapCount: Object.keys(regionsModule.USER_PASSWORD_MAP).length,
    zipMaxFiles: diskModule.ZIP_MAX_FILES,
    zipMaxTotalMB: diskModule.ZIP_MAX_TOTAL_MB,
    authDebug: authModule.AUTH_DEBUG,
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

    /* eslint-disable @typescript-eslint/no-require-imports */
    // Import from specific modules
    const authModule = require('./auth') as typeof import('./auth');
    const diskModule = require('./disk') as typeof import('./disk');
    const regionsModule = require('./regions') as typeof import('./regions');
    /* eslint-enable @typescript-eslint/no-require-imports */
    
    const bootstrapAdmins = authModule.getBootstrapAdmins(regionsModule.ADMIN_REGION);
    const regionUsers = regionsModule.getAllRegionUsers();

    console.log('\n========================================');
    console.log('APPLICATION CONFIGURATION');
    console.log('========================================');
    console.log(`Environment: ${authModule.NODE_ENV}`);
    console.log(`Auth Debug: ${authModule.AUTH_DEBUG ? 'ENABLED' : 'disabled'}`);
    console.log('');
    
    // Auth mode (File/ENV only, DB removed)
    console.log('Auth Mode: File/ENV (Disk storage only)');
    console.log('');
    
    // Users and regions
    console.log(`Bootstrap Admins: ${bootstrapAdmins.length}`);
    bootstrapAdmins.forEach((admin: { email: string; region: string }, i: number) => {
      console.log(`  ${i + 1}. ${admin.email} (region: ${admin.region})`);
    });
    console.log('');
    
    console.log(`Regions: ${regionsModule.REGIONS.length}`);
    console.log(`  ${regionsModule.REGIONS.join(', ')}`);
    console.log('');
    
    console.log(`Region Users: ${regionUsers.length}`);
    regionsModule.REGIONS.forEach((region: string) => {
      const users = regionsModule.REGION_USERS[region] || [];
      console.log(`  ${region}: ${users.length} user(s)`);
    });
    console.log('');
    
    // Yandex Disk
    console.log('Yandex Disk:');
    console.log(`  Base Dir: ${diskModule.YANDEX_DISK_BASE_DIR}`);
    console.log(`  Token: ${diskModule.YANDEX_DISK_TOKEN ? 'configured' : 'NOT CONFIGURED'}`);
    console.log('');
    
    // Limits
    console.log('ZIP Download Limits:');
    console.log(`  Max Files: ${diskModule.ZIP_MAX_FILES}`);
    console.log(`  Max Total Size: ${diskModule.ZIP_MAX_TOTAL_MB} MB`);
    console.log('========================================\n');
  } catch {
    // Silently fail if logging is not available (e.g., in Edge Runtime)
    return;
  }
}
