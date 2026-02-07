import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarById } from "@/lib/models/cars";
import { getCarSlot, setSlotPublicUrl } from "@/lib/models/carSlots";
import { publish } from "@/lib/yandexDisk";
import { validateSlot, type SlotType } from "@/lib/yandexDiskStructure";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/cars/:id/share?slotType=<type>&slotIndex=<index>
 * Get or create a public share link for a slot
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
  const carId = parseInt(params.id, 10);
  
  if (isNaN(carId)) {
    return NextResponse.json(
      { error: "Invalid car ID" },
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
    const car = await getCarById(carId);
    
    if (!car) {
      return NextResponse.json(
        { error: "Car not found" },
        { status: 404 }
      );
    }
    
    // Check region permission (admin with region=ALL can access all regions)
    const regionCheck = requireRegionAccess(session, car.region);
    if ('error' in regionCheck) {
      return regionCheck.error;
    }
    
    const slot = await getCarSlot(carId, slotType, slotIndex);
    
    if (!slot) {
      return NextResponse.json(
        { error: "Slot not found" },
        { status: 404 }
      );
    }
    
    // If public URL already exists, return it
    if (slot.public_url) {
      return NextResponse.json({
        success: true,
        url: slot.public_url,
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
    
    // Save the public URL in database
    await setSlotPublicUrl(carId, slotType, slotIndex, publishResult.url);
    
    return NextResponse.json({
      success: true,
      url: publishResult.url,
      cached: false,
    });
  } catch (error) {
    console.error("Error creating share link:", error);
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}
