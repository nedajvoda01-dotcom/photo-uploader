import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarById } from "@/lib/infrastructure/db/carsRepo";
import { getCarSlot } from "@/lib/infrastructure/db/carSlotsRepo";
import { validateSlot, type SlotType } from "@/lib/domain/disk/paths";
import { listFolder } from "@/lib/infrastructure/yandexDisk/client";
import { validateZipLimits } from "@/lib/config/index";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/cars/:id/download?slotType=X&slotIndex=Y
 * Download all photos from a slot as ZIP
 * 
 * Requirements:
 * - Slot must be locked (status='locked')
 * - Respects ZIP_MAX_FILES and ZIP_MAX_TOTAL_MB limits
 * - Returns 409 if slot not locked
 * - Returns 413 if limits exceeded
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const authResult = await requireAuth();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  const params = await context.params;
  const carId = parseInt(params.id, 10);
  
  if (isNaN(carId)) {
    return NextResponse.json(
      { error: "Invalid car ID" },
      { status: 400 }
    );
  }
  
  // Get query parameters
  const { searchParams } = new URL(request.url);
  const slotType = searchParams.get("slotType");
  const slotIndexStr = searchParams.get("slotIndex");
  
  if (!slotType || !slotIndexStr) {
    return NextResponse.json(
      { error: "slotType and slotIndex query parameters are required" },
      { status: 400 }
    );
  }
  
  const slotIndex = parseInt(slotIndexStr, 10);
  
  if (isNaN(slotIndex)) {
    return NextResponse.json(
      { error: "Invalid slot index" },
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
  
  try {
    const car = await getCarById(carId);
    
    if (!car) {
      return NextResponse.json(
        { error: "Car not found" },
        { status: 404 }
      );
    }
    
    // Check region permission (admin with region=ALL can access all regions)
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    const slot = await getCarSlot(carId, slotType, slotIndex);
    
    if (!slot) {
      return NextResponse.json(
        { error: "Slot not found" },
        { status: 404 }
      );
    }
    
    // Check if slot is locked (Step 3 requirement: locked=true)
    if (slot.status !== 'locked') {
      return NextResponse.json(
        { error: "Slot is not locked - no files to download" },
        { status: 409 } // 409 Conflict
      );
    }
    
    // List files from Yandex Disk
    const result = await listFolder(slot.disk_slot_path);
    
    if (!result.success || !result.items) {
      return NextResponse.json(
        { error: result.error || "Failed to list files" },
        { status: 500 }
      );
    }
    
    // Filter out non-file items and _LOCK.json
    const files = result.items.filter(
      item => item.type === 'file' && item.name !== '_LOCK.json'
    );
    
    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files found in slot" },
        { status: 404 }
      );
    }
    
    // Calculate total size and validate limits
    const fileCount = files.length;
    const totalSizeBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const totalSizeMB = Math.ceil(totalSizeBytes / (1024 * 1024));
    
    const limitsCheck = validateZipLimits(fileCount, totalSizeMB);
    if (!limitsCheck.valid) {
      return NextResponse.json(
        { error: limitsCheck.error },
        { status: 413 } // 413 Payload Too Large
      );
    }
    
    // Return file list for client-side ZIP creation
    // In production, you'd want to stream the ZIP from server
    // For now, return the list so client can download individually or we can implement streaming later
    return NextResponse.json({
      success: true,
      files: files.map(f => ({
        name: f.name,
        path: f.path,
        size: f.size
      })),
      stats: {
        fileCount,
        totalSizeMB,
        totalSizeBytes
      },
      slotInfo: {
        car: `${car.make} ${car.model}`,
        vin: car.vin,
        slotType,
        slotIndex
      }
    });
  } catch (error) {
    console.error("Error preparing download:", error);
    return NextResponse.json(
      { error: "Failed to prepare download" },
      { status: 500 }
    );
  }
}
