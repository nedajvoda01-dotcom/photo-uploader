import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess, errorResponse, successResponse, ErrorCodes, validateNotAllRegion } from "@/lib/apiHelpers";
import { getCarByVin } from "@/lib/models/cars";
import { getCarSlot, lockCarSlot, type LockMetadata } from "@/lib/models/carSlots";
import { uploadToYandexDisk, uploadText, exists, deleteFile } from "@/lib/yandexDisk";
import { getLockMarkerPath, validateSlot, sanitizeFilename, type SlotType } from "@/lib/diskPaths";
import { MAX_FILE_SIZE_MB, MAX_TOTAL_UPLOAD_SIZE_MB, MAX_FILES_PER_UPLOAD } from "@/lib/config";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/**
 * POST /api/cars/vin/:vin/upload
 * Upload files to a specific slot using VIN
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const authResult = await requireAuth();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  const params = await context.params;
  const vin = params.vin.toUpperCase();
  
  if (!vin || vin.length !== 17) {
    return errorResponse(
      ErrorCodes.INVALID_VIN,
      "Неверный формат VIN. VIN должен содержать ровно 17 символов",
      400
    );
  }
  
  try {
    // Get car by VIN first (without region filter)
    const car = await getCarByVin(vin);
    
    if (!car) {
      return errorResponse(
        ErrorCodes.CAR_NOT_FOUND,
        "Автомобиль не найден",
        404
      );
    }
    
    // Check region permission
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    // Block uploads to ALL region (archive only)
    const allRegionCheck = validateNotAllRegion(car.region);
    if ('error' in allRegionCheck) {
      return allRegionCheck.error;
    }
    
    // Parse form data
    const formData = await request.formData();
    const slotType = formData.get("slotType") as string;
    const slotIndex = parseInt(formData.get("slotIndex") as string, 10);
    
    if (!slotType || isNaN(slotIndex)) {
      return NextResponse.json(
        { error: "slotType and slotIndex are required" },
        { status: 400 }
      );
    }
    
    // Validate slot
    if (!validateSlot(slotType as SlotType, slotIndex)) {
      return NextResponse.json(
        { error: "Invalid slot type and index combination" },
        { status: 400 }
      );
    }
    
    // Get slot from database
    const slot = await getCarSlot(car.id, slotType, slotIndex);
    
    if (!slot) {
      return NextResponse.json(
        { error: "Slot not found" },
        { status: 404 }
      );
    }
    
    // Check if slot is already locked
    if (slot.status === 'locked') {
      return NextResponse.json(
        { error: "Slot is already locked/filled" },
        { status: 409 }
      );
    }
    
    // Check for _LOCK.json on disk (SSOT)
    const lockMarkerPath = getLockMarkerPath(slot.disk_slot_path);
    const lockExists = await exists(lockMarkerPath);
    
    if (lockExists) {
      return NextResponse.json(
        { error: "Slot is locked on disk (_LOCK.json exists)" },
        { status: 409 }
      );
    }
    
    // Get all files from form data
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("file") && value instanceof File) {
        files.push(value);
      }
    }
    
    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }
    
    // Validate file size limits BEFORE reading files into memory
    if (files.length > MAX_FILES_PER_UPLOAD) {
      return NextResponse.json(
        { error: `Too many files. Maximum ${MAX_FILES_PER_UPLOAD} files per upload` },
        { status: 413 }
      );
    }
    
    let totalSize = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit` },
          { status: 413 }
        );
      }
      totalSize += file.size;
    }
    
    if (totalSize > MAX_TOTAL_UPLOAD_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `Total upload size exceeds ${MAX_TOTAL_UPLOAD_SIZE_MB}MB limit` },
        { status: 413 }
      );
    }
    
    // Validate file types
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Invalid file type: ${file.type}. Only images are allowed` },
          { status: 400 }
      );
      }
    }
    
    // Upload all files with rollback support
    const uploadedFiles: Array<{ name: string; size: number }> = [];
    const uploadedFilePaths: string[] = []; // Track paths for rollback
    
    try {
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = Buffer.from(arrayBuffer);
        
        // Sanitize filename to prevent directory traversal
        const safeFilename = sanitizeFilename(file.name);
        
        // Validate sanitized filename is not empty
        if (!safeFilename || safeFilename.length === 0) {
          throw new Error(`Invalid filename after sanitization: ${file.name}`);
        }
        
        const filePath = `${slot.disk_slot_path}/${safeFilename}`;
        
        const result = await uploadToYandexDisk({
          path: filePath,
          bytes,
          contentType: file.type,
        });
        
        if (!result.success) {
          throw new Error(`Upload failed for ${file.name}: ${result.error}`);
        }
        
        uploadedFilePaths.push(filePath); // Track for rollback
        uploadedFiles.push({
          name: safeFilename, // Store sanitized name
          size: file.size,
        });
      }
      
      // Create lock metadata
      const lockMetadata: LockMetadata = {
        carId: car.id,
        slotType: slotType,
        slotIndex: slotIndex,
        uploadedBy: session.email || session.userId?.toString() || 'unknown',
        uploadedAt: new Date().toISOString(),
        fileCount: uploadedFiles.length,
        files: uploadedFiles,
      };
      
      // Upload _LOCK.json
      const lockUploadResult = await uploadText(lockMarkerPath, lockMetadata);
      
      if (!lockUploadResult.success) {
        throw new Error(`Failed to create lock file: ${lockUploadResult.error}`);
      }
      
      // Update database
      const updatedSlot = await lockCarSlot(
        car.id,
        slotType,
        slotIndex,
        session.email || session.userId?.toString() || 'unknown',
        lockMetadata
      );
      
      return NextResponse.json({
        success: true,
        message: "Files uploaded successfully",
        slot: updatedSlot,
        uploadedFiles,
      });
      
    } catch (error) {
      // ROLLBACK: delete uploaded files
      console.error("Upload failed, rolling back...", error);
      
      for (const filePath of uploadedFilePaths) {
        try {
          await deleteFile(filePath);
        } catch (rollbackError) {
          console.error(`Failed to delete ${filePath} during rollback:`, rollbackError);
        }
      }
      
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Upload failed. All files rolled back." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error uploading files by VIN:", error);
    return NextResponse.json(
      { error: "Failed to upload files" },
      { status: 500 }
    );
  }
}
