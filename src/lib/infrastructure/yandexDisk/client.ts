/**
 * Infrastructure: Yandex Disk Client
 * Integration with Yandex.Disk API for uploading files and managing folders
 */
import { YANDEX_DISK_TOKEN, DEBUG_DISK_CALLS } from "@/lib/config/disk";
import { assertDiskPath } from "@/lib/domain/disk/paths";

const YANDEX_DISK_API_BASE = "https://cloud-api.yandex.net/v1/disk";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Counter for generating unique request IDs
let requestIdCounter = 0;

/**
 * Generate a unique request ID for tracking API calls
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${++requestIdCounter}`;
}

/**
 * Log Disk API call for debugging (when DEBUG_DISK_CALLS is enabled)
 * Logs: {requestId, stage, normalizedPath}
 */
function logDiskApiCall(requestId: string, stage: string, normalizedPath: string): void {
  if (DEBUG_DISK_CALLS) {
    console.log(`[DiskAPI] ${JSON.stringify({ requestId, stage, normalizedPath })}`);
  }
}

export interface UploadParams {
  path: string; // Remote path on Yandex.Disk (e.g., "/mvp_uploads/photo.jpg")
  bytes: Uint8Array | Buffer; // File content as Uint8Array or Buffer
  contentType: string; // MIME type (e.g., "image/jpeg")
}

export interface UploadResult {
  success: boolean;
  error?: string;
  path?: string;
  stage?: string; // Stage where error occurred
}

/**
 * Validate and normalize a Yandex Disk path at API boundary
 * @param path - Path to validate and normalize
 * @param stage - Name of the operation stage (for error reporting)
 * @param requestId - Optional request ID for logging (generated if not provided)
 * @returns Object with normalized path and request ID
 * @throws Error with stage and normalized path if validation fails
 */
function validateAndNormalizePath(path: string, stage: string, requestId?: string): { normalizedPath: string; requestId: string } {
  const rid = requestId || generateRequestId();
  
  // Use assertDiskPath for validation and normalization
  const normalizedPath = assertDiskPath(path, stage);
  
  // Log the API call
  logDiskApiCall(rid, stage, normalizedPath);
  
  return { normalizedPath, requestId: rid };
}

/**
 * Convert Buffer or Uint8Array to ArrayBuffer for fetch body
 */
