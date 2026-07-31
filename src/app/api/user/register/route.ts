import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const PUBLIC_USER_COOKIE_NAME = "gpt_upi_public_user";
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
const MIN_PASSWORD_LENGTH = 6;
const USERNAME_RE = /^[a-z0-9_]+$/;

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

    // Validate username
    if (trimmedUsername.length < MIN_USERNAME_LENGTH) {
      return fail(`Username must be at least ${MIN_USERNAME_LENGTH} characters`, 400);
    }
    if (trimmedUsername.length > MAX_USERNAME_LENGTH) {
      return fail(`Username must be at most ${MAX_USERNAME_LENGTH} characters`, 400);
    }
    if (!USERNAME_RE.test(trimmedUsername)) {
      return fail("Username can only contain lowercase letters, numbers, and underscores", 400);
    }

    // Validate password
    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
    }

    // Check if username already exists
    const existing = await prisma.publicUserAccount.findUnique({
      where: { username: trimmedUsername },
      select: { id: true },
    });

    if (existing) {
      return fail("Username already taken. Please choose another.", 409);
    }

    // Create user
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.publicUserAccount.create({
      data: {
        username: trimmedUsername,
        passwordHash,
      },
      select: { id: true, username: true },
    });

    // Create JWT token
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
