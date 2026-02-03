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

    // Find user by email
    const user = getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Verify password
    // Priority: ADMIN_PASSWORD (plain) > ADMIN_PASSWORD_HASH (bcrypt)
    let isValid = false;
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    // Check if plain password is configured and email matches
    if (adminPassword && adminEmail && email === adminEmail) {
      // Use constant-time comparison to prevent timing attacks
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
    } else {
      // Fallback to bcrypt hash comparison
      isValid = await bcrypt.compare(password, user.passwordHash);
    }

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Create session token
    const token = await signSession({ email: user.email });

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
