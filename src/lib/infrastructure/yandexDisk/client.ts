/**
 * Infrastructure: Yandex Disk Client
 * Integration with Yandex.Disk API for uploading files and managing folders
 */
import { YANDEX_DISK_TOKEN } from "@/lib/config/disk";

const YANDEX_DISK_API_BASE = "https://cloud-api.yandex.net/v1/disk";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface UploadParams {
  path: string; // Remote path on Yandex.Disk (e.g., "/mvp_uploads/photo.jpg")
  bytes: Uint8Array | Buffer; // File content as Uint8Array or Buffer
  contentType: string; // MIME type (e.g., "image/jpeg")
}

export interface UploadResult {
  success: boolean;
  error?: string;
  path?: string;
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
      
      // Don't retry on 4xx errors (client errors)
      // Check if error message contains HTTP 4xx status code
      if (error instanceof Error) {
        const statusMatch = error.message.match(/\b4\d{2}\b/);
        if (statusMatch) {
          // This is a 4xx client error, don't retry
          throw error;
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
 * 
 * @param path Directory path on Yandex.Disk (e.g., "/mvp_uploads" or "/mvp_uploads/2024/january")
 * @returns Promise that resolves when directory exists or is created
 */
async function ensureDir(path: string): Promise<void> {
  // Split the path into segments and recursively create each directory
  const segments = path.split("/").filter((seg) => seg.length > 0);
  
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
      // 409 = already exists (this is acceptable)
      if (response.status === 201 || response.status === 409) {
        continue;
      }

      // Handle other errors
      const errorData = await response.json().catch(() => ({}));
      const errorDetails = Object.keys(errorData).length > 0 
        ? JSON.stringify(errorData) 
        : "No additional error details available";
      throw new Error(
        `Failed to ensure directory exists at ${currentPath}: ${response.status} ${response.statusText}. ${errorDetails}`
      );
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Unknown error ensuring directory exists at ${currentPath}`);
    }
  }
}

/**
 * Upload a file to Yandex.Disk
 * 
 * @param params Upload parameters including path, file bytes, and content type
 * @returns Upload result with success status
 */
export async function uploadToYandexDisk(
  params: UploadParams
): Promise<UploadResult> {
  const { path, bytes, contentType } = params;

  return withRetry(async () => {
    // Step 1: Ensure the directory exists
    // Extract directory path from the file path (e.g., "/mvp_uploads" from "/mvp_uploads/photo.jpg")
    const lastSlashIndex = path.lastIndexOf("/");
    if (lastSlashIndex > 0) {
      const dirPath = path.substring(0, lastSlashIndex);
      await ensureDir(dirPath);
    }

    // Step 2: Get upload URL from Yandex.Disk
    const uploadUrlResponse = await fetch(
      `${YANDEX_DISK_API_BASE}/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`,
      {
        method: "GET",
        headers: {
          Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
        },
      }
    );

    if (!uploadUrlResponse.ok) {
      const errorData = await uploadUrlResponse.json().catch(() => ({}));
      throw new Error(`Failed to get upload URL: ${uploadUrlResponse.status} ${uploadUrlResponse.statusText}. ${JSON.stringify(errorData)}`);
    }

    const uploadUrlData = await uploadUrlResponse.json();
    const uploadUrl = uploadUrlData.href;

    if (!uploadUrl) {
      throw new Error("No upload URL received from Yandex.Disk");
    }

    // Step 3: Upload file to the received URL
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
      throw new Error(`Failed to upload file: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    return {
      success: true,
      path: path,
    };
  }).catch(error => {
    console.error("Yandex.Disk upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  });
}

/**
 * Create a folder on Yandex.Disk
 * @param path Folder path to create
 */
export async function createFolder(path: string): Promise<{ success: boolean; error?: string }> {
  return withRetry(async () => {
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources?path=${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `OAuth ${YANDEX_DISK_TOKEN}`,
        },
      }
    );
    
    // 201 = created successfully, 409 = already exists (both acceptable)
    if (response.status === 201 || response.status === 409) {
      return { success: true };
    }
    
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to create folder: ${response.status} ${JSON.stringify(errorData)}`);
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
