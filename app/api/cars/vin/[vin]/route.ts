import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarByRegionAndVin, deleteCarByVin } from "@/lib/models/cars";
import { listCarSlots } from "@/lib/models/carSlots";
import { listCarLinks } from "@/lib/models/carLinks";
import { syncRegion } from "@/lib/sync";
import { moveFolder } from "@/lib/yandexDisk";
import { ensureDbSchema } from "@/lib/db";
import { getBasePath } from "@/lib/diskPaths";

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
    // Ensure database schema exists (idempotent, auto-creates tables)
    await ensureDbSchema();
    
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

/**
 * DELETE /api/cars/vin/:vin
 * Archive a car
 * Available to both users and admins
 * - Users can archive cars in their own region
 * - Admins can archive cars in any region they have access to
 * Marks as deleted in DB and moves folder to /Фото/ALL/ archive
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
  const params = await context.params;
  const vin = params.vin.toUpperCase();
  
  if (!vin || vin.length !== 17) {
    return NextResponse.json(
      { error: "Invalid VIN format. VIN must be exactly 17 characters" },
      { status: 400 }
    );
  }
  
  try {
    // Get car to find its disk path and details
    const car = await getCarByRegionAndVin(session.region, vin);
    
    if (!car) {
      return NextResponse.json(
        { error: "Car not found in your region" },
        { status: 404 }
      );
    }
    
    // Check region permission - both users and admins can archive in their allowed regions
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    // Archive: Move folder to /Фото/ALL/ instead of deleting
    // Archive path format: /Фото/ALL/{region}_{make}_{model}_{vin}
    const basePath = getBasePath();
    const archiveName = `${car.region}_${car.make}_${car.model}_${vin}`.replace(/\s+/g, '_');
    const archivePath = `${basePath}/ALL/${archiveName}`;
    
    console.log(`[Archive] Moving car from ${car.disk_root_path} to ${archivePath}`);
    
    const moveResult = await moveFolder(car.disk_root_path, archivePath, false);
    if (!moveResult.success) {
      console.error(`Failed to archive folder on Yandex Disk: ${moveResult.error}`);
      // Continue anyway - mark as deleted in DB even if disk move fails
    }
    
    // Mark as deleted in database (soft delete with deleted_at)
    await deleteCarByVin(car.region, vin);
    
    return NextResponse.json({
      success: true,
      message: "Car archived successfully",
      archivePath,
    });
  } catch (error) {
    console.error("Error archiving car:", error);
    return NextResponse.json(
      { error: "Failed to archive car" },
      { status: 500 }
    );
  }
}
