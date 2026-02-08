import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, requireRegionAccess, errorResponse, successResponse, ErrorCodes, validateNotAllRegion } from "@/lib/apiHelpers";
import { getCarByVin, getCarByRegionAndVin } from "@/lib/models/cars";
import { getCarSlot, markSlotAsUsed, markSlotAsUnused } from "@/lib/models/carSlots";
import { validateSlot, type SlotType, getLockMarkerPath } from "@/lib/diskPaths";
import { listFolder, downloadFile, exists } from "@/lib/yandexDisk";
import { validateZipLimits } from "@/lib/config";
import archiver from "archiver";
import { Writable } from "stream";

interface RouteContext {
  params: Promise<{ vin: string; slotType: string; slotIndex: string }>;
}

/**
 * GET /api/cars/vin/:vin/slots/:slotType/:slotIndex
 * Download slot as ZIP (only for locked slots)
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
  const vin = params.vin.toUpperCase();
  const slotType = params.slotType;
  const slotIndex = parseInt(params.slotIndex, 10);
  
  if (!vin || vin.length !== 17) {
    return NextResponse.json(
      { error: "Invalid VIN format. VIN must be exactly 17 characters" },
      { status: 400 }
    );
  }
  
  if (isNaN(slotIndex)) {
    return NextResponse.json(
      { error: "Invalid slot index" },
      { status: 400 }
    );
  }
  
  // Validate slot
  if (!validateSlot(slotType as SlotType, slotIndex)) {
    return NextResponse.json(
      { error: "Invalid slot type and index combination" },
      { status: 400 }
    );
  }
  
  try {
    const car = await getCarByRegionAndVin(session.region, vin);
    
    if (!car) {
      return NextResponse.json(
        { error: "Car not found in your region" },
        { status: 404 }
      );
    }
    
    // Check region permission
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    const slot = await getCarSlot(car.id, slotType, slotIndex);
    
    if (!slot) {
      return NextResponse.json(
        { error: "Slot not found" },
        { status: 404 }
      );
    }
    
    // Check if slot is locked (only locked slots can be downloaded)
    const lockMarkerPath = getLockMarkerPath(slot.disk_slot_path);
    const lockExists = await exists(lockMarkerPath);
    
    if (!lockExists) {
      return NextResponse.json(
        { error: "Slot is not locked. Only locked slots can be downloaded." },
        { status: 409 }
      );
    }
    
    // List files in slot folder
    const folderContents = await listFolder(slot.disk_slot_path);
    if (!folderContents.success || !folderContents.items) {
      return NextResponse.json(
        { error: "Failed to list slot contents" },
        { status: 500 }
      );
    }
    
    // Filter out _LOCK.json and only include files (not folders)
    const files = folderContents.items.filter(
      item => item.type === 'file' && !item.name.endsWith('_LOCK.json')
    );
    
    // Calculate total size in MB
    const totalSizeBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024);
    
    // Validate ZIP limits
    const limitsCheck = validateZipLimits(files.length, totalSizeMB);
    if (!limitsCheck.valid) {
      return NextResponse.json(
        { error: limitsCheck.error },
        { status: 413 }
      );
    }
    
    // Create streaming ZIP response
    const archive = archiver('zip', {
      zlib: { level: 6 } // Compression level
    });
    
    // Set up response headers for streaming
    const headers = new Headers();
    headers.set('Content-Type', 'application/zip');
    
    // Sanitize filename components (remove special characters)
    const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${sanitize(car.make)}_${sanitize(car.model)}_${sanitize(vin)}_${slotType}_${slotIndex}.zip`;
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Create a TransformStream for converting Node.js stream to Web Stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    
    // Wrap the writer in a Node.js Writable stream
    const nodeWritable = new Writable({
      write(chunk, encoding, callback) {
        writer.write(chunk).then(() => callback()).catch(callback);
      },
      final(callback) {
        writer.close().then(() => callback()).catch(callback);
      }
    });
    
    // Pipe archiver to the Node.js writable stream
    archive.pipe(nodeWritable);
    
    // Add files to archive asynchronously
    (async () => {
      try {
        for (const file of files) {
          const filePath = `${slot.disk_slot_path}/${file.name}`;
          const downloadResult = await downloadFile(filePath);
          
          if (downloadResult.success && downloadResult.data) {
            archive.append(downloadResult.data, { name: file.name });
          } else {
            console.error(`Failed to download file ${file.name}:`, downloadResult.error);
          }
        }
        
        // Finalize the archive
        await archive.finalize();
      } catch (error) {
        console.error('Error creating ZIP archive:', error);
        archive.abort();
      }
    })();
    
    return new NextResponse(readable, { headers });
  } catch (error) {
    console.error("Error downloading slot ZIP:", error);
    return NextResponse.json(
      { error: "Failed to download slot" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/cars/vin/:vin/slots/:slotType/:slotIndex
 * Mark a slot as used or unused by VIN (admin only)
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const authResult = await requireAdmin();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  
  const params = await context.params;
  const vin = params.vin.toUpperCase();
  const slotType = params.slotType;
  const slotIndex = parseInt(params.slotIndex, 10);
  
  if (!vin || vin.length !== 17) {
    return NextResponse.json(
      { error: "Invalid VIN format. VIN must be exactly 17 characters" },
      { status: 400 }
    );
  }
  
  if (isNaN(slotIndex)) {
    return NextResponse.json(
      { error: "Invalid slot index" },
      { status: 400 }
    );
  }
  
  // Validate slot
  if (!validateSlot(slotType as SlotType, slotIndex)) {
    return NextResponse.json(
      { error: "Invalid slot type and index combination" },
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
    
    // Block marking operations on ALL region (archive only)  
    const allRegionCheck = validateNotAllRegion(car.region);
    if ('error' in allRegionCheck) {
      return allRegionCheck.error;
    }
    
    const slot = await getCarSlot(car.id, slotType, slotIndex);
    
    if (!slot) {
      return NextResponse.json(
        { error: "Slot not found" },
        { status: 404 }
      );
    }
    
    // Check if slot is locked (only locked slots can be marked as used/unused)
    const lockMarkerPath = getLockMarkerPath(slot.disk_slot_path);
    const lockExists = await exists(lockMarkerPath);
    
    if (!lockExists) {
      return NextResponse.json(
        { error: "Slot is not locked. Only locked slots can be marked as used/unused." },
        { status: 409 }
      );
    }
    
    // Parse request body
    const body = await request.json();
    const { isUsed } = body;
    
    if (typeof isUsed !== 'boolean') {
      return NextResponse.json(
        { error: "isUsed must be a boolean" },
        { status: 400 }
      );
    }
    
    // Mark slot as used or unused
    const updatedSlot = isUsed
      ? await markSlotAsUsed(car.id, slotType, slotIndex, session.email || session.userId?.toString() || 'unknown')
      : await markSlotAsUnused(car.id, slotType, slotIndex);
    
    return NextResponse.json({
      success: true,
      slot: updatedSlot,
    });
  } catch (error) {
    console.error("Error marking slot by VIN:", error);
    return NextResponse.json(
      { error: "Failed to update slot" },
      { status: 500 }
    );
  }
}
