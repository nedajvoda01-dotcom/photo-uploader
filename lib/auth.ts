import { SignJWT, jwtVerify } from "jose";

const SECRET_KEY = process.env.AUTH_SECRET;
const COOKIE_NAME = "session";
const TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

if (!SECRET_KEY) {
  throw new Error("AUTH_SECRET environment variable is required");
}

const secret = new TextEncoder().encode(SECRET_KEY);

export interface SessionPayload {
  userId: number;
  email: string;
  region: string;
  role: string;
  [key: string]: unknown;
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
    .sign(secret);

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
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch (error) {
    console.error("Session verification failed:", error);
    return null;
  }
}

/**
 * Get the cookie name for session
 */
export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

/**
 * Get the session TTL in seconds
 */
export function getSessionTTL(): number {
  return TOKEN_TTL;
}
