import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarByRegionAndVin } from "@/lib/models/cars";
import { listCarSlots } from "@/lib/models/carSlots";
import { listCarLinks } from "@/lib/models/carLinks";
import { syncRegion } from "@/lib/sync";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/**
 * GET /api/cars/vin/:vin
 * Get car details by VIN with slots and links
 * VIN is the canonical identifier for cars within a region
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
  const vin = params.vin.toUpperCase(); // VINs are case-insensitive, normalize to uppercase
  
  if (!vin || vin.length !== 17) {
    return NextResponse.json(
      { error: "Invalid VIN format. VIN must be exactly 17 characters" },
      { status: 400 }
    );
  }
  
  try {
    // Sync region from disk first (DB as cache, Disk as truth)
    console.log(`[API] Syncing region ${session.region} before getting car ${vin}`);
    await syncRegion(session.region);
    
    // Get car by region and VIN (region from session)
    const car = await getCarByRegionAndVin(session.region, vin);
    
    if (!car) {
      return NextResponse.json(
        { error: "Car not found in your region" },
        { status: 404 }
      );
    }
    
    // Check region permission (admin with region=ALL can access all regions)
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    // Get slots
    const slots = await listCarSlots(car.id);
    
    // Get links
    const links = await listCarLinks(car.id);
    
    return NextResponse.json({
      success: true,
      car,
      slots,
      links,
    });
  } catch (error) {
    console.error("Error getting car details by VIN:", error);
    return NextResponse.json(
      { error: "Failed to get car details" },
      { status: 500 }
    );
  }
}
