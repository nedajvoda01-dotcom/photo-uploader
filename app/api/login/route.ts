import { NextRequest, NextResponse } from "next/server";

/**
 * LEGACY LOGIN ENDPOINT - DEPRECATED
 * 
 * This endpoint is deprecated in favor of /api/auth/login
 * It redirects all requests to the new endpoint for backward compatibility
 * 
 * DO NOT USE THIS ENDPOINT FOR NEW CODE
 * 
 * Note: Uses internal fetch for simplicity. While this adds HTTP overhead,
 * it keeps code simple and this endpoint should not be used in production.
 */
export async function POST(request: NextRequest) {
  try {
    // Read the request body
    const body = await request.json();
    
    // Forward to the new /api/auth/login endpoint
    const authLoginUrl = new URL('/api/auth/login', request.url);
    
    const response = await fetch(authLoginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    // Get the response data and headers
    const data = await response.json();
    const nextResponse = NextResponse.json(data, { status: response.status });
    
    // Copy cookies from the auth/login response
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      // Parse and set the cookie
      const cookieParts = setCookieHeader.split(';');
      const [nameValue] = cookieParts;
      const [name, value] = nameValue.split('=');
      
      if (name && value) {
        // Extract cookie attributes
        const httpOnly = setCookieHeader.includes('HttpOnly');
        const secure = setCookieHeader.includes('Secure');
        const sameSiteMatch = setCookieHeader.match(/SameSite=(\w+)/i);
        const sameSite = sameSiteMatch ? sameSiteMatch[1].toLowerCase() as 'strict' | 'lax' | 'none' : 'lax';
        const maxAgeMatch = setCookieHeader.match(/Max-Age=(\d+)/i);
        const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : undefined;
        const pathMatch = setCookieHeader.match(/Path=([^;]+)/i);
        const path = pathMatch ? pathMatch[1].trim() : '/';
        
        nextResponse.cookies.set(name.trim(), value.trim(), {
          httpOnly,
          sameSite,
          secure,
          maxAge,
          path,
        });
      }
    }
    
    return nextResponse;
  } catch (error) {
    console.error("Legacy login endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
