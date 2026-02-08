import { NextRequest, NextResponse } from "next/server";

/**
 * LEGACY LOGIN ENDPOINT - DEPRECATED
 * 
 * This endpoint is deprecated in favor of /api/auth/login
 * Returns 410 Gone to indicate the endpoint is permanently unavailable
 * 
 * DO NOT USE THIS ENDPOINT FOR NEW CODE
 * This endpoint does NOT set cookies and does NOT proxy responses
 */
export async function POST(request: NextRequest) {
  const authLoginUrl = new URL('/api/auth/login', request.url);
  
  return NextResponse.json(
    { 
      error: "This endpoint is permanently deprecated.",
      use: "/api/auth/login",
      redirect: authLoginUrl.toString()
    },
    { status: 410 } // 410 Gone - resource permanently unavailable
  );
}
