import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess, isAdmin } from "@/lib/apiHelpers";
import { getCarWithSlots, listLinks, createLink } from "@/lib/infrastructure/diskStorage/carsRepo";

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
    // For admins with region=ALL, search all regions
    // For regular users, only search their assigned region
    const regionsToSearch = session.region === 'ALL' && session.role === 'admin'
      ? process.env.REGIONS?.split(',') || []
      : [session.region];
    
    let carData = null;
    
    // Search for car in regions
    for (const region of regionsToSearch) {
      const result = await getCarWithSlots(region, vin);
      if (result) {
        carData = result;
        break;
      }
    }
    
    if (!carData) {
      return NextResponse.json(
        { error: "Car not found" },
        { status: 404 }
      );
    }
    
    const { car } = carData;
    
    // Check region permission
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    const links = await listLinks(car.disk_root_path);
    
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
    // For admins with region=ALL, search all regions
    // For regular users, only search their assigned region
    const regionsToSearch = session.region === 'ALL' && session.role === 'admin'
      ? process.env.REGIONS?.split(',') || []
      : [session.region];
    
    let carData = null;
    
    // Search for car in regions
    for (const region of regionsToSearch) {
      const result = await getCarWithSlots(region, vin);
      if (result) {
        carData = result;
        break;
      }
    }
    
    if (!carData) {
      return NextResponse.json(
        { error: "Car not found" },
        { status: 404 }
      );
    }
    
    const { car } = carData;
    
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
    
    const link = await createLink(
      car.disk_root_path,
      label,
      url,
      session.email || session.userId?.toString() || undefined
    );
    
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
