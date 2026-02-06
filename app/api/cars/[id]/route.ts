import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiHelpers";
import { getCarById } from "@/lib/models/cars";
import { listCarSlots } from "@/lib/models/carSlots";
import { listCarLinks } from "@/lib/models/carLinks";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/cars/:id
 * Get car details with slots and links
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const authResult = await requireAuth(request);
  
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
    const car = await getCarById(carId);
    
    if (!car) {
      return NextResponse.json(
        { error: "Car not found" },
        { status: 404 }
      );
    }
    
    // Check region permission
    if (car.region !== session.region) {
      return NextResponse.json(
        { error: "Access denied - region mismatch" },
        { status: 403 }
      );
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
