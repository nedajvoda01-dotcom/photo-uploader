import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiHelpers";
import { getCarById } from "@/lib/models/cars";
import { getCarSlot, markSlotAsUsed, markSlotAsUnused } from "@/lib/models/carSlots";
import { validateSlot, type SlotType } from "@/lib/yandexDiskStructure";

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
  const authResult = await requireAuth();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  
  // Check if user is admin
  if (session.role !== 'admin') {
    return NextResponse.json(
      { error: "Forbidden - admin access required" },
      { status: 403 }
    );
  }
  
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
    
    // Check region permission
    if (car.region !== session.region) {
      return NextResponse.json(
        { error: "Access denied - region mismatch" },
        { status: 403 }
      );
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
      ? await markSlotAsUsed(carId, slotType, slotIndex, session.userId)
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
