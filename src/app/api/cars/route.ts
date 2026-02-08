import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getEffectiveRegion, errorResponse, successResponse, ErrorCodes, validateNotAllRegion } from "@/lib/apiHelpers";
import { listCarsByRegion, createCar, getCarByRegionAndVin } from "@/lib/infrastructure/diskStorage/carsRepo";
import { carRoot, getAllSlotPaths, sanitizePathSegment } from "@/lib/domain/disk/paths";
import { createFolder, uploadText } from "@/lib/infrastructure/yandexDisk/client";

/**
 * GET /api/cars
 * List all cars for the user's region with progress breakdown
 * Reads directly from Yandex Disk (no database)
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
    
    // List cars directly from disk (no sync needed)
    console.log(`[API] Listing cars from disk for region ${effectiveRegion}`);
    const cars = await listCarsByRegion(effectiveRegion);
    
    return successResponse({
      cars,
      region: effectiveRegion,
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
    
    // Create car on disk (creates root folder, metadata, and all 14 slots)
    console.log(`[API] Creating car on disk: ${effectiveRegion}/${vin}`);
    const car = await createCar({
      region: effectiveRegion,
      make: safeMake,
      model: safeModel,
      vin: safeVin,
      created_by: session.email || session.userId?.toString() || null,
    });
    
    console.log(`[API] Successfully created car with 14 slots: ${effectiveRegion}/${vin}`);
    
    return NextResponse.json({
      ok: true,
      car: {
        region: car.region,
        make: car.make,
        model: car.model,
        vin: car.vin,
      },
    }, { status: 201 });
  } catch (error) {
    console.error(`[API] Failed to create car ${effectiveRegion}/${vin}:`, error);
    return errorResponse(
      ErrorCodes.SERVER_ERROR,
      error instanceof Error ? error.message : "Не удалось создать автомобиль",
      500
    );
  }
}
