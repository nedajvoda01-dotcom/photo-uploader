import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, getEffectiveRegion } from "@/lib/apiHelpers";
import { listCarsByRegion, createCar, carExistsByRegionAndVin } from "@/lib/models/cars";
import { createCarSlot } from "@/lib/models/carSlots";
import { carRoot, getAllSlotPaths } from "@/lib/diskPaths";
import { createFolder, uploadText } from "@/lib/yandexDisk";
import { syncRegion } from "@/lib/sync";
import { ensureDbSchema } from "@/lib/db";

/**
 * GET /api/cars
 * List all cars for the user's region with progress breakdown
 * Syncs from disk before returning data
 * 
 * Query params:
 * - region: (admin only) specify which region to view
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  
  try {
    // Ensure database schema exists (idempotent, auto-creates tables)
    await ensureDbSchema();
    
    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const queryRegion = searchParams.get("region") || undefined;
    
    // Determine effective region (users use their region, admins can specify)
    const effectiveRegion = getEffectiveRegion(session, queryRegion);
    
    if (!effectiveRegion) {
      return NextResponse.json(
        { 
          error: "region_required",
          message: "Admin must specify a region via ?region= query parameter" 
        },
        { status: 400 }
      );
    }
    
    // Sync region from disk first (DB as cache, Disk as truth)
    console.log(`[API] Syncing region ${effectiveRegion} before listing cars`);
    await syncRegion(effectiveRegion);
    
    const cars = await listCarsByRegion(effectiveRegion);
    
    return NextResponse.json({
      success: true,
      cars,
      region: effectiveRegion,
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
 * Available to both users and admins
 * 
 * Body:
 * - make: string (required)
 * - model: string (required)
 * - vin: string (required, 17 characters)
 * - region: string (optional, admin can specify, users use their own region)
 */
export async function POST(request: NextRequest) {
  // Changed from requireAdmin() to requireAuth() - users can now create cars
  const authResult = await requireAuth();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  
  try {
    // Ensure database schema exists (idempotent, auto-creates tables)
    await ensureDbSchema();
    
    const body = await request.json();
    const { make, model, vin, region: bodyRegion } = body;
    
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
    
    // Determine effective region for car creation
    // Users: always use their own region (ignore bodyRegion)
    // Admins: can specify region via bodyRegion, or it's validated
    const effectiveRegion = session.role === 'admin' 
      ? (bodyRegion || getEffectiveRegion(session, bodyRegion))
      : session.region;
    
    if (!effectiveRegion) {
      return NextResponse.json(
        { 
          error: "region_required",
          message: "Admin must specify a region in request body" 
        },
        { status: 400 }
      );
    }
    
    // Check uniqueness (region, vin)
    const exists = await carExistsByRegionAndVin(effectiveRegion, vin);
    if (exists) {
      return NextResponse.json(
        { error: "Car with this VIN already exists in this region" },
        { status: 409 }
      );
    }
    
    // Generate root path
    const rootPath = carRoot(effectiveRegion, make, model, vin);
    
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
      region: effectiveRegion,
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
      region: effectiveRegion,
      make,
      model,
      vin,
      disk_root_path: rootPath,
      created_by: session.userId,
    });
    
    // Get all slot paths (14 total)
    const slotPaths = getAllSlotPaths(effectiveRegion, make, model, vin);
    
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
