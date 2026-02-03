import { NextRequest, NextResponse } from "next/server";
import { uploadToYandexDisk } from "@/lib/yandexDisk";

// Get configuration from environment
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/mvp_uploads";
const UPLOAD_MAX_MB = parseInt(process.env.UPLOAD_MAX_MB || "20", 10);
const MAX_FILE_SIZE = UPLOAD_MAX_MB * 1024 * 1024; // Convert MB to bytes

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds ${UPLOAD_MAX_MB}MB limit` },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only images are allowed (JPEG, PNG, GIF, WebP)" },
        { status: 400 }
      );
    }

    // Convert file to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    // Map MIME type to safe extension
    const mimeToExtension: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
    };
    const extension = mimeToExtension[file.type] || "jpg";
    const filename = `photo_${timestamp}.${extension}`;
    const remotePath = `${UPLOAD_DIR}/${filename}`;

    // Upload to Yandex.Disk
    const result = await uploadToYandexDisk({
      path: remotePath,
      bytes,
      contentType: file.type,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Upload failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "File uploaded successfully",
        path: result.path,
        filename,
        size: file.size,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
