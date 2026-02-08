import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarById } from "@/lib/infrastructure/db/carsRepo";
import { listCarSlots } from "@/lib/infrastructure/db/carSlotsRepo";
import { listCarLinks } from "@/lib/infrastructure/db/carLinksRepo";
import { syncRegion } from "@/lib/sync";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/cars/:id
 * Get car details with slots and links
 * Syncs from disk before returning data
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
  
  try {
    // Sync region from disk first (DB as cache, Disk as truth)
    console.log(`[API] Syncing region ${session.region} before getting car ${carId}`);
    await syncRegion(session.region);
    
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
    
    // Get slots
    const slots = await listCarSlots(carId);
    
    // Get links
    const links = await listCarLinks(carId);
    
    return NextResponse.json({
      success: true,
      car,
      slots,
      links,
    });
  } catch (error) {
    console.error("Error getting car details:", error);
    return NextResponse.json(
      { error: "Failed to get car details" },
      { status: 500 }
    );
  }
}
