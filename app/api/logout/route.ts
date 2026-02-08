import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/domain/auth/session";
import { IS_PRODUCTION } from "@/lib/config/auth";

export async function POST() {
  const response = NextResponse.json(
    { success: true, message: "Logged out successfully" },
    { status: 200 }
  );

  // Clear the session cookie by setting Max-Age to 0
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    maxAge: 0,
    path: "/",
  });

  return response;
}
