import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getEffectiveRegion } from "@/lib/apiHelpers";
import { listCarsByRegion, createCar, carExistsByRegionAndVin, getCarByRegionAndVin } from "@/lib/models/cars";
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
 * Idempotent: returns success if car already exists
 * 
 * Body:
 * - make: string (required)
 * - model: string (required)
 * - vin: string (required, 17 characters)
 * - region: string (optional, admin can specify, users use their own region)
 * 
 * Success Response:
 * - 201 Created: { ok: true, car: {...} } - car was newly created
 * - 200 OK: { ok: true, car: {...} } - car already existed
 * 
 * Error Response:
 * - 4xx/5xx: { ok: false, code: "error_code", message: "...", status: xxx }
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
        { 
          ok: false,
          code: "validation_error",
          message: "make, model, and vin are required",
          status: 400
        },
        { status: 400 }
      );
    }
    
    // Validate VIN format (17 characters)
    if (vin.length !== 17) {
      return NextResponse.json(
        { 
          ok: false,
          code: "invalid_vin",
          message: "VIN must be exactly 17 characters",
          status: 400
        },
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
          ok: false,
          code: "region_required",
          message: "Admin must specify a region in request body",
          status: 400
        },
        { status: 400 }
      );
    }
    
    // Block creation in ALL region (archive only)
    if (effectiveRegion === 'ALL') {
      return NextResponse.json(
        { 
          ok: false,
          code: "REGION_ALL_FORBIDDEN",
          message: "Cannot create cars in ALL region. ALL is for archive only. Please select a specific region.",
          status: 400
        },
        { status: 400 }
      );
    }
    
    // Check if car already exists (idempotent behavior)
    const existingCar = await getCarByRegionAndVin(effectiveRegion, vin);
    if (existingCar) {
      // Car already exists - return success with existing car data (idempotent)
      console.log(`[API] Car already exists: ${effectiveRegion}/${vin}, returning existing car`);
      return NextResponse.json({
        ok: true,
        car: {
          id: existingCar.id,
          region: existingCar.region,
          make: existingCar.make,
          model: existingCar.model,
          vin: existingCar.vin,
        }
      }, { status: 200 });
    }
    
    // Generate root path
    const rootPath = carRoot(effectiveRegion, make, model, vin);
    
    // DISK-FIRST: Create car root folder on Yandex Disk (source of truth)
    console.log(`[API] Creating car folder on disk: ${rootPath}`);
    const rootFolderResult = await createFolder(rootPath);
    if (!rootFolderResult.success) {
      console.error(`Failed to create car root folder:`, rootFolderResult.error);
      return NextResponse.json(
        { 
          ok: false,
          code: "disk_error",
          message: "Failed to create car folder on Yandex Disk",
          status: 500
        },
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
      created_by: session.email || session.userId?.toString() || 'unknown',
    };
    
    const carJsonResult = await uploadText(`${rootPath}/_CAR.json`, carMetadata);
    if (!carJsonResult.success) {
      console.error(`Failed to create _CAR.json:`, carJsonResult.error);
      // Continue anyway - this is metadata only
    }
    
    // Get all slot paths (14 total)
    const slotPaths = getAllSlotPaths(effectiveRegion, make, model, vin);
    
    // Create all 14 slot folders on Yandex Disk (DISK-FIRST)
    console.log(`[API] Creating ${slotPaths.length} slot folders on disk`);
    const diskSlotResults = [];
    for (const slot of slotPaths) {
      const folderResult = await createFolder(slot.path);
      diskSlotResults.push({
        slotType: slot.slotType,
        slotIndex: slot.slotIndex,
        success: folderResult.success,
        error: folderResult.error,
      });
      if (!folderResult.success) {
        console.error(`Failed to create folder for slot ${slot.slotType}[${slot.slotIndex}]:`, folderResult.error);
        // Continue anyway - we'll handle missing folders during upload
      }
    }
    
    // DB AS CACHE: Try to create car in database (non-critical, can be synced later)
    let dbCacheOk = true;
    let car: any = null;
    
    try {
      car = await createCar({
        region: effectiveRegion,
        make,
        model,
        vin,
        disk_root_path: rootPath,
        created_by: session.email || session.userId?.toString() || null,
      });
      
      // Create slot records in database
      for (const slot of slotPaths) {
        try {
          await createCarSlot({
            car_id: car.id,
            slot_type: slot.slotType,
            slot_index: slot.slotIndex,
            disk_slot_path: slot.path,
          });
        } catch (slotError) {
          console.error(`Failed to create DB slot ${slot.slotType}[${slot.slotIndex}]:`, slotError);
          dbCacheOk = false;
          // Continue - disk is truth, DB is cache
        }
      }
    } catch (dbError) {
      console.error('[API] Failed to create car in database (DB as cache):', dbError);
      dbCacheOk = false;
      // Disk creation succeeded, so we'll trigger sync and return success
      car = {
        id: -1, // Sentinel: no DB record (use -1 to clearly indicate missing DB entry)
        region: effectiveRegion,
        make,
        model,
        vin,
        disk_root_path: rootPath,
        created_by: session.email || session.userId?.toString() || null,
        created_at: new Date(),
        deleted_at: null,
      };
    }
    
    // Trigger region sync if DB cache failed (background task)
    if (!dbCacheOk) {
      console.log(`[API] DB cache failed, triggering region sync for ${effectiveRegion}`);
      // Fire-and-forget sync (don't await)
      syncRegion(effectiveRegion, true).catch(err => {
        console.error(`[API] Background sync failed:`, err);
      });
    }
    
    return NextResponse.json({
      ok: true,
      car: {
        id: car.id,
        region: car.region || effectiveRegion,
        make: car.make || make,
        model: car.model || model,
        vin: car.vin || vin,
      },
      db_cache_ok: dbCacheOk,
      ...(dbCacheOk ? {} : { 
        warning: "Car created on disk, but database cache update failed. Sync will occur automatically." 
      }),
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating car:", error);
    return NextResponse.json(
      { 
        ok: false,
        code: "server_error",
        message: error instanceof Error ? error.message : "Failed to create car",
        status: 500
      },
      { status: 500 }
    );
  }
}
