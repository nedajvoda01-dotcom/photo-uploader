import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { getUserByEmail } from "@/lib/users";
import { signSession, getSessionCookieName, getSessionTTL } from "@/lib/auth";

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
    const isDebugMode = process.env.AUTH_DEBUG === "1";
    let debugInfo: Record<string, boolean | string | number> | null = null;
    
    // Capture env vars once to avoid redundant reads
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    const authSecret = process.env.AUTH_SECRET;
    
    if (isDebugMode) {
      debugInfo = {
        hasAdminEmail: !!adminEmail,
        hasAdminPassword: !!adminPassword,
        hasAdminPasswordHash: !!adminPasswordHash,
        hasAuthSecret: !!authSecret,
        inputEmailPresent: !!email,
        inputPasswordPresent: !!password,
        emailEqualsAdmin: !!(adminEmail && email === adminEmail),
        emailTrimEqualsAdminTrim: !!(adminEmail && email && email.trim() === adminEmail.trim()),
        usingPlain: !!(adminPassword && adminEmail && email === adminEmail),
        usingHash: !!adminPasswordHash,
        // Technical metrics (lengths only, no actual values)
        envAdminEmailLength: adminEmail?.length ?? 0,
        envAdminPasswordLength: adminPassword?.length ?? 0,
        inputEmailLength: email?.length ?? 0,
        inputPasswordLength: password?.length ?? 0,
        result: "unknown", // Will be set later
        reasonCode: "unknown", // Will be set on failure
      };
    }

    // Check plain admin credentials BEFORE checking users.json
    // This fixes the issue where plain admin login was failing with "user_not_found"
    if (adminPassword && adminEmail && email === adminEmail) {
      // Verify password using constant-time comparison
      let isValid = false;
      try {
        const passwordBuffer = Buffer.from(password, 'utf8');
        const adminPasswordBuffer = Buffer.from(adminPassword, 'utf8');
        
        // timingSafeEqual requires buffers of equal length
        if (passwordBuffer.length === adminPasswordBuffer.length) {
          isValid = timingSafeEqual(passwordBuffer, adminPasswordBuffer);
        } else {
          // Lengths differ, password is incorrect
          // Perform a dummy comparison with fixed-size buffers to maintain constant time
          const dummyBuffer1 = Buffer.alloc(32);
          const dummyBuffer2 = Buffer.alloc(32);
          timingSafeEqual(dummyBuffer1, dummyBuffer2);
          isValid = false;
        }
      } catch {
        // Error during comparison (e.g., Buffer creation failed)
        // Perform dummy comparison to maintain timing consistency
        const dummyBuffer = Buffer.alloc(32);
        timingSafeEqual(dummyBuffer, dummyBuffer);
        isValid = false;
      }

      if (!isValid) {
        // Password mismatch for plain admin
        if (isDebugMode && debugInfo) {
          debugInfo.result = "fail";
          debugInfo.reasonCode = "password_mismatch_plain";
          console.warn("[AUTH_DEBUG] Login attempt failed - plain admin password mismatch:", debugInfo);
        }
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }

      // Plain admin login successful - create session and return
      let token: string;
      try {
        token = await signSession({ 
          userId: 0, // Legacy admin has ID 0
          email: adminEmail,
          region: process.env.DEFAULT_REGION || 'MSK',
          role: 'admin'
        });
      } catch (error) {
        if (isDebugMode && debugInfo) {
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

      // Set cookie
      const response = NextResponse.json(
        { success: true, message: "Login successful" },
        { status: 200 }
      );

      const isProduction = process.env.NODE_ENV === "production";
      response.cookies.set(getSessionCookieName(), token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: getSessionTTL(),
        path: "/",
      });

      // Log debug info on success
      if (isDebugMode && debugInfo) {
        debugInfo.result = "ok";
        console.info("[AUTH_DEBUG] Plain admin login successful:", debugInfo);
      }

      return response;
    }

    // Find user by email (users.json or ADMIN_PASSWORD_HASH)
    const user = getUserByEmail(email);
    if (!user) {
      // Log debug info on failure
      if (isDebugMode && debugInfo) {
        debugInfo.result = "fail";
        // Determine reason code
        if (!adminEmail) {
          debugInfo.reasonCode = "missing_env_admin_email";
        } else if (email !== adminEmail) {
          debugInfo.reasonCode = "email_mismatch";
        } else if (!adminPassword && !adminPasswordHash) {
          debugInfo.reasonCode = "missing_env_admin_password";
        } else {
          debugInfo.reasonCode = "user_not_found";
        }
        console.warn("[AUTH_DEBUG] Login attempt failed - user not found:", debugInfo);
      }
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Verify password using bcrypt hash
    // This path handles bcrypt hash authentication (plain admin already returned above if matched)
    let isValid = false;
    try {
      isValid = await bcrypt.compare(password, user.passwordHash);
    } catch (_error) {
      if (isDebugMode && debugInfo) {
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
      // Log debug info on failure
      if (isDebugMode && debugInfo) {
        debugInfo.result = "fail";
        debugInfo.reasonCode = "password_mismatch_hash";
        console.warn("[AUTH_DEBUG] Login attempt failed - invalid password:", debugInfo);
      }
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Create session token with extended payload
    let token: string;
    try {
      const defaultRegion = process.env.DEFAULT_REGION || 'MSK';
      token = await signSession({ 
        userId: 0, // Legacy file-based user
        email: user.email,
        region: defaultRegion,
        role: 'admin'
      });
    } catch (error) {
      if (isDebugMode && debugInfo) {
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

    // Set cookie
    const response = NextResponse.json(
      { success: true, message: "Login successful" },
      { status: 200 }
    );

    const isProduction = process.env.NODE_ENV === "production";
    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: getSessionTTL(),
      path: "/",
    });

    // Log debug info on success
    if (isDebugMode && debugInfo) {
      debugInfo.result = "ok";
      console.info("[AUTH_DEBUG] Login successful:", debugInfo);
    }

    return response;
  } catch (error) {
    console.error("Login error:", error);
    
    // Check if it's the users.json not found error
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
