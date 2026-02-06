import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiHelpers";
import { listCarsByRegion, createCar, carExistsByRegionAndVin } from "@/lib/models/cars";
import { createCarSlot } from "@/lib/models/carSlots";
import { carRoot, getAllSlotPaths } from "@/lib/yandexDiskStructure";
import { createFolder } from "@/lib/yandexDisk";

/**
 * GET /api/cars
 * List all cars for the user's region with progress breakdown
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  
  try {
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
 * Create a new car with all slots
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  
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
