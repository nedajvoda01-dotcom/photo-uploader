import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getEffectiveRegion, errorResponse, successResponse, ErrorCodes, validateNotAllRegion } from "@/lib/apiHelpers";
import { listCarsByRegion, createCar, carExistsByRegionAndVin, getCarByRegionAndVin } from "@/lib/models/cars";
import { createCarSlot } from "@/lib/models/carSlots";
import { carRoot, getAllSlotPaths, sanitizePathSegment } from "@/lib/diskPaths";
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
      return errorResponse(
        ErrorCodes.REGION_REQUIRED,
        "Администратор должен указать регион через параметр ?region=",
        400
      );
    }
    
    // Sync region from disk first (DB as cache, Disk as truth)
    console.log(`[API] Syncing region ${effectiveRegion} before listing cars`);
    const syncResult = await syncRegion(effectiveRegion);
    
    const cars = await listCarsByRegion(effectiveRegion);
    
    return successResponse({
      cars,
      region: effectiveRegion,
      sync: {
        success: syncResult.success,
        last_sync_at: new Date().toISOString(),
        cars_found: syncResult.carsFound,
        from_cache: syncResult.fromCache || false,
      },
    });
  } catch (error) {
    console.error("Error listing cars:", error);
    return errorResponse(
      ErrorCodes.SERVER_ERROR,
      error instanceof Error ? error.message : "Не удалось получить список автомобилей",
      500
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
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        "Необходимо указать марку, модель и VIN",
        400
      );
    }
    
    // Validate VIN format (17 characters)
    if (vin.length !== 17) {
      return errorResponse(
        ErrorCodes.INVALID_VIN,
        "VIN должен содержать ровно 17 символов",
        400
      );
    }
    
    // Determine effective region for car creation
    // Users: always use their own region (ignore bodyRegion)
    // Admins: can specify region via bodyRegion, or it's validated
    const effectiveRegion = session.role === 'admin' 
      ? (bodyRegion || getEffectiveRegion(session, bodyRegion))
      : session.region;
    
    if (!effectiveRegion) {
      return errorResponse(
        ErrorCodes.REGION_REQUIRED,
        "Администратор должен указать регион в теле запроса",
        400
      );
    }
    
    // Block creation in ALL region (archive only)
    const regionCheck = validateNotAllRegion(effectiveRegion);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    // Check if car already exists (idempotent behavior)
    const existingCar = await getCarByRegionAndVin(effectiveRegion, vin);
    if (existingCar) {
      // Car already exists - return success with existing car data (idempotent)
      console.log(`[API] Car already exists: ${effectiveRegion}/${vin}, returning existing car`);
      return successResponse({
        car: {
          id: existingCar.id,
          region: existingCar.region,
          make: existingCar.make,
          model: existingCar.model,
          vin: existingCar.vin,
        }
      }, 200);
    }
    
    // Sanitize path segments to prevent directory traversal
    const safeMake = sanitizePathSegment(make);
    const safeModel = sanitizePathSegment(model);
    const safeVin = sanitizePathSegment(vin);
    
    // Validate sanitized values are not empty
    if (!safeMake || !safeModel || !safeVin) {
      return errorResponse(
        ErrorCodes.INVALID_INPUT,
        "Марка, модель и VIN должны содержать допустимые символы",
        400
      );
    }
    
    // Generate root path with sanitized segments
    const rootPath = carRoot(effectiveRegion, safeMake, safeModel, safeVin);
    
    // DISK-FIRST: Create car root folder on Yandex Disk (source of truth)
    console.log(`[API] Creating car folder on disk: ${rootPath}`);
    const rootFolderResult = await createFolder(rootPath);
    if (!rootFolderResult.success) {
      console.error(`Failed to create car root folder:`, rootFolderResult.error);
      return errorResponse(
        ErrorCodes.DISK_ERROR,
        "Не удалось создать папку автомобиля на Яндекс.Диске",
        500
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
    
    // Get all slot paths (14 total) - use sanitized values
    const slotPaths = getAllSlotPaths(effectiveRegion, safeMake, safeModel, safeVin);
    
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
      ...(dbCacheOk ? {} : { 
        warning: "DB_CACHE_WRITE_FAILED",
        message: "Автомобиль создан на диске, но обновление кэша базы данных не удалось. Синхронизация произойдет автоматически." 
      }),
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating car:", error);
    return errorResponse(
      ErrorCodes.SERVER_ERROR,
      error instanceof Error ? error.message : "Не удалось создать автомобиль",
      500
    );
  }
}
