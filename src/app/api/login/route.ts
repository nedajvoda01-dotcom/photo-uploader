import { NextResponse } from "next/server";

/**
 * LEGACY LOGIN ENDPOINT - DEPRECATED
 * 
 * This endpoint is deprecated in favor of /api/auth/login
 * Returns 410 Gone to indicate the endpoint is permanently unavailable
 * 
 * DO NOT USE THIS ENDPOINT FOR NEW CODE
 * This endpoint does NOT set cookies and does NOT proxy responses
 */
export async function POST() {
  return NextResponse.json(
    { 
      error: "This endpoint is permanently deprecated.",
      use: "/api/auth/login"
    },
    { status: 410 } // 410 Gone - resource permanently unavailable
  );
}
