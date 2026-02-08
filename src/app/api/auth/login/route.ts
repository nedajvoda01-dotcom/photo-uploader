import { NextRequest, NextResponse } from "next/server";
import { loginUseCase } from "@/lib/application/auth/loginUseCase";
import { signSession, getSessionTTL } from "@/lib/infrastructure/auth/jwt";
import { COOKIE_NAME } from "@/lib/domain/auth/session";
import { AUTH_DEBUG, IS_PRODUCTION } from "@/lib/config/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email: rawEmail, password: rawPassword } = body;

    if (!rawEmail || !rawPassword) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Normalize email: trim whitespace and convert to lowercase
    const email = rawEmail.trim().toLowerCase();
    // Normalize password: trim whitespace
    const password = rawPassword.trim();

    // Debug diagnostics (only if AUTH_DEBUG=1)
    let debugInfo: Record<string, boolean | string | number> | null = null;
    
    if (AUTH_DEBUG) {
      debugInfo = {
        inputEmailPresent: !!email,
        inputPasswordPresent: !!password,
        inputEmailLength: email?.length ?? 0,
        inputPasswordLength: password?.length ?? 0,
        result: "unknown",
        reasonCode: "unknown",
      };
    }

    // Execute login use case
    const loginResult = await loginUseCase(email, password);

    if (!loginResult.success || !loginResult.user) {
      if (AUTH_DEBUG && debugInfo) {
        debugInfo.result = "fail";
        debugInfo.reasonCode = "LOGIN_USE_CASE_FAILED";
        console.warn("[AUTH_DEBUG] Login attempt failed:", debugInfo);
      }
      return NextResponse.json(
        { error: loginResult.error || "Invalid email or password" },
        { status: 401 }
      );
    }

    // Create session token
    let token: string;
    try {
      token = await signSession({
        userId: loginResult.user.id,
        email: loginResult.user.email,
        region: loginResult.user.region,
        role: loginResult.user.role,
      });
    } catch (error) {
      if (AUTH_DEBUG && debugInfo) {
        debugInfo.result = "fail";
        debugInfo.reasonCode = "jwt_sign_error";
        console.warn("[AUTH_DEBUG] Login attempt failed - JWT signing error:", debugInfo);
      }
      console.error("JWT signing error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const response = NextResponse.json(
      { success: true, message: "Login successful" },
      { status: 200 }
    );

    // Set session cookie
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PRODUCTION,
      maxAge: getSessionTTL(),
      path: "/",
    });

    if (AUTH_DEBUG && debugInfo) {
      debugInfo.result = "ok";
      debugInfo.reasonCode = loginResult.source || "unknown";
      console.info("[AUTH_DEBUG] Login successful:", debugInfo);
    }

    return response;
  } catch (error) {
    console.error("Login error:", error);
    
    if (error instanceof Error && error.message.includes("Users file not found")) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
