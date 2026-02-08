import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/infrastructure/auth/jwt";
import { COOKIE_NAME } from "@/lib/domain/auth/session";
import { IS_PRODUCTION } from "@/lib/config/auth";

// Paths that don't require authentication
const PUBLIC_PATHS = ["/login", "/api/login", "/api/auth/login", "/api/logout"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // Check if this is an API route
  const isApiRoute = pathname.startsWith("/api/");
  
  // Check for session cookie
  const sessionCookie = request.cookies.get(COOKIE_NAME);
  
  if (!sessionCookie?.value) {
    // No session - return JSON for API routes, redirect for pages
    if (isApiRoute) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Verify session
  const session = await verifySession(sessionCookie.value);
  
  if (!session) {
    // Invalid session - return JSON for API routes, redirect for pages
    if (isApiRoute) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }
    
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    
    // Clear invalid session cookie
    response.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PRODUCTION,
      maxAge: 0,
      path: "/",
    });
    
    return response;
  }

  // Session is valid, allow request
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with common extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
