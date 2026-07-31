import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const PUBLIC_USER_COOKIE_NAME = "gpt_upi_public_user";

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

    const trimmedUsername = username.trim().toLowerCase();

    // Find existing user by username in PublicUserAccount table
    let user = await prisma.publicUserAccount.findUnique({
      where: { username: trimmedUsername },
      select: { id: true, username: true, passwordHash: true, isDisabled: true },
    });

    if (!user) {
      return fail("Invalid username or password. If you don't have an account, register first.", 401);
    }

    if (user.isDisabled) {
      return fail("This account has been disabled", 403);
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return fail("Invalid username or password", 401);
    }

    // Create JWT token — use the user's ID as "telegramUserId" for backward compatibility
    // across wallet, extraction, and other systems
    const token = await new SignJWT({
      publicUser: true,
      telegramUserId: user.id,
      telegramUsername: user.username,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(getJwtSecret());

    const response = NextResponse.json(
      { ok: true, data: { redirectTo: "/" } },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );

    response.cookies.set(PUBLIC_USER_COOKIE_NAME, token, {
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
