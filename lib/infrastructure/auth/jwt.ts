/**
 * Infrastructure: JWT Token Operations
 * Handles JWT signing and verification using jose
 */

import { SignJWT, jwtVerify } from "jose";
import { AUTH_SECRET } from "@/lib/config/auth";
import { SessionPayload, TOKEN_TTL } from "@/lib/domain/auth/session";

// Lazy initialization of secret to avoid build-time errors
let secret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (!secret) {
    if (!AUTH_SECRET) {
      throw new Error("AUTH_SECRET environment variable is required");
    }
    secret = new TextEncoder().encode(AUTH_SECRET);
  }
  return secret;
}

/**
 * Sign a session payload and return a JWT token
 * @param payload Session data to encode
 * @returns JWT token string
 */
export async function signSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  return token;
}

/**
 * Verify a JWT token and return the payload
 * @param token JWT token to verify
 * @returns Session payload if valid, null otherwise
 */
export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as SessionPayload;
  } catch (error) {
    console.error("Session verification failed:", error);
    return null;
  }
}

/**
 * Get the session TTL in seconds
 */
export function getSessionTTL(): number {
  return TOKEN_TTL;
}
