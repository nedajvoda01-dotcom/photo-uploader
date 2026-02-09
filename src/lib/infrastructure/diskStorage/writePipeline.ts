/**
 * Write Pipeline: Unified 4-stage pipeline for all write operations (upload/delete/rename)
 * 
 * Stage A - Preflight: Validate, check limits, reject before upload
 * Stage B - Commit data: Upload bytes with retry
 * Stage C - Commit index: Lock, merge, atomic write, unlock
 * Stage D - Verify: Check consistency, mark dirty if needed
 */

import { 
  exists, 
  downloadFile, 
  uploadText, 
  uploadToYandexDisk, 
  listFolder, 
  deleteFile,
  type UploadParams 
} from "@/lib/infrastructure/yandexDisk/client";
import { 
  readPhotosIndex, 
  rebuildPhotosIndex, 
  type PhotoIndex, 
  type PhotoItem 
} from "@/lib/infrastructure/diskStorage/carsRepo";
import { assertDiskPath, normalizeDiskPath } from "@/lib/domain/disk/paths";
import { 
  MAX_PHOTOS_PER_SLOT, 
  MAX_SLOT_SIZE_MB, 
  LOCK_TTL_MS,
  DEBUG_WRITE_PIPELINE 
} from "@/lib/config/disk";

/**
 * Lock metadata structure
 */
interface LockMetadata {
  locked_by: string;
  locked_at: string;
  expires_at: string; // TTL timestamp
  operation: string;
  slot_path: string;
}

/**
 * Preflight check result
 */
export interface PreflightResult {
  success: boolean;
  error?: string;
  stage?: string;
  currentCount?: number;
  currentSizeMB?: number;
  maxPhotos?: number;
  maxSizeMB?: number;
}

/**
 * Upload operation result
 */
export interface WriteOperationResult {
  success: boolean;
  error?: string;
  stage?: string;
  uploadedFiles?: Array<{ name: string; size: number }>;
  attempts?: number;
}

/**
 * Stage A - Preflight
 * 
 * Requirements:
 * - normalize + assert path
 * - ensureDir(slot)
 * - read _PHOTOS.json (or reconcile)
 * - check limits: count < 40, size ≤ 20MB
 * 
 * Result: 41st file rejected BEFORE upload URL
 */
