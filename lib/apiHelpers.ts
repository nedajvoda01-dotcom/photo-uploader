/**
 * API helper utilities for authentication and authorization
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionCookieName, verifySession, SessionPayload } from "./auth";

/**
 * Get the current user session from the request
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(getSessionCookieName());
  
  if (!sessionCookie) {
    return null;
  }
  
  return verifySession(sessionCookie.value);
}

/**
 * Require authentication for an API endpoint
 * Returns the session if valid, or an error response if not
 */
export async function requireAuth(): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = await getSession();
  
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    };
  }
  
  return { session };
}

/**
 * Require a specific role for an API endpoint
 */
export async function requireRole(
  role: string
): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const authResult = await requireAuth();
  
  if ('error' in authResult) {
    return authResult;
  }
  
  if (authResult.session.role !== role) {
    return {
      error: NextResponse.json(
        { error: "Forbidden - insufficient permissions" },
        { status: 403 }
      )
    };
  }
  
  return authResult;
}

/**
 * Check if a session belongs to a specific region
 */
export function checkRegion(session: SessionPayload, requiredRegion: string): boolean {
  return session.region === requiredRegion;
}
