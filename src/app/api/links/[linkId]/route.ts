import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess, isAdmin } from "@/lib/apiHelpers";
import { findCarByLinkId, deleteLink } from "@/lib/infrastructure/diskStorage/carsRepo";
import { REGIONS_LIST } from '@/lib/config/index';

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
  const linkId = params.linkId; // Keep as string, not parseInt
  
  if (!linkId) {
    return NextResponse.json(
      { error: "Invalid link ID" },
      { status: 400 }
    );
  }
  
  try {
    // Get regions to search
    const regionsToSearch = session.region === 'ALL' && session.role === 'admin'
      ? REGIONS_LIST
      : [session.region];
    
    // Find car by link ID
    const carInfo = await findCarByLinkId(regionsToSearch, linkId);
    
    if (!carInfo) {
      return NextResponse.json(
        { error: "Link not found" },
        { status: 404 }
      );
    }
    
    // Check region permission
    const regionCheck = requireRegionAccess(session, carInfo.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    // Delete the link from _LINKS.json
    const success = await deleteLink(carInfo.carRootPath, linkId);
    
    if (!success) {
      return NextResponse.json(
        { error: "Link not found or already deleted" },
        { status: 404 }
      );
    }
    
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
