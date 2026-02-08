import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarWithSlots, getSlot, savePublishedUrl, getPublishedUrl } from "@/lib/infrastructure/diskStorage/carsRepo";
import { publish } from "@/lib/infrastructure/yandexDisk/client";
import { validateSlot, type SlotType } from "@/lib/domain/disk/paths";
import { REGIONS_LIST } from '@/lib/config/index';

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/**
 * GET /api/cars/vin/:vin/share?slotType=<type>&slotIndex=<index>
 * Get or create a public share link for a slot by VIN
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
  
  if (!vin || vin.length !== 17) {
    return NextResponse.json(
      { error: "Invalid VIN format. VIN must be exactly 17 characters" },
      { status: 400 }
    );
  }
  
  // Get query parameters
  const { searchParams } = new URL(request.url);
  const slotType = searchParams.get("slotType");
  const slotIndex = parseInt(searchParams.get("slotIndex") || "", 10);
  
  if (!slotType || isNaN(slotIndex)) {
    return NextResponse.json(
      { error: "slotType and slotIndex query parameters are required" },
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
    // For admins with region=ALL, search all regions
    // For regular users, only search their assigned region
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
    
    const slot = await getSlot(car.disk_root_path, slotType as SlotType, slotIndex);
    
    if (!slot) {
      return NextResponse.json(
        { error: "Slot not found" },
        { status: 404 }
      );
    }
    
    // Check if published URL already exists in _PUBLISHED.json
    const existingUrl = await getPublishedUrl(slot.disk_slot_path);
    if (existingUrl) {
      return NextResponse.json({
        success: true,
        url: existingUrl,
        cached: true,
      });
    }
    
    // Otherwise, publish the folder and save the URL
    const publishResult = await publish(slot.disk_slot_path);
    
    if (!publishResult.success || !publishResult.url) {
      return NextResponse.json(
        { error: `Failed to publish slot: ${publishResult.error}` },
        { status: 500 }
      );
    }
    
    // Save the public URL to _PUBLISHED.json
    await savePublishedUrl(slot.disk_slot_path, publishResult.url);
    
    return NextResponse.json({
      success: true,
      url: publishResult.url,
      cached: false,
    });
  } catch (error) {
    console.error("Error creating share link by VIN:", error);
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}
