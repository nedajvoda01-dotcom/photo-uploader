import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { checkBootstrapAdmin } from "@/lib/userAuth";
import { upsertUser } from "@/lib/models/users";
import { getUserByEmail } from "@/lib/users";
import { signSession, getSessionCookieName, getSessionTTL } from "@/lib/auth";
import { AUTH_DEBUG, ADMIN_REGION, IS_PRODUCTION } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

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

    // Step 1: Check bootstrap admins FIRST (from ENV)
    const bootstrapResult = await checkBootstrapAdmin(email, password);
    
    if (bootstrapResult.isBootstrapAdmin && bootstrapResult.user) {
      // Bootstrap admin login successful - upsert to database
      let dbUser;
      try {
        dbUser = await upsertUser({
          email: bootstrapResult.user.email,
          passwordHash: bootstrapResult.user.passwordHash,
          region: bootstrapResult.user.region,
          role: bootstrapResult.user.role,
        });
      } catch (dbError) {
        console.error('[AUTH] Failed to upsert bootstrap admin to database:', dbError);
        // Continue with bootstrap user if DB fails
        dbUser = bootstrapResult.user;
      }
      
      let token: string;
      try {
        token = await signSession({
          userId: dbUser.id,
          email: dbUser.email,
          region: dbUser.region,
          role: dbUser.role,
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

      response.cookies.set(getSessionCookieName(), token, {
        httpOnly: true,
        sameSite: "lax",
        secure: IS_PRODUCTION,
        maxAge: getSessionTTL(),
        path: "/",
      });

      if (AUTH_DEBUG && debugInfo) {
        debugInfo.result = "ok";
        debugInfo.reasonCode = "bootstrap_admin";
        console.info("[AUTH_DEBUG] Bootstrap admin login successful:", debugInfo);
      }

      return response;
    }

    // Step 2: Find user in file/env (this is the legacy /api/login route, doesn't check DB)
    // For database users, use /api/auth/login instead
    const user = getUserByEmail(email);
    if (!user) {
      if (AUTH_DEBUG && debugInfo) {
        debugInfo.result = "fail";
        debugInfo.reasonCode = "user_not_found";
        console.warn("[AUTH_DEBUG] Login attempt failed - user not found:", debugInfo);
      }
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Step 3: Verify password using bcrypt hash
    let isValid = false;
    try {
      isValid = await bcrypt.compare(password, user.passwordHash);
    } catch {
      if (AUTH_DEBUG && debugInfo) {
        debugInfo.result = "fail";
        debugInfo.reasonCode = "hash_compare_error";
        console.warn("[AUTH_DEBUG] Login attempt failed - bcrypt compare error:", debugInfo);
      }
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (!isValid) {
      if (AUTH_DEBUG && debugInfo) {
        debugInfo.result = "fail";
        debugInfo.reasonCode = "password_mismatch_hash";
        console.warn("[AUTH_DEBUG] Login attempt failed - invalid password:", debugInfo);
      }
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Step 4: Create session token
    let token: string;
    try {
      token = await signSession({ 
        userId: 0, // Legacy file-based user
        email: user.email,
        region: ADMIN_REGION, // Use ADMIN_REGION instead of hardcoded
        role: 'admin' // File-based users are admins by default
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

    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PRODUCTION,
      maxAge: getSessionTTL(),
      path: "/",
    });

    if (AUTH_DEBUG && debugInfo) {
      debugInfo.result = "ok";
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