function convertToArrayBuffer(bytes: Uint8Array | Buffer): ArrayBuffer {
  if (bytes instanceof Buffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * Handles transient errors (5xx) with 2-3 attempts
 * Also retries 409 for race conditions during concurrent operations
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if this is a retryable error
      if (error instanceof Error) {
        const message = error.message;
        
        // Don't retry on 4xx errors EXCEPT 409 (conflict)
        const statusMatch = message.match(/\b(\d{3})\b/);
        if (statusMatch) {
          const status = parseInt(statusMatch[1]);
          
          // 409 is retryable for race conditions (e.g., concurrent folder creation)
          // 5xx are retryable (server errors)
          // Note: ensureDir() handles 409 as success internally, so it won't throw
          const isRetryable = status === 409 || status >= 500;
          
          if (status >= 400 && status < 500 && !isRetryable) {
            // This is a non-retryable 4xx client error
            throw error;
          }
        }
      }
      
      if (i < retries - 1) {
        const delay = RETRY_DELAY_MS * Math.pow(2, i);
        console.warn(`Retry ${i + 1}/${retries} after ${delay}ms due to:`, error);
        await sleep(delay);
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Ensure a directory exists on Yandex.Disk by creating it if necessary
 * Creates all parent directories recursively if they don't exist
 * Treats 409 (already exists) as success (idempotent)
 * 
 * @param path Directory path on Yandex.Disk (e.g., "/mvp_uploads" or "/mvp_uploads/2024/january")
 * @returns Promise that resolves when directory exists or is created
 */
async function ensureDir(path: string): Promise<void> {
  // Normalize and validate path at API boundary
  const { normalizedPath } = validateAndNormalizePath(path, 'ensureDir');
  
  // Split the path into segments and recursively create each directory
  const segments = normalizedPath.split("/").filter((seg) => seg.length > 0);
  
  for (let i = 0; i < segments.length; i++) {
    const currentPath = "/" + segments.slice(0, i + 1).join("/");
    
    try {
      const response = await fetch(
        `${YANDEX_DISK_API_BASE}/resources?path=${encodeURIComponent(currentPath)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
          },
        }
      );

      // 201 = created successfully
      // 409 = already exists (this is acceptable - idempotent)
      if (response.status === 201 || response.status === 409) {
        continue;
      }

      // Handle other errors
      const errorData = await response.json().catch(() => ({}));
      const errorDetails = Object.keys(errorData).length > 0 
        ? JSON.stringify(errorData) 
        : "No additional error details available";
      throw new Error(
        `[ensureDir] Failed at path: ${currentPath} - Status: ${response.status} ${response.statusText}. ${errorDetails}`
      );
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`[ensureDir] Unknown error at path: ${currentPath}`);
    }
  }
}

/**
 * Upload a file to Yandex.Disk
 * 
 * @param params Upload parameters including path, file bytes, and content type
 * @returns Upload result with success status and stage information
 */
export async function uploadToYandexDisk(
  params: UploadParams
): Promise<UploadResult> {
  const { path, bytes, contentType } = params;

  // Normalize and validate path at API boundary
  let normalizedPath: string;
  try {
    const result = validateAndNormalizePath(path, 'uploadToYandexDisk');
    normalizedPath = result.normalizedPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
      stage: 'path_validation'
    };
  }

  return withRetry(async () => {
    // Step 1: Ensure the directory exists
    // Extract directory path from the file path (e.g., "/mvp_uploads" from "/mvp_uploads/photo.jpg")
    const lastSlashIndex = normalizedPath.lastIndexOf("/");
    if (lastSlashIndex > 0) {
      const dirPath = normalizedPath.substring(0, lastSlashIndex);
      
      try {
        await ensureDir(dirPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[YandexDisk] ensureDir failed for path: ${dirPath}`, error);
        throw new Error(`[ensureDir] Failed to create directory '${dirPath}': ${message}`);
      }
    }

    // Step 2: Get upload URL from Yandex.Disk
    let uploadUrl: string;
    try {
      const uploadUrlResponse = await fetch(
        `${YANDEX_DISK_API_BASE}/resources/upload?path=${encodeURIComponent(normalizedPath)}&overwrite=true`,
        {
          method: "GET",
          headers: {
            Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
          },
        }
      );

      if (!uploadUrlResponse.ok) {
        const errorData = await uploadUrlResponse.json().catch(() => ({}));
        throw new Error(`[getUploadUrl] Failed at path: ${normalizedPath} - Status: ${uploadUrlResponse.status} ${uploadUrlResponse.statusText}. ${JSON.stringify(errorData)}`);
      }

      const uploadUrlData = await uploadUrlResponse.json();
      uploadUrl = uploadUrlData.href;

      if (!uploadUrl) {
        throw new Error(`[getUploadUrl] No upload URL received from Yandex.Disk for path: ${normalizedPath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[YandexDisk] getUploadUrl failed:`, error);
      throw new Error(message);
    }

    // Step 3: Upload file to the received URL
    try {
      // Convert bytes to ArrayBuffer for proper fetch body handling
      const arrayBuffer = convertToArrayBuffer(bytes);
      const blob = new Blob([arrayBuffer], { type: contentType });
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error(`[uploadBytes] Failed at path: ${normalizedPath} - Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      return {
        success: true,
        path: normalizedPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[YandexDisk] uploadBytes failed:`, error);
      throw new Error(message);
    }
  }).catch(error => {
    console.error("Yandex.Disk upload error:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    
    // Extract stage from error message if present
    let stage = 'unknown';
    const stageMatch = message.match(/\[(ensureDir|getUploadUrl|uploadBytes)\]/);
    if (stageMatch) {
      stage = stageMatch[1];
    }
    
    return {
      success: false,
      error: message,
      stage,
    };
  });
}

/**
 * Create a folder on Yandex.Disk
 * @param path Folder path to create
 */
export async function createFolder(path: string): Promise<{ success: boolean; error?: string }> {
  // Normalize and validate path at API boundary
  let normalizedPath: string;
  try {
    const result = validateAndNormalizePath(path, 'createFolder');
    normalizedPath = result.normalizedPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message
    };
  }
  
  return withRetry(async () => {
    const url = `${YANDEX_DISK_API_BASE}/resources?path=${encodeURIComponent(normalizedPath)}`;
    
    const response = await fetch(
      url,
      {
        method: "PUT",
        headers: {
          Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
        },
      }
    );

    
    // 201 = created successfully, 409 = already exists (both acceptable - idempotent)
    if (response.status === 201 || response.status === 409) {
      return { success: true };
    }
    
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`[createFolder] Failed at path: ${normalizedPath} - Status: ${response.status} ${JSON.stringify(errorData)}`);
  }).catch(error => ({
    success: false,
    error: error instanceof Error ? error.message : "Unknown error occurred"
  }));
}

/**
 * Check if a path exists on Yandex.Disk
 * @param path Path to check
 */
export async function exists(path: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources?path=${encodeURIComponent(path)}`,
      {
        method: "GET",
        headers: {
          Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
        },
      }
    );
    
    return response.status === 200;
  } catch (error) {
    console.error("Error checking path existence:", error);
    return false;
  }
}

/**
 * List contents of a folder on Yandex.Disk
 * @param path Folder path to list
 */
export async function listFolder(path: string): Promise<{ 
  success: boolean; 
  items?: Array<{ name: string; type: string; path: string; size?: number }>; 
  error?: string 
}> {
  try {
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources?path=${encodeURIComponent(path)}`,
      {
        method: "GET",
        headers: {
          Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
        },
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `Failed to list folder: ${response.status} ${JSON.stringify(errorData)}`
      };
    }
    
    const data = await response.json();
    return {
      success: true,
      items: data._embedded?.items || []
    };
  } catch (error) {
    console.error("Error listing folder:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Upload text/JSON content to Yandex.Disk
 * @param path Remote path on Yandex.Disk
 * @param content Text or JSON content
 */
export async function uploadText(path: string, content: string | object): Promise<UploadResult> {
  const textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const bytes = Buffer.from(textContent, 'utf-8');
  
  return uploadToYandexDisk({
    path,
    bytes,
    contentType: 'application/json',
  });
}

/**
 * Publish a file or folder and get a public URL
 * @param path Path to publish
 */
export async function publish(path: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources/publish?path=${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
        },
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `Failed to publish: ${response.status} ${JSON.stringify(errorData)}`
      };
    }
    
    const data = await response.json();
    return {
      success: true,
      url: data.href
    };
  } catch (error) {
    console.error("Error publishing path:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Get download link for a file
 * @param path Path to get download link for
 */
export async function getDownloadLink(path: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources/download?path=${encodeURIComponent(path)}`,
      {
        method: "GET",
        headers: {
          Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
        },
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `Failed to get download link: ${response.status} ${JSON.stringify(errorData)}`
      };
    }
    
    const data = await response.json();
    return {
      success: true,
      url: data.href
    };
  } catch (error) {
    console.error("Error getting download link:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Delete a file or folder (permanently)
 * @param path Path to delete
 */
export async function deleteFolder(path: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources?path=${encodeURIComponent(path)}&permanently=true`,
      {
        method: "DELETE",
        headers: {
          Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
        },
      }
    );
    
    // 204 = deleted successfully
    // 202 = deletion in progress (async)
    // 404 = not found (acceptable, already deleted)
    if (response.status === 204 || response.status === 202 || response.status === 404) {
      return { success: true };
    }
    
    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: `Failed to delete: ${response.status} ${JSON.stringify(errorData)}`
    };
  } catch (error) {
    console.error("Error deleting path:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Delete a file (alias for deleteFolder, as Yandex Disk treats them the same)
 * @param path Path to file to delete
 */
export async function deleteFile(path: string): Promise<{ success: boolean; error?: string }> {
  return deleteFolder(path);
}

/**
 * Move/rename a folder or file on Yandex Disk
 * @param fromPath Source path on Yandex Disk
 * @param toPath Destination path on Yandex Disk
 * @param overwrite Whether to overwrite if destination exists (default: false)
 * @returns Promise with success status
 */
export async function moveFolder(
  fromPath: string, 
  toPath: string, 
  overwrite: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    // Ensure destination parent directory exists
    const destParent = toPath.substring(0, toPath.lastIndexOf('/'));
    if (destParent) {
      await ensureDir(destParent);
    }
    
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources/move?from=${encodeURIComponent(fromPath)}&path=${encodeURIComponent(toPath)}&overwrite=${overwrite}`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
        },
      }
    );
    
    // 201 = moved successfully
    // 202 = move in progress (async)
    if (response.status === 201 || response.status === 202) {
      return { success: true };
    }
    
    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: `Failed to move folder: ${response.status} - ${JSON.stringify(errorData)}`
    };
  } catch (error) {
    console.error("Error moving folder:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}


/**
 * Download file content from Yandex Disk
 * @param path Path to file on Yandex Disk
 * @returns File content as Buffer
 */
export async function downloadFile(path: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
  try {
    // First, get download link
    const linkResult = await getDownloadLink(path);
    if (!linkResult.success || !linkResult.url) {
      return {
        success: false,
        error: linkResult.error || "Failed to get download link"
      };
    }
    
    // Download file content
    const response = await fetch(linkResult.url);
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to download file: ${response.status}`
      };
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return {
      success: true,
      data: Buffer.from(arrayBuffer)
    };
  } catch (error) {
    console.error("Error downloading file:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}
