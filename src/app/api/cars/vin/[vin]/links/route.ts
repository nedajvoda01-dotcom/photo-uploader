import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess, isAdmin } from "@/lib/apiHelpers";
import { getCarByVin } from "@/lib/infrastructure/db/carsRepo";
import { listCarLinks, createCarLink } from "@/lib/infrastructure/db/carLinksRepo";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/**
 * GET /api/cars/vin/:vin/links
 * List all links for a car by VIN (ADMIN ONLY)
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
  
  // RBAC: Only admins can view links
  if (!isAdmin(session)) {
    return NextResponse.json(
      { error: "Forbidden - only admins can view links" },
      { status: 403 }
    );
  }
  
  const params = await context.params;
  const vin = params.vin.toUpperCase();
  
  if (!vin || vin.length !== 17) {
    return NextResponse.json(
      { error: "Invalid VIN format. VIN must be exactly 17 characters" },
      { status: 400 }
    );
  }
  
  try {
    const car = await getCarByVin(vin);
    
    if (!car) {
      return NextResponse.json(
        { error: "Car not found" },
        { status: 404 }
      );
    }
    
    // Check region permission
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    const links = await listCarLinks(car.id);
    
    return NextResponse.json({
      success: true,
      links,
    });
  } catch (error) {
    console.error("Error listing car links by VIN:", error);
    return NextResponse.json(
      { error: "Failed to list links" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cars/vin/:vin/links
 * Create a new link for a car by VIN (ADMIN ONLY)
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
  
  // RBAC: Only admins can create links
  if (!isAdmin(session)) {
    return NextResponse.json(
      { error: "Forbidden - only admins can create links" },
      { status: 403 }
    );
  }
  
  const params = await context.params;
  const vin = params.vin.toUpperCase();
  
  if (!vin || vin.length !== 17) {
    return NextResponse.json(
      { error: "Invalid VIN format. VIN must be exactly 17 characters" },
      { status: 400 }
    );
  }
  
  try {
    const car = await getCarByVin(vin);
    
    if (!car) {
      return NextResponse.json(
        { error: "Car not found" },
        { status: 404 }
      );
    }
    
    // Check region permission
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    const body = await request.json();
    const { label, url } = body;
    
    if (!label || !url) {
      return NextResponse.json(
        { error: "label and url are required" },
        { status: 400 }
      );
    }
    
    const link = await createCarLink({
      car_id: car.id,
      label,
      url,
      created_by: session.email || session.userId?.toString() || null,
    });
    
    return NextResponse.json({
      success: true,
      link,
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating car link by VIN:", error);
    return NextResponse.json(
      { error: "Failed to create link" },
      { status: 500 }
    );
  }
}
