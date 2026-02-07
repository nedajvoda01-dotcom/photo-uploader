import { NextResponse } from "next/server";
import { REGIONS } from "@/lib/config";

/**
 * GET /api/config/regions
 * Get available regions from ENV
 * Public endpoint (no auth required for simplicity)
 */
export async function GET() {
  return NextResponse.json({
    regions: REGIONS,
  });
}
