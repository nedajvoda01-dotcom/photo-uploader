/**
 * Disk/Upload Configuration
 * Single source of truth for Yandex Disk and upload-related environment variables
 */

// Yandex Disk configuration
const YANDEX_DISK_TOKEN = process.env.YANDEX_DISK_TOKEN;
export const YANDEX_DISK_BASE_DIR = process.env.YANDEX_DISK_BASE_DIR || "/Фото";

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
