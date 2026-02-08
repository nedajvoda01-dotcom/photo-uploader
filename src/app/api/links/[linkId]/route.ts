import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAdmin } from "@/lib/apiHelpers";
import { getCarLinkById, deleteCarLink } from "@/lib/infrastructure/db/carLinksRepo";
import { getCarById } from "@/lib/infrastructure/db/carsRepo";

interface RouteContext {
  params: Promise<{ linkId: string }>;
}

/**
 * DELETE /api/links/:linkId
 * Delete a specific link (ADMIN ONLY)
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const authResult = await requireAuth();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  
  // RBAC: Only admins can delete links
  if (!isAdmin(session)) {
    return NextResponse.json(
      { error: "Forbidden - only admins can delete links" },
      { status: 403 }
    );
  }
  
  const params = await context.params;
  const linkId = parseInt(params.linkId, 10);
  
  if (isNaN(linkId)) {
    return NextResponse.json(
      { error: "Invalid link ID" },
      { status: 400 }
    );
  }
  
  try {
    const link = await getCarLinkById(linkId);
    
    if (!link) {
      return NextResponse.json(
        { error: "Link not found" },
        { status: 404 }
      );
    }
    
    // Check if user has permission (same region)
    const car = await getCarById(link.car_id);
    
    if (!car) {
      return NextResponse.json(
        { error: "Associated car not found" },
        { status: 404 }
      );
    }
    
    if (car.region !== session.region) {
      return NextResponse.json(
        { error: "Access denied - region mismatch" },
        { status: 403 }
      );
    }
    
    await deleteCarLink(linkId);
    
    return NextResponse.json({
      success: true,
      message: "Link deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting link:", error);
    return NextResponse.json(
      { error: "Failed to delete link" },
      { status: 500 }
    );
  }
}
