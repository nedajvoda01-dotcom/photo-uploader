import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiHelpers";

/**
 * GET /api/me
 * Get current user information
 */
export async function GET() {
  const authResult = await requireAuth();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  
  return NextResponse.json({
    userId: session.userId,
    email: session.email,
    region: session.region,
    role: session.role,
  });
}