export async function preflight(
  slotPath: string,
  filesToAdd: Array<{ name: string; size: number }>,
  uploadedBy: string
): Promise<PreflightResult> {
  const stageLog = (msg: string) => {
    if (DEBUG_WRITE_PIPELINE) {
      console.log(`[WritePipeline:Preflight] ${msg}`);
    }
  };
  
  try {
    // 1. Normalize and validate path
    stageLog(`Normalizing path: ${slotPath}`);
    const normalizedPath = assertDiskPath(slotPath, 'preflight');
    stageLog(`Normalized to: ${normalizedPath}`);
    
    // 2. Read or reconcile _PHOTOS.json
    stageLog(`Reading _PHOTOS.json from ${normalizedPath}`);
    let photosIndex = await readPhotosIndex(normalizedPath);
    
    if (!photosIndex) {
      stageLog(`No _PHOTOS.json found, reconciling...`);
      photosIndex = await rebuildPhotosIndex(normalizedPath);
    }
    
    const currentCount = photosIndex?.count || 0;
    const currentItems = photosIndex?.items || [];
    
    // Calculate current size
    const currentSizeBytes = currentItems.reduce((sum, item) => sum + item.size, 0);
    const currentSizeMB = currentSizeBytes / (1024 * 1024);
    
    stageLog(`Current state: ${currentCount} files, ${currentSizeMB.toFixed(2)}MB`);
    
    // 3. Check count limit
    const newCount = currentCount + filesToAdd.length;
    if (newCount > MAX_PHOTOS_PER_SLOT) {
      stageLog(`❌ Count limit exceeded: ${newCount} > ${MAX_PHOTOS_PER_SLOT}`);
      return {
        success: false,
        error: `Photo limit exceeded. Current: ${currentCount}, attempting to add: ${filesToAdd.length}, max: ${MAX_PHOTOS_PER_SLOT}`,
        stage: 'preflight_count_limit',
        currentCount,
        maxPhotos: MAX_PHOTOS_PER_SLOT,
      };
    }
    
    // 4. Check size limit
    const newSizeBytes = filesToAdd.reduce((sum, f) => sum + f.size, 0);
    const newSizeMB = newSizeBytes / (1024 * 1024);
    const totalSizeMB = currentSizeMB + newSizeMB;
    
    if (totalSizeMB > MAX_SLOT_SIZE_MB) {
      stageLog(`❌ Size limit exceeded: ${totalSizeMB.toFixed(2)}MB > ${MAX_SLOT_SIZE_MB}MB`);
      return {
        success: false,
        error: `Slot size limit exceeded. Current: ${currentSizeMB.toFixed(2)}MB, adding: ${newSizeMB.toFixed(2)}MB, max: ${MAX_SLOT_SIZE_MB}MB`,
        stage: 'preflight_size_limit',
        currentSizeMB,
        maxSizeMB: MAX_SLOT_SIZE_MB,
      };
    }
    
    stageLog(`✅ Preflight passed: ${newCount} files, ${totalSizeMB.toFixed(2)}MB`);
    
    return {
      success: true,
      currentCount,
      currentSizeMB,
      maxPhotos: MAX_PHOTOS_PER_SLOT,
      maxSizeMB: MAX_SLOT_SIZE_MB,
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stageLog(`❌ Preflight error: ${message}`);
    return {
      success: false,
      error: `Preflight failed: ${message}`,
      stage: 'preflight_error',
    };
  }
}

/**
 * Stage B - Commit data
 * 
 * Requirements:
 * - get upload URL
 * - upload bytes
 * - retry on 429/5xx with backoff
 * - log {stage:"uploadBytes", attempts}
 */
export async function commitData(
  slotPath: string,
  files: Array<{ name: string; bytes: Buffer; contentType: string }>
): Promise<WriteOperationResult> {
  const stageLog = (msg: string) => {
    if (DEBUG_WRITE_PIPELINE) {
      console.log(`[WritePipeline:CommitData] ${msg}`);
    }
  };
  
  const uploadedFiles: Array<{ name: string; size: number }> = [];
  const uploadedPaths: string[] = [];
  
  try {
    for (const file of files) {
      const filePath = `${slotPath}/${file.name}`;
      let attempts = 0;
      let lastError: Error | null = null;
      
      stageLog(`Uploading ${file.name} (${file.bytes.length} bytes)...`);
      
      // Retry logic with backoff (handled by uploadToYandexDisk internally)
      const uploadParams: UploadParams = {
        path: filePath,
        bytes: file.bytes,
        contentType: file.contentType,
      };
      
      const result = await uploadToYandexDisk(uploadParams);
      attempts = 1; // uploadToYandexDisk handles internal retries
      
      if (!result.success) {
        throw new Error(`Upload failed for ${file.name}: ${result.error}`);
      }
      
      stageLog(`✅ Uploaded ${file.name} (attempts: ${attempts})`);
      
      uploadedFiles.push({
        name: file.name,
        size: file.bytes.length,
      });
      uploadedPaths.push(filePath);
    }
    
    stageLog(`✅ All files uploaded: ${uploadedFiles.length} files`);
    
    return {
      success: true,
      uploadedFiles,
      attempts: uploadedFiles.length,
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stageLog(`❌ Upload error: ${message}, rolling back...`);
    
    // Rollback: delete uploaded files
    for (const path of uploadedPaths) {
      try {
        await deleteFile(path);
        stageLog(`Rolled back: ${path}`);
      } catch (rollbackError) {
        stageLog(`Failed to rollback ${path}: ${rollbackError}`);
      }
    }
    
    return {
      success: false,
      error: `Data commit failed: ${message}`,
      stage: 'commitData_error',
    };
  }
}

/**
 * Acquire lock on slot
 * Creates _LOCK.json with TTL
 */
async function acquireLock(
  slotPath: string,
  uploadedBy: string,
  operation: string
): Promise<boolean> {
  const stageLog = (msg: string) => {
    if (DEBUG_WRITE_PIPELINE) {
      console.log(`[WritePipeline:Lock] ${msg}`);
    }
  };
  
  try {
    const lockPath = `${slotPath}/_LOCK.json`;
    
    // Check if lock already exists
    const lockExists = await exists(lockPath);
    
    if (lockExists) {
      // Check if lock is expired
      const lockFile = await downloadFile(lockPath);
      if (lockFile.success && lockFile.data) {
        try {
          const lockData = JSON.parse(lockFile.data.toString('utf-8')) as LockMetadata;
          const expiresAt = new Date(lockData.expires_at).getTime();
          const now = Date.now();
          
          if (now < expiresAt) {
            stageLog(`❌ Lock already held by ${lockData.locked_by}, expires at ${lockData.expires_at}`);
            return false;
          }
          
          stageLog(`⚠️ Lock expired, acquiring...`);
        } catch {
          stageLog(`⚠️ Invalid lock file, acquiring...`);
        }
      }
    }
    
    // Create lock
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
    
    const lockMetadata: LockMetadata = {
      locked_by: uploadedBy,
      locked_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      operation,
      slot_path: slotPath,
    };
    
    const result = await uploadText(lockPath, lockMetadata);
    
    if (result.success) {
      stageLog(`✅ Lock acquired, expires at ${expiresAt.toISOString()}`);
    }
    
    return result.success;
  } catch (error) {
    stageLog(`❌ Lock error: ${error}`);
    return false;
  }
}

/**
 * Release lock on slot
 * Deletes _LOCK.json
 */
async function releaseLock(slotPath: string): Promise<void> {
  const stageLog = (msg: string) => {
    if (DEBUG_WRITE_PIPELINE) {
      console.log(`[WritePipeline:Lock] ${msg}`);
    }
  };
  
  try {
    const lockPath = `${slotPath}/_LOCK.json`;
    await deleteFile(lockPath);
    stageLog(`✅ Lock released`);
  } catch (error) {
    stageLog(`⚠️ Failed to release lock: ${error}`);
  }
}

/**
 * Stage C - Commit index
 * 
 * Requirements:
 * - acquire _LOCK.json (TTL)
 * - reread _PHOTOS.json
 * - merge changes
 * - atomic write (tmp → rename)
 * - recalculate _SLOT.json
 * - release lock
 */
export async function commitIndex(
  slotPath: string,
  uploadedFiles: Array<{ name: string; size: number }>,
  uploadedBy: string
): Promise<WriteOperationResult> {
  const stageLog = (msg: string) => {
    if (DEBUG_WRITE_PIPELINE) {
      console.log(`[WritePipeline:CommitIndex] ${msg}`);
    }
  };
  
  let lockAcquired = false;
  
  try {
    // 1. Acquire lock
    stageLog(`Acquiring lock...`);
    lockAcquired = await acquireLock(slotPath, uploadedBy, 'upload');
    
    if (!lockAcquired) {
      return {
        success: false,
        error: 'Failed to acquire lock (slot may be locked by another operation)',
        stage: 'commitIndex_lock_failed',
      };
    }
    
    // 2. Reread _PHOTOS.json
    stageLog(`Rereading _PHOTOS.json...`);
    let currentIndex = await readPhotosIndex(slotPath);
    
    if (!currentIndex) {
      stageLog(`No index found, rebuilding...`);
      currentIndex = await rebuildPhotosIndex(slotPath);
    }
    
    // 3. Merge changes
    stageLog(`Merging ${uploadedFiles.length} new files...`);
    const existingItems = currentIndex?.items || [];
    const existingNames = new Set(existingItems.map(p => p.name));
    
    const newItems: PhotoItem[] = uploadedFiles
      .filter(f => !existingNames.has(f.name))
      .map(f => ({
        name: f.name,
        size: f.size,
        modified: new Date().toISOString(),
      }));
    
    const allItems = [...existingItems, ...newItems];
    
    const updatedIndex: PhotoIndex = {
      version: 1,
      updatedAt: new Date().toISOString(),
      count: allItems.length,
      limit: MAX_PHOTOS_PER_SLOT,
      cover: allItems.length > 0 ? allItems[0].name : null,
      items: allItems,
    };
    
    // 4. Atomic write: write to temp, then "rename" (actually just overwrite, Yandex Disk doesn't have rename for files)
    // Note: True atomic rename not available in Yandex Disk API, but we write with overwrite=true which is atomic
    stageLog(`Writing updated index...`);
    const photosIndexPath = `${slotPath}/_PHOTOS.json`;
    const writeResult = await uploadText(photosIndexPath, updatedIndex);
    
    if (!writeResult.success) {
      throw new Error(`Failed to write _PHOTOS.json: ${writeResult.error}`);
    }
    
    // 5. Recalculate _SLOT.json
    stageLog(`Updating _SLOT.json...`);
    const totalSizeBytes = allItems.reduce((sum, item) => sum + item.size, 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024);
    
    const slotData = {
      count: allItems.length,
      cover: updatedIndex.cover,
      total_size_mb: totalSizeMB,
      updated_at: updatedIndex.updatedAt,
    };
    
    const slotPath_ = `${slotPath}/_SLOT.json`;
    const slotWriteResult = await uploadText(slotPath_, slotData);
    
    if (!slotWriteResult.success) {
      stageLog(`⚠️ Failed to write _SLOT.json: ${slotWriteResult.error}`);
    }
    
    stageLog(`✅ Index committed: ${allItems.length} files, ${totalSizeMB.toFixed(2)}MB`);
    
    return {
      success: true,
      uploadedFiles,
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stageLog(`❌ Commit index error: ${message}`);
    return {
      success: false,
      error: `Index commit failed: ${message}`,
      stage: 'commitIndex_error',
    };
  } finally {
    // 6. Always release lock
    if (lockAcquired) {
      stageLog(`Releasing lock...`);
      await releaseLock(slotPath);
    }
  }
}

/**
 * Stage D - Verify
 * 
 * Requirements:
 * - verify index reflects operation
 * - if not → create _DIRTY.json
 * - system repairs on next read
 */
export async function verify(
  slotPath: string,
  expectedFiles: Array<{ name: string; size: number }>
): Promise<WriteOperationResult> {
  const stageLog = (msg: string) => {
    if (DEBUG_WRITE_PIPELINE) {
      console.log(`[WritePipeline:Verify] ${msg}`);
    }
  };
  
  try {
    stageLog(`Verifying index...`);
    
    // Read index
    const index = await readPhotosIndex(slotPath);
    
    if (!index) {
      stageLog(`❌ Index missing after commit`);
      await markDirty(slotPath, 'Index missing after commit');
      return {
        success: false,
        error: 'Index verification failed: index missing',
        stage: 'verify_index_missing',
      };
    }
    
    // Check that all expected files are in index
    const indexNames = new Set(index.items.map(item => item.name));
    const missingFiles = expectedFiles.filter(f => !indexNames.has(f.name));
    
    if (missingFiles.length > 0) {
      stageLog(`❌ Missing files in index: ${missingFiles.map(f => f.name).join(', ')}`);
      await markDirty(slotPath, `Missing files in index: ${missingFiles.map(f => f.name).join(', ')}`);
      return {
        success: false,
        error: `Index verification failed: ${missingFiles.length} files missing from index`,
        stage: 'verify_files_missing',
      };
    }
    
    stageLog(`✅ Verification passed: all ${expectedFiles.length} files in index`);
    
    return {
      success: true,
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stageLog(`❌ Verification error: ${message}`);
    await markDirty(slotPath, `Verification error: ${message}`);
    return {
      success: false,
      error: `Verification failed: ${message}`,
      stage: 'verify_error',
    };
  }
}

/**
 * Mark slot as dirty (needs reconciliation)
 * Creates _DIRTY.json with reason and timestamp
 */
async function markDirty(slotPath: string, reason: string): Promise<void> {
  const stageLog = (msg: string) => {
    if (DEBUG_WRITE_PIPELINE) {
      console.log(`[WritePipeline:Dirty] ${msg}`);
    }
  };
  
  try {
    const dirtyPath = `${slotPath}/_DIRTY.json`;
    const dirtyData = {
      marked_at: new Date().toISOString(),
      reason,
      slot_path: slotPath,
    };
    
    await uploadText(dirtyPath, dirtyData);
    stageLog(`⚠️ Marked dirty: ${reason}`);
  } catch (error) {
    stageLog(`❌ Failed to mark dirty: ${error}`);
  }
}

/**
 * Check if slot is marked as dirty
 */
export async function isDirty(slotPath: string): Promise<boolean> {
  try {
    return await exists(`${slotPath}/_DIRTY.json`);
  } catch {
    return false;
  }
}

/**
 * Clear dirty flag
 */
export async function clearDirty(slotPath: string): Promise<void> {
  try {
    await deleteFile(`${slotPath}/_DIRTY.json`);
  } catch {
    // Ignore errors
  }
}

/**
 * Execute full write pipeline
 * All 4 stages: Preflight → Commit data → Commit index → Verify
 */
export async function executeWritePipeline(
  slotPath: string,
  files: Array<{ name: string; bytes: Buffer; contentType: string; size: number }>,
  uploadedBy: string
): Promise<WriteOperationResult> {
  const stageLog = (msg: string) => {
    if (DEBUG_WRITE_PIPELINE) {
      console.log(`[WritePipeline] ${msg}`);
    }
  };
  
  stageLog(`=== Starting write pipeline for ${slotPath} ===`);
  
  // Stage A - Preflight
  stageLog(`Stage A: Preflight`);
  const preflightFiles = files.map(f => ({ name: f.name, size: f.size }));
  const preflightResult = await preflight(slotPath, preflightFiles, uploadedBy);
  
  if (!preflightResult.success) {
    stageLog(`❌ Pipeline aborted at preflight: ${preflightResult.error}`);
    return {
      success: false,
      error: preflightResult.error,
      stage: preflightResult.stage,
    };
  }
  
  stageLog(`✅ Preflight passed`);
  
  // Stage B - Commit data
  stageLog(`Stage B: Commit data`);
  const commitDataResult = await commitData(slotPath, files);
  
  if (!commitDataResult.success) {
    stageLog(`❌ Pipeline aborted at data commit: ${commitDataResult.error}`);
    return commitDataResult;
  }
  
  stageLog(`✅ Data committed: ${commitDataResult.uploadedFiles?.length} files`);
  
  // Stage C - Commit index
  stageLog(`Stage C: Commit index`);
  const uploadedFiles = commitDataResult.uploadedFiles || [];
  const commitIndexResult = await commitIndex(slotPath, uploadedFiles, uploadedBy);
  
  if (!commitIndexResult.success) {
    stageLog(`❌ Pipeline aborted at index commit: ${commitIndexResult.error}`);
    return commitIndexResult;
  }
  
  stageLog(`✅ Index committed`);
  
  // Stage D - Verify
  stageLog(`Stage D: Verify`);
  const verifyResult = await verify(slotPath, uploadedFiles);
  
  if (!verifyResult.success) {
    stageLog(`⚠️ Verification failed (marked dirty): ${verifyResult.error}`);
    // Don't fail the operation, just log and mark dirty
  } else {
    stageLog(`✅ Verification passed`);
  }
  
  stageLog(`=== Pipeline complete ===`);
  
  return {
    success: true,
    uploadedFiles,
  };
}
