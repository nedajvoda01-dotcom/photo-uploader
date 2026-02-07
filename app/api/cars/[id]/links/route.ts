import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarById } from "@/lib/models/cars";
import { listCarLinks, createCarLink } from "@/lib/models/carLinks";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/cars/:id/links
 * List all links for a car
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
    
    const links = await listCarLinks(carId);
    
    return NextResponse.json({
      success: true,
      links,
    });
  } catch (error) {
    console.error("Error listing car links:", error);
    return NextResponse.json(
      { error: "Failed to list links" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cars/:id/links
 * Create a new link for a car
 */
export async function POST(
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
    
    const body = await request.json();
    const { title, url } = body;
    
    if (!title || !url) {
      return NextResponse.json(
        { error: "title and url are required" },
        { status: 400 }
      );
    }
    
    const link = await createCarLink({
      car_id: carId,
      title,
      url,
      created_by: session.userId,
    });
    
    return NextResponse.json({
      success: true,
      link,
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating car link:", error);
    return NextResponse.json(
      { error: "Failed to create link" },
      { status: 500 }
    );
  }
}
