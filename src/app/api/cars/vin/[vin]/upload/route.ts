import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess, errorResponse, ErrorCodes, validateNotAllRegion } from "@/lib/apiHelpers";
import { getCarWithSlots, getSlot, updateSlotStats, checkPhotoLimit, writePhotosIndex, PhotoItem } from "@/lib/infrastructure/diskStorage/carsRepo";
import { uploadToYandexDisk, uploadText, exists, deleteFile } from "@/lib/infrastructure/yandexDisk/client";
import { getLockMarkerPath, validateSlot, sanitizeFilename, type SlotType } from "@/lib/domain/disk/paths";
import { MAX_FILE_SIZE_MB, MAX_TOTAL_UPLOAD_SIZE_MB, MAX_FILES_PER_UPLOAD, REGIONS_LIST } from "@/lib/config/index";

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
    // For admins with region=ALL, search all regions
    // For regular users, only search their assigned region
    const regionsToSearch = session.region === 'ALL' && session.role === 'admin'
      ? REGIONS_LIST
      : [session.region];
    
    let carData = null;
    
    // Search for car in regions
    for (const region of regionsToSearch) {
      const result = await getCarWithSlots(region, vin);
      if (result) {
        carData = result;
        break;
      }
    }
    
    if (!carData) {
      return errorResponse(
        ErrorCodes.CAR_NOT_FOUND,
        "Автомобиль не найден",
        404
      );
    }
    
    const { car } = carData;
    
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
    
    // Get slot from disk storage
    const slot = await getSlot(car.disk_root_path, slotType as SlotType, slotIndex);
    
    if (!slot) {
      return NextResponse.json(
        { error: "Slot not found" },
        { status: 404 }
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
    
    // Check photo limit BEFORE uploading (40 photos max per slot)
    const limitCheck = await checkPhotoLimit(slot.disk_slot_path, files.length);
    if (limitCheck.isAtLimit) {
      return NextResponse.json(
        { 
          error: `Slot photo limit reached. Maximum ${limitCheck.maxPhotos} photos per slot. Current: ${limitCheck.currentCount}, attempting to add: ${files.length}`,
          currentCount: limitCheck.currentCount,
          maxPhotos: limitCheck.maxPhotos,
        },
        { status: 413 }
      );
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
      
      // Create lock metadata with snake_case for consistency
      const lockMetadata = {
        slot_type: slotType,
        slot_index: slotIndex,
        uploaded_by: session.email || session.userId?.toString() || 'unknown',
        uploaded_at: new Date().toISOString(),
        file_count: uploadedFiles.length,
        total_size_mb: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
        files: uploadedFiles,
      };
      
      // Upload _LOCK.json
      const lockUploadResult = await uploadText(lockMarkerPath, lockMetadata);
      
      if (!lockUploadResult.success) {
        throw new Error(`Failed to create lock file: ${lockUploadResult.error}`);
      }
      
      // Update _SLOT.json with current stats (synchronous update)
      await updateSlotStats(slot.disk_slot_path);
      
      // Update _PHOTOS.json with uploaded files (synchronous update)
      const photoItems: PhotoItem[] = uploadedFiles.map(file => ({
        name: file.name,
        size: file.size,
        modified: new Date().toISOString(),
      }));
      await writePhotosIndex(slot.disk_slot_path, photoItems);
      
      // Get updated slot info from disk
      const updatedSlot = await getSlot(car.disk_root_path, slotType as SlotType, slotIndex);
      
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
