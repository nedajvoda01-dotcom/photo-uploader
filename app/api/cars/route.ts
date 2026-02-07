import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/apiHelpers";
import { listCarsByRegion, createCar, carExistsByRegionAndVin } from "@/lib/models/cars";
import { createCarSlot } from "@/lib/models/carSlots";
import { carRoot, getAllSlotPaths } from "@/lib/diskPaths";
import { createFolder, uploadText } from "@/lib/yandexDisk";
import { syncRegion } from "@/lib/sync";

/**
 * GET /api/cars
 * List all cars for the user's region with progress breakdown
 * Syncs from disk before returning data
 */
export async function GET() {
  const authResult = await requireAuth();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  
  try {
    // Sync region from disk first (DB as cache, Disk as truth)
    console.log(`[API] Syncing region ${session.region} before listing cars`);
    await syncRegion(session.region);
    
    const cars = await listCarsByRegion(session.region);
    
    return NextResponse.json({
      success: true,
      cars,
    });
  } catch (error) {
    console.error("Error listing cars:", error);
    return NextResponse.json(
      { error: "Failed to list cars" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cars
 * Create a new car with all slots (ADMIN ONLY)
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  
  try {
    const body = await request.json();
    const { make, model, vin } = body;
    
    // Validate input
    if (!make || !model || !vin) {
      return NextResponse.json(
        { error: "make, model, and vin are required" },
        { status: 400 }
      );
    }
    
    // Validate VIN format (17 characters)
    if (vin.length !== 17) {
      return NextResponse.json(
        { error: "VIN must be exactly 17 characters" },
        { status: 400 }
      );
    }
    
    // Check uniqueness (region, vin)
    const exists = await carExistsByRegionAndVin(session.region, vin);
    if (exists) {
      return NextResponse.json(
        { error: "Car with this VIN already exists in this region" },
        { status: 409 }
      );
    }
    
    // Generate root path
    const rootPath = carRoot(session.region, make, model, vin);
    
    // Create car root folder on Yandex Disk
    const rootFolderResult = await createFolder(rootPath);
    if (!rootFolderResult.success) {
      console.error(`Failed to create car root folder:`, rootFolderResult.error);
      return NextResponse.json(
        { error: "Failed to create car folder on Yandex Disk" },
        { status: 500 }
      );
    }
    
    // Create _CAR.json metadata file in car root
    const carMetadata = {
      region: session.region,
      make,
      model,
      vin,
      created_at: new Date().toISOString(),
      created_by: session.email || session.userId,
    };
    
    const carJsonResult = await uploadText(`${rootPath}/_CAR.json`, carMetadata);
    if (!carJsonResult.success) {
      console.error(`Failed to create _CAR.json:`, carJsonResult.error);
      // Continue anyway - this is metadata only
    }
    
    // Create car in database
    const car = await createCar({
      region: session.region,
      make,
      model,
      vin,
      disk_root_path: rootPath,
      created_by: session.userId,
    });
    
    // Get all slot paths (14 total)
    const slotPaths = getAllSlotPaths(session.region, make, model, vin);
    
    // Create folders on Yandex Disk and slots in database
    for (const slot of slotPaths) {
      // Create folder on disk
      const folderResult = await createFolder(slot.path);
      if (!folderResult.success) {
        console.error(`Failed to create folder for slot ${slot.slotType}[${slot.slotIndex}]:`, folderResult.error);
        // Continue anyway - we'll handle missing folders during upload
      }
      
      // Create slot in database
      await createCarSlot({
        car_id: car.id,
        slot_type: slot.slotType,
        slot_index: slot.slotIndex,
        disk_slot_path: slot.path,
      });
    }
    
    return NextResponse.json({
      success: true,
      car,
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating car:", error);
    return NextResponse.json(
      { error: "Failed to create car" },
      { status: 500 }
    );
  }
}
