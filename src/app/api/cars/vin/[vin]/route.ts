import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess, errorResponse, successResponse, ErrorCodes } from "@/lib/apiHelpers";
import { getCarWithSlots, listLinks, removeCarFromRegionIndex, addCarToRegionIndex } from "@/lib/infrastructure/diskStorage/carsRepo";
import { moveFolder, uploadText } from "@/lib/infrastructure/yandexDisk/client";
import { getCarArchivePath } from "@/lib/domain/disk/paths";
import { ARCHIVE_RETRY_DELAY_MS, REGIONS_LIST } from "@/lib/config/index";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/**
 * Helper to get user identifier from session
 * Used for tracking who performed operations (archive, restore, etc.)
 */
function getUserIdentifier(session: { email?: string; userId?: number }): string {
  return session.email || (session.userId ? session.userId.toString() : "unknown");
}

/**
 * GET /api/cars/vin/:vin
 * Get car details by VIN with slots and links
 * VIN is the canonical identifier for cars within a region
 * Reads directly from Yandex Disk (no database)
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
    return errorResponse(
      ErrorCodes.INVALID_VIN,
      "Неверный формат VIN. VIN должен содержать ровно 17 символов",
      400
    );
  }
  
  try {
    // For admins with region=ALL, we need to search all regions for the car
    // For regular users, we only search their assigned region
    const regionsToSearch = session.region === 'ALL' && session.role === 'admin'
      ? REGIONS_LIST
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
      return errorResponse(
        ErrorCodes.CAR_NOT_FOUND,
        "Автомобиль не найден",
        404
      );
    }
    
    const { car, slots } = carData;
    
    // Check region permission
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    // Get links
    const links = await listLinks(car.disk_root_path);
    
    return successResponse({
      car,
      slots,
      links,
    });
  } catch (error) {
    console.error("Error getting car details by VIN:", error);
    return errorResponse(
      ErrorCodes.SERVER_ERROR,
      error instanceof Error ? error.message : "Не удалось получить данные автомобиля",
      500
    );
  }
}

/**
 * DELETE /api/cars/vin/:vin
 * Archive a car
 * Available to both users and admins
 * - Users can archive cars in their own region
 * - Admins can archive cars in any region they have access to
 * Moves folder to /Фото/ALL/ archive on disk (no database update needed)
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
    // Search for car in regions
    const regionsToSearch = session.region === 'ALL' && session.role === 'admin'
      ? REGIONS_LIST
      : [session.region];
    
    let carData = null;
    
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
    
    // Check region permission - both users and admins can archive in their allowed regions
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    // Archive: Move folder to /Фото/ALL/ on disk
    // Archive path format: /Фото/ALL/{region}_{make}_{model}_{vin}
    const archivePath = getCarArchivePath(car.region, car.make, car.model, vin);
    
    // Move folder on disk (with retry)
    let moveSuccess = false;
    let lastError = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[Archive] Attempt ${attempt}/3: Moving ${car.disk_root_path} to ${archivePath}`);
      
      const moveResult = await moveFolder(car.disk_root_path, archivePath, false);
      
      if (moveResult.success) {
        moveSuccess = true;
        break;
      }
      
      lastError = moveResult.error;
      console.error(`[Archive] Move attempt ${attempt} failed:`, lastError);
      
      // Check if error is "destination already exists" (409)
      if (lastError && lastError.includes('409')) {
        console.log(`[Archive] Detected 409 (already exists), retrying with overwrite=true`);
        const overwriteResult = await moveFolder(car.disk_root_path, archivePath, true);
        
        if (overwriteResult.success) {
          console.log(`[Archive] Overwrite succeeded`);
          moveSuccess = true;
          break;
        }
        
        lastError = overwriteResult.error;
        console.error(`[Archive] Overwrite attempt also failed:`, lastError);
        // If overwrite failed, break out of retry loop since 409 is a permanent condition
        break;
      }
      
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, ARCHIVE_RETRY_DELAY_MS));
      }
    }
    
    if (!moveSuccess) {
      console.error(`[Archive] All move attempts failed.`);
      return NextResponse.json(
        { 
          error: "Failed to archive car on disk after 3 attempts.", 
          details: lastError 
        },
        { status: 500 }
      );
    }
    
    console.log(`[Archive] Car archived successfully on disk.`);
    
    // Fix B: Update _CAR.json in ALL folder with region and archived metadata
    console.log(`[Archive] Updating _CAR.json in archived folder`);
    const carMetadataPath = `${archivePath}/_CAR.json`;
    const archivedMetadata = {
      region: 'ALL',
      make: car.make,
      model: car.model,
      vin: vin,
      created_at: car.created_at,
      created_by: car.created_by,
      archived_at: new Date().toISOString(),
      archived_by: getUserIdentifier(session),
      original_region: car.region,
    };
    
    const metadataUpdateResult = await uploadText(carMetadataPath, archivedMetadata);
    if (!metadataUpdateResult.success) {
      console.error(`[Archive] CRITICAL: Failed to update _CAR.json in archive:`, metadataUpdateResult.error);
      // Law #1: mutations must update indexes or fail
      return NextResponse.json(
        { 
          error: "Failed to update archived car metadata", 
          details: metadataUpdateResult.error 
        },
        { status: 500 }
      );
    }
    
    // CRITICAL: Update region indices synchronously (SSOT mutations - Law #1)
    // Remove from source region
    console.log(`[Archive] Removing car ${vin} from ${car.region} region index`);
    try {
      await removeCarFromRegionIndex(car.region, vin);
    } catch (error) {
      console.error(`[Archive] CRITICAL: Failed to remove from source region index:`, error);
      // Law #1: If index update fails, operation fails
      return NextResponse.json(
        { 
          error: "Failed to update source region index", 
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      );
    }
    
    // Add to ALL (archive) region
    console.log(`[Archive] Adding car ${vin} to ALL region index`);
    try {
      await addCarToRegionIndex('ALL', {
        ...car,
        region: 'ALL',
        disk_root_path: archivePath,
      });
    } catch (error) {
      console.error(`[Archive] CRITICAL: Failed to add to ALL region index:`, error);
      // Law #1: If index update fails, operation fails
      return NextResponse.json(
        { 
          error: "Failed to update ALL region index", 
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      );
    }
    
    console.log(`[Archive] Region indices and metadata updated successfully`);
    
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
