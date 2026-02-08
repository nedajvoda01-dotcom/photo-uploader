import { NextRequest, NextResponse } from "next/server";

/**
 * LEGACY LOGIN ENDPOINT - DEPRECATED
 * 
 * This endpoint is deprecated in favor of /api/auth/login
 * It returns a redirect response pointing to the new endpoint
 * 
 * DO NOT USE THIS ENDPOINT FOR NEW CODE
 * This endpoint does NOT set cookies - clients must call /api/auth/login directly
 */
export async function POST(request: NextRequest) {
  // Return a 307 redirect to /api/auth/login
  // This tells the client to redirect with the same method (POST) and body
  const authLoginUrl = new URL('/api/auth/login', request.url);
  
  return NextResponse.json(
    { 
      error: "This endpoint is deprecated. Please use /api/auth/login instead.",
      redirect: authLoginUrl.toString()
    },
    { status: 308 } // 308 Permanent Redirect preserves request method
  );
}
