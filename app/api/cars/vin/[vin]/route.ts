import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarByRegionAndVin, getCarByVin, deleteCarByVin } from "@/lib/models/cars";
import { listCarSlots } from "@/lib/models/carSlots";
import { listCarLinks } from "@/lib/models/carLinks";
import { syncRegion } from "@/lib/sync";
import { moveFolder, listFolder, exists } from "@/lib/yandexDisk";
import { ensureDbSchema } from "@/lib/db";
import { getBasePath, getAllSlotPaths, getLockMarkerPath } from "@/lib/diskPaths";
import { ARCHIVE_RETRY_DELAY_MS } from "@/lib/config";

// Constants
const EXPECTED_SLOT_COUNT = 14; // 1 dealer + 8 buyout + 5 dummies
const NO_DB_RECORD_ID = -1; // Sentinel value indicating record not in database

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
    
    // Get car by VIN first (without region filter)
    // This allows admin with region=ALL to find the car before checking permissions
    let car = await getCarByVin(vin);
    
    // If car not found in DB, try to sync and construct from disk
    if (!car) {
      // Sync region from disk first (DB as cache, Disk as truth)
      console.log(`[API] Car ${vin} not in DB, syncing region ${session.region}`);
      await syncRegion(session.region);
      
      // Try to get car again after sync
      car = await getCarByVin(vin);
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
                  id: NO_DB_RECORD_ID, // Sentinel: no DB record
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
            { error: "Car not found" },
            { status: 404 }
          );
        }
      }
    }
    
    // Check region permission (admin with region=ALL can access all regions)
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    // Get slots - if no DB records, construct from disk structure
    let slots = car.id > 0 ? await listCarSlots(car.id) : [];
    
    // Ensure we always return expected slot count (1 dealer + 8 buyout + 5 dummies)
    if (slots.length < EXPECTED_SLOT_COUNT) {
      console.log(`[API] Only ${slots.length} slots in DB, constructing full ${EXPECTED_SLOT_COUNT}-slot structure from disk`);
      
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
            id: NO_DB_RECORD_ID, // Sentinel: no DB record
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
    // Get car by VIN first (without region filter)
    const car = await getCarByVin(vin);
    
    if (!car) {
      return NextResponse.json(
        { error: "Car not found" },
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
    
    // PHASE 1: Move folder on disk (with retry)
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
      
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, ARCHIVE_RETRY_DELAY_MS)); // configurable retry delay
      }
    }
    
    if (!moveSuccess) {
      console.error(`[Archive] All move attempts failed. NOT updating database.`);
      return NextResponse.json(
        { 
          error: "Failed to archive car on disk after 3 attempts. Database not updated.", 
          details: lastError 
        },
        { status: 500 }
      );
    }
    
    // PHASE 2: Update database (only after successful move)
    console.log(`[Archive] Disk move successful. Marking car as deleted in DB.`);
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
