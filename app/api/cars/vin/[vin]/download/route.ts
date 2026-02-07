import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarByRegionAndVin } from "@/lib/models/cars";
import { getCarSlot } from "@/lib/models/carSlots";
import { validateSlot, type SlotType } from "@/lib/diskPaths";
import { listFolder } from "@/lib/yandexDisk";
import { validateZipLimits } from "@/lib/config";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/**
 * GET /api/cars/vin/:vin/download?slotType=X&slotIndex=Y
 * Download all photos from a slot as ZIP by VIN
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
  const vin = params.vin.toUpperCase();
  
  if (!vin || vin.length !== 17) {
    return NextResponse.json(
      { error: "Invalid VIN format. VIN must be exactly 17 characters" },
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
    const car = await getCarByRegionAndVin(session.region, vin);
    
    if (!car) {
      return NextResponse.json(
        { error: "Car not found in your region" },
        { status: 404 }
      );
    }
    
    // Check region permission
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    const slot = await getCarSlot(car.id, slotType, slotIndex);
    
    if (!slot) {
      return NextResponse.json(
        { error: "Slot not found" },
        { status: 404 }
      );
    }
    
    // Check if slot is locked
    if (slot.status !== 'locked') {
      return NextResponse.json(
        { error: "Slot is not locked - no files to download" },
        { status: 409 }
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
        { status: 413 }
      );
    }
    
    // Return file list for client-side ZIP creation
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
    console.error("Error preparing download by VIN:", error);
    return NextResponse.json(
      { error: "Failed to prepare download" },
      { status: 500 }
    );
  }
}
