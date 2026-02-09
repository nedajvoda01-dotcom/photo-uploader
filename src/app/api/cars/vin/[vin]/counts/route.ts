import { NextRequest } from "next/server";
import { requireAuth, requireRegionAccess, errorResponse, successResponse, ErrorCodes } from "@/lib/apiHelpers";
import { loadCarSlotCounts } from "@/lib/infrastructure/diskStorage/carsRepo";
import { REGIONS_LIST } from "@/lib/config/index";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/**
 * GET /api/cars/vin/:vin/counts
 * Phase 2: Load slot counts and status from disk (lazy loading)
 * This endpoint is called after initial car card render to load actual counts
 * Returns slots with stats_loaded=true
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
    return errorResponse(
      ErrorCodes.INVALID_VIN,
      "Неверный формат VIN. VIN должен содержать ровно 17 символов",
      400
    );
  }
  
  try {
    // Search for car in regions
    const regionsToSearch = session.region === 'ALL' && session.role === 'admin'
      ? REGIONS_LIST
      : [session.region];
    
    let slots = null;
    let carRegion = null;
    
    for (const region of regionsToSearch) {
      const result = await loadCarSlotCounts(region, vin);
      if (result) {
        slots = result;
        carRegion = region;
        break;
      }
    }
    
    if (!slots) {
      return errorResponse(
        ErrorCodes.CAR_NOT_FOUND,
        "Автомобиль не найден",
        404
      );
    }
    
    // Check region permission
    if (carRegion) {
      const regionCheck = requireRegionAccess(session, carRegion);
      if ('error' in regionCheck) {
        return regionCheck.error;
      }
    }
    
    // Calculate progress
    const totalSlots = slots.length;
    const lockedSlots = slots.filter(s => s.locked).length;
    const emptySlots = totalSlots - lockedSlots;
    
    return successResponse({
      slots,
      progress: {
        total_slots: totalSlots,
        locked_slots: lockedSlots,
        empty_slots: emptySlots,
      },
    });
  } catch (error) {
    console.error("Error loading slot counts by VIN:", error);
    return errorResponse(
      ErrorCodes.SERVER_ERROR,
      error instanceof Error ? error.message : "Не удалось загрузить статистику слотов",
      500
    );
  }
}
