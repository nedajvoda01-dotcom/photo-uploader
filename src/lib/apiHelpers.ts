/**
 * API helper utilities for authentication and authorization
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "./infrastructure/auth/jwt";
import { SessionPayload, COOKIE_NAME } from "./domain/auth/session";
import { hasRegionAccess } from "./config/index";

/**
 * Standard error codes for API responses
 */
export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  REGION_ACCESS_DENIED: 'region_access_denied',
  REGION_ALL_FORBIDDEN: 'REGION_ALL_FORBIDDEN',
  
  // Validation
  VALIDATION_ERROR: 'validation_error',
  INVALID_VIN: 'invalid_vin',
  INVALID_INPUT: 'invalid_input',
  REGION_REQUIRED: 'region_required',
  
  // Business Logic
  CAR_NOT_FOUND: 'car_not_found',
  SLOT_NOT_FOUND: 'slot_not_found',
  ALREADY_EXISTS: 'already_exists',
  SLOT_LOCKED: 'slot_locked',
  
  // System Errors
  SERVER_ERROR: 'server_error',
  DISK_ERROR: 'disk_error',
  DB_ERROR: 'db_error',
} as const;

/**
 * Create a standardized error response
 * Format: { ok: false, code: "...", message: "...", status: xxx }
 */
export function errorResponse(
  code: string,
  message: string,
  status: number = 500,
  additionalData?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code,
      message,
      status,
      ...additionalData,
    },
    { status }
  );
}

/**
 * Create a standardized success response
 * Format: { ok: true, ...data }
 */
export function successResponse(
  data: Record<string, unknown>,
  status: number = 200
): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      ...data,
    },
    { status }
  );
}

/**
 * Get the current user session from the request
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  
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
      error: errorResponse(
        ErrorCodes.UNAUTHORIZED,
        "Необходима авторизация",
        401
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
      error: errorResponse(
        ErrorCodes.FORBIDDEN,
        "Недостаточно прав доступа",
        403
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
      error: errorResponse(
        ErrorCodes.REGION_ACCESS_DENIED,
        "Нет доступа к этому региону",
        403
      )
    };
  }
  
  return { success: true };
}

/**
 * Validate that a region is not ALL (for create/upload/lock operations)
 * Returns error if region is ALL
 */
export function validateNotAllRegion(region: string): { success: true } | { error: NextResponse } {
  if (region === 'ALL') {
    return {
      error: errorResponse(
        ErrorCodes.REGION_ALL_FORBIDDEN,
        "Нельзя создавать, загружать или блокировать в регионе ALL. Регион ALL предназначен только для архивирования. Выберите конкретный регион.",
        400
      )
    };
  }
  
  return { success: true };
}
