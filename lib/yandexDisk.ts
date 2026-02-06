/**
 * Yandex.Disk API integration for uploading files and managing folders
 */

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
      if (error instanceof Error && error.message.includes('4')) {
        throw error;
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
  const token = process.env.YANDEX_DISK_TOKEN;

  if (!token) {
    throw new Error("YANDEX_DISK_TOKEN environment variable is not set");
  }

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
            Authorization: `OAuth ${token}`,
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
  const token = process.env.YANDEX_DISK_TOKEN;

  if (!token) {
    return {
      success: false,
      error: "YANDEX_DISK_TOKEN environment variable is not set",
    };
  }

  try {
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
          Authorization: `OAuth ${token}`,
        },
      }
    );

    if (!uploadUrlResponse.ok) {
      const errorData = await uploadUrlResponse.json().catch(() => ({}));
      return {
        success: false,
        error: `Failed to get upload URL: ${uploadUrlResponse.status} ${uploadUrlResponse.statusText}. ${JSON.stringify(errorData)}`,
      };
    }

    const uploadUrlData = await uploadUrlResponse.json();
    const uploadUrl = uploadUrlData.href;

    if (!uploadUrl) {
      return {
        success: false,
        error: "No upload URL received from Yandex.Disk",
      };
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
      return {
        success: false,
        error: `Failed to upload file: ${uploadResponse.status} ${uploadResponse.statusText}`,
      };
    }

    return {
      success: true,
      path: path,
    };
  } catch (error) {
    console.error("Yandex.Disk upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Create a folder on Yandex.Disk
 * @param path Folder path to create
 */
export async function createFolder(path: string): Promise<{ success: boolean; error?: string }> {
  return withRetry(async () => {
    const token = process.env.YANDEX_DISK_TOKEN;
    
    if (!token) {
      throw new Error("YANDEX_DISK_TOKEN environment variable is not set");
    }
    
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources?path=${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `OAuth ${token}`,
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
    const token = process.env.YANDEX_DISK_TOKEN;
    
    if (!token) {
      throw new Error("YANDEX_DISK_TOKEN environment variable is not set");
    }
    
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources?path=${encodeURIComponent(path)}`,
      {
        method: "GET",
        headers: {
          Authorization: `OAuth ${token}`,
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
export async function listFolder(path: string): Promise<{ success: boolean; items?: any[]; error?: string }> {
  try {
    const token = process.env.YANDEX_DISK_TOKEN;
    
    if (!token) {
      return {
        success: false,
        error: "YANDEX_DISK_TOKEN environment variable is not set"
      };
    }
    
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources?path=${encodeURIComponent(path)}`,
      {
        method: "GET",
        headers: {
          Authorization: `OAuth ${token}`,
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
    const token = process.env.YANDEX_DISK_TOKEN;
    
    if (!token) {
      return {
        success: false,
        error: "YANDEX_DISK_TOKEN environment variable is not set"
      };
    }
    
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources/publish?path=${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `OAuth ${token}`,
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
    const token = process.env.YANDEX_DISK_TOKEN;
    
    if (!token) {
      return {
        success: false,
        error: "YANDEX_DISK_TOKEN environment variable is not set"
      };
    }
    
    const response = await fetch(
      `${YANDEX_DISK_API_BASE}/resources/download?path=${encodeURIComponent(path)}`,
      {
        method: "GET",
        headers: {
          Authorization: `OAuth ${token}`,
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
