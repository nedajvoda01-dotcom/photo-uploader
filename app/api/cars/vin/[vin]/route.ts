import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarByRegionAndVin, deleteCarByVin } from "@/lib/models/cars";
import { listCarSlots } from "@/lib/models/carSlots";
import { listCarLinks } from "@/lib/models/carLinks";
import { syncRegion } from "@/lib/sync";
import { moveFolder, listFolder, exists } from "@/lib/yandexDisk";
import { ensureDbSchema } from "@/lib/db";
import { getBasePath, getAllSlotPaths, getLockMarkerPath } from "@/lib/diskPaths";

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
    let car = await getCarByRegionAndVin(session.region, vin);
    
    // If car not found in DB after sync, try to construct from disk
    if (!car) {
      console.log(`[API] Car ${vin} not in DB after sync, checking disk directly`);
      
      // Try to find car on disk by scanning region folder
      const basePath = getBasePath();
      const regionPath = `${basePath}/${session.region}`;
      const carsResult = await listFolder(regionPath);
      
      if (carsResult.success && carsResult.items) {
        // Look for folder matching VIN
        for (const folder of carsResult.items) {
          if (folder.type === 'dir' && folder.name.endsWith(vin)) {
            // Found car on disk, construct car object
            const parts = folder.name.split(' ');
            if (parts.length >= 3) {
              const vinPart = parts[parts.length - 1];
              const model = parts.slice(1, -1).join(' ');
              const make = parts[0];
              
              car = {
                id: 0, // No DB record
                region: session.region,
                make,
                model,
                vin: vinPart,
                disk_root_path: folder.path,
                created_by: null,
                created_at: new Date(),
                deleted_at: null,
              };
              
              console.log(`[API] Constructed car from disk: ${make} ${model} ${vin}`);
              break;
            }
          }
        }
      }
      
      // If still not found, return 404
      if (!car) {
        return NextResponse.json(
          { error: "Car not found in your region" },
          { status: 404 }
        );
      }
    }
    
    // Check region permission (admin with region=ALL can access all regions)
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    // Get slots - if no DB records, construct from disk structure
    let slots = car.id > 0 ? await listCarSlots(car.id) : [];
    
    // Ensure we always return 14 slots (1 dealer + 8 buyout + 5 dummies)
    if (slots.length < 14) {
      console.log(`[API] Only ${slots.length} slots in DB, constructing full 14-slot structure from disk`);
      
      const fullSlots = [];
      const slotPaths = getAllSlotPaths(car.region, car.make, car.model, car.vin);
      
      for (const slotPath of slotPaths) {
        // Check if we have this slot in DB
        const dbSlot = slots.find(s => 
          s.slot_type === slotPath.slotType && s.slot_index === slotPath.slotIndex
        );
        
        if (dbSlot) {
          fullSlots.push(dbSlot);
        } else {
          // Create synthetic slot from disk
          const lockMarkerPath = getLockMarkerPath(slotPath.path);
          const lockExists = await exists(lockMarkerPath);
          
          fullSlots.push({
            id: 0, // No DB record
            car_id: car.id,
            slot_type: slotPath.slotType,
            slot_index: slotPath.slotIndex,
            status: lockExists ? 'locked' : 'empty',
            locked_at: null,
            locked_by: null,
            lock_meta_json: null,
            disk_slot_path: slotPath.path,
            public_url: null,
            is_used: false,
            marked_used_at: null,
            marked_used_by: null,
            file_count: 0,
            total_size_mb: 0,
            last_sync_at: null,
          });
        }
      }
      
      slots = fullSlots;
    }
    
    // Get links
    const links = car.id > 0 ? await listCarLinks(car.id) : [];
    
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
