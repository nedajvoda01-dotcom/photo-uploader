/**
 * Disk/Upload Configuration
 * Single source of truth for Yandex Disk and upload-related environment variables
 */

import { normalizeDiskPath } from "@/lib/domain/disk/paths";

// Yandex Disk configuration
const YANDEX_DISK_TOKEN = process.env.YANDEX_DISK_TOKEN;
const RAW_BASE_DIR = process.env.YANDEX_DISK_BASE_DIR || "/Фото";

// Validate base directory format
function validateBaseDirFormat(dir: string): string {
  if (!dir || typeof dir !== 'string') {
    throw new Error(`YANDEX_DISK_BASE_DIR is invalid: ${JSON.stringify(dir)}`);
  }
  
  // Apply canonical normalization
  try {
    const normalized = normalizeDiskPath(dir);
    
    // Additional validation after normalization
    if (normalized.match(/^[A-Z]:\//i)) {
      console.error(`ERROR: YANDEX_DISK_BASE_DIR looks like Windows path: ${dir}`);
      throw new Error(`YANDEX_DISK_BASE_DIR must be a Yandex Disk path, not a Windows path`);
    }
    
    return normalized;
  } catch (error) {
    console.error(`ERROR: Failed to normalize YANDEX_DISK_BASE_DIR: ${dir}`, error);
    throw error;
  }
}

export const YANDEX_DISK_BASE_DIR = validateBaseDirFormat(RAW_BASE_DIR);

// Only warn about missing token in non-build environments
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

if (!isBuildTime && !YANDEX_DISK_TOKEN) {
  console.warn("WARNING: YANDEX_DISK_TOKEN is not configured. Upload functionality will fail.");
}

// Export YANDEX_DISK_TOKEN
export { YANDEX_DISK_TOKEN };

// Step 3 ZIP limits
export const ZIP_MAX_FILES = parseInt(process.env.ZIP_MAX_FILES || "500", 10);
export const ZIP_MAX_TOTAL_MB = parseInt(process.env.ZIP_MAX_TOTAL_MB || "1500", 10);

// Upload file size limits (Issue D)
export const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "50", 10); // per file
export const MAX_TOTAL_UPLOAD_SIZE_MB = parseInt(process.env.MAX_TOTAL_UPLOAD_SIZE_MB || "200", 10); // per request
export const MAX_FILES_PER_UPLOAD = parseInt(process.env.MAX_FILES_PER_UPLOAD || "50", 10);

// Photo index limits
export const MAX_PHOTOS_PER_SLOT = parseInt(process.env.MAX_PHOTOS_PER_SLOT || "40", 10); // hard limit per slot

/**
 * Maximum total size for a slot in MB (20MB)
 * Used in Stage A - Preflight to reject uploads that would exceed slot size limit
 */
export const MAX_SLOT_SIZE_MB = parseInt(process.env.MAX_SLOT_SIZE_MB || "20", 10);

/**
 * TTL for _REGION.json cache in milliseconds (10 minutes default, configurable 10-30 min)
 * After this time, the cache is considered stale and will be rebuilt
 * Problem Statement #6: _REGION.json: 10-30 мин
 */
export const REGION_INDEX_TTL_MS = parseInt(process.env.REGION_INDEX_TTL_MS || "600000", 10); // 10 minutes

/**
 * TTL for _PHOTOS.json cache in milliseconds (2 minutes default, configurable 1-2 min)
 * After this time, the photo index is considered stale and will be reconciled
 * Problem Statement #6: _PHOTOS.json: 1-2 мин
 */
export const PHOTOS_INDEX_TTL_MS = parseInt(process.env.PHOTOS_INDEX_TTL_MS || "120000", 10); // 2 minutes

/**
 * TTL for _SLOT.json cache in milliseconds (2 minutes default, configurable 1-2 min)
 * After this time, the slot stats are considered stale and will be reconciled
 * Problem Statement #6: _SLOT.json: 1-2 мин
 */
export const SLOT_STATS_TTL_MS = parseInt(process.env.SLOT_STATS_TTL_MS || "120000", 10); // 2 minutes

/**
 * TTL for _LOCK.json in milliseconds (5 minutes)
 * Lock automatically expires after this time to prevent deadlocks
 * Used in Stage C - Commit index
 */
export const LOCK_TTL_MS = parseInt(process.env.LOCK_TTL_MS || "300000", 10); // 5 minutes

/**
 * Enable debug logging for region index operations
 */
export const DEBUG_REGION_INDEX = process.env.DEBUG_REGION_INDEX === '1' || process.env.DEBUG_REGION_INDEX === 'true';

/**
 * Enable debug logging for car/slot loading operations
 */
export const DEBUG_CAR_LOADING = process.env.DEBUG_CAR_LOADING === '1' || process.env.DEBUG_CAR_LOADING === 'true';

/**
 * Enable debug logging for write pipeline operations (upload/delete/rename)
 */
export const DEBUG_WRITE_PIPELINE = process.env.DEBUG_WRITE_PIPELINE === '1' || process.env.DEBUG_WRITE_PIPELINE === 'true';

// Debug configuration
export const DEBUG_DISK_CALLS = process.env.DEBUG_DISK_CALLS === '1' || process.env.DEBUG_DISK_CALLS === 'true';

// Archive retry configuration
export const ARCHIVE_RETRY_DELAY_MS = parseInt(process.env.ARCHIVE_RETRY_DELAY_MS || "1000", 10);

// Legacy ENV (kept for backward compatibility but not SSOT)
// UPLOAD_DIR is legacy - new code should use YANDEX_DISK_BASE_DIR
export const LEGACY_UPLOAD_DIR = process.env.UPLOAD_DIR || "/mvp_uploads";
export const UPLOAD_MAX_MB = parseInt(process.env.UPLOAD_MAX_MB || "20", 10);

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
