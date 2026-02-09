import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, errorResponse, successResponse, ErrorCodes } from "@/lib/apiHelpers";
import { reconcileRegion, reconcileCar, reconcileSlot } from "@/lib/infrastructure/diskStorage/reconcile";
import { getCarByRegionAndVin } from "@/lib/infrastructure/diskStorage/carsRepo";

/**
 * POST /api/internal/reconcile
 * 
 * Self-healing reconcile endpoint
 * Rebuilds indexes from disk when missing or corrupted
 * 
 * Body:
 * - region?: string - Reconcile entire region
 * - car?: { region: string, vin: string } - Reconcile specific car
 * - slot?: { path: string } - Reconcile specific slot
 * 
 * Returns:
 * - actionsPerformed: string[] - List of actions taken
 * - repairedFiles: string[] - Files that were repaired
 * - errors: string[] - Any errors encountered
 */
export async function POST(request: NextRequest) {
  // Require admin access for reconcile operations
  const authResult = await requireAdmin();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  try {
    const body = await request.json();
    const { region, car, slot } = body;
    
    // Validate that at least one parameter is provided
    if (!region && !car && !slot) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        "Must provide at least one of: region, car, or slot",
        400
      );
    }
    
    // Reconcile based on provided parameters
    if (slot) {
      // Reconcile specific slot
      const { path } = slot;
      if (!path) {
        return errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          "Slot path is required",
          400
        );
      }
      
      const result = await reconcileSlot(path);
      return successResponse({
        scope: "slot",
        path,
        ...result,
      });
    }
    
    if (car) {
      // Reconcile specific car
      const { region: carRegion, vin } = car;
      if (!carRegion || !vin) {
        return errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          "Car region and vin are required",
          400
        );
      }
      
      const carData = await getCarByRegionAndVin(carRegion, vin);
      if (!carData) {
        return errorResponse(
          ErrorCodes.CAR_NOT_FOUND,
          `Car not found: ${carRegion}/${vin}`,
          404
        );
      }
      
      const result = await reconcileCar(carData.disk_root_path);
      return successResponse({
        scope: "car",
        region: carRegion,
        vin,
        ...result,
      });
    }
    
    if (region) {
      // Reconcile entire region
      const result = await reconcileRegion(region);
      return successResponse({
        scope: "region",
        region,
        ...result,
      });
    }
    
    // Should never reach here
    return errorResponse(
      ErrorCodes.VALIDATION_ERROR,
      "Invalid reconcile request",
      400
    );
    
  } catch (error) {
    console.error("Error in reconcile endpoint:", error);
    return errorResponse(
      ErrorCodes.SERVER_ERROR,
      error instanceof Error ? error.message : "Reconcile operation failed",
      500
    );
  }
}
