/**
 * Domain: Session payload and invariants
 * Pure business rules for session data structure
 */

export interface SessionPayload {
  userId: number;
  email: string;
  region: string;
  role: string;
  [key: string]: unknown;
}

/**
 * Validate session payload has required fields
 */
export function validateSessionPayload(payload: unknown): payload is SessionPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  
  const p = payload as Partial<SessionPayload>;
  
  return (
    typeof p.userId === 'number' &&
    typeof p.email === 'string' &&
    typeof p.region === 'string' &&
    typeof p.role === 'string'
  );
}

/**
 * Session constants
 */
export const COOKIE_NAME = "session";
export const TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
