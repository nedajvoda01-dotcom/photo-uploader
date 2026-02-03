/**
 * Yandex.Disk API integration for uploading files
 */

const YANDEX_DISK_API_BASE = "https://cloud-api.yandex.net/v1/disk";

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
