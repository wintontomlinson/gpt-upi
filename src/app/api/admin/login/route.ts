import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { fail, handleRouteError, ok } from "@/lib/server/responses";

export const runtime = "nodejs";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const ADMIN_COOKIE_NAME = "gpt_upi_admin";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password) {
      return fail("Username and password are required", 400);
    }

    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

    if (username !== adminUsername || password !== adminPassword) {
      return fail("Invalid username or password", 401);
    }

    // Create JWT token
    const token = await new SignJWT({ admin: true, username })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(getJwtSecret());

    const response = NextResponse.json(
      { ok: true, data: { redirectTo: "/admin" } },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );

    response.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    });

    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
