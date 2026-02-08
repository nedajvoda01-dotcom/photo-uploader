import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarById } from "@/lib/infrastructure/db/carsRepo";
import { getCarSlot, markSlotAsUsed, markSlotAsUnused } from "@/lib/infrastructure/db/carSlotsRepo";
import { validateSlot, type SlotType } from "@/lib/domain/disk/paths";

interface RouteContext {
  params: Promise<{ id: string; slotType: string; slotIndex: string }>;
}

/**
 * PATCH /api/cars/:id/slots/:slotType/:slotIndex
 * Mark a slot as used or unused (admin only)
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
  const carId = parseInt(params.id, 10);
  const slotType = params.slotType;
  const slotIndex = parseInt(params.slotIndex, 10);
  
  if (isNaN(carId) || isNaN(slotIndex)) {
    return NextResponse.json(
      { error: "Invalid car ID or slot index" },
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
      ? await markSlotAsUsed(carId, slotType, slotIndex, session.email || session.userId?.toString() || 'unknown')
      : await markSlotAsUnused(carId, slotType, slotIndex);
    
    return NextResponse.json({
      success: true,
      slot: updatedSlot,
    });
  } catch (error) {
    console.error("Error marking slot:", error);
    return NextResponse.json(
      { error: "Failed to update slot" },
      { status: 500 }
    );
  }
}
