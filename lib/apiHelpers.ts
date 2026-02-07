/**
 * API helper utilities for authentication and authorization
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionCookieName, verifySession, SessionPayload } from "./auth";
import { hasRegionAccess } from "./config";

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
 * Require admin role for an API endpoint
 * This is a convenience function that requires 'admin' role
 */
export async function requireAdmin(): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  return requireRole('admin');
}

/**
 * Check if session is an admin
 */
export function isAdmin(session: SessionPayload): boolean {
  return session.role === 'admin';
}

/**
 * Check if a session has access to a specific region
 * Admin (region=ALL) has access to all regions
 * Regular users can only access their own region
 */
export function checkRegionAccess(session: SessionPayload, targetRegion: string): boolean {
  return hasRegionAccess(session.region, targetRegion);
}

/**
 * Get effective region for a session
 * - For users: always their own region (ignore query params)
 * - For admins: use query param 'region' if provided, otherwise require it
 * 
 * @param session - User session
 * @param queryRegion - Optional region from query params
 * @returns Effective region to use, or null if admin needs to specify region
 */
export function getEffectiveRegion(session: SessionPayload, queryRegion?: string): string | null {
  // Users always use their own region (ignore query param)
  if (session.role !== 'admin') {
    return session.region;
  }
  
  // Admins must specify a region via query param (unless their region isn't ALL)
  if (session.region !== 'ALL') {
    // Admin with specific region assignment
    return session.region;
  }
  
  // Admin with ALL region - must specify via query param
  if (queryRegion) {
    return queryRegion;
  }
  
  // Admin needs to specify region
  return null;
}

/**
 * Require region access for an API endpoint
 * Returns error if user doesn't have access to the target region
 */
export function requireRegionAccess(
  session: SessionPayload,
  targetRegion: string
): { success: true } | { error: NextResponse } {
  if (!checkRegionAccess(session, targetRegion)) {
    return {
      error: NextResponse.json(
        { error: "Forbidden - region access denied" },
        { status: 403 }
      )
    };
  }
  
  return { success: true };
}
