import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRegionAccess } from "@/lib/apiHelpers";
import { getCarByRegionAndVin } from "@/lib/models/cars";
import { getCarSlot, markSlotAsUsed, markSlotAsUnused } from "@/lib/models/carSlots";
import { validateSlot, type SlotType } from "@/lib/diskPaths";

interface RouteContext {
  params: Promise<{ vin: string; slotType: string; slotIndex: string }>;
}

/**
 * PATCH /api/cars/vin/:vin/slots/:slotType/:slotIndex
 * Mark a slot as used or unused by VIN (admin only)
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
      ? await markSlotAsUsed(car.id, slotType, slotIndex, session.userId)
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
