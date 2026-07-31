import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const WORKER_COOKIE_NAME = "gpt_upi_worker";

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

    const worker = await prisma.worker.findUnique({
      where: { username: username.trim() },
      select: {
        id: true,
        username: true,
        displayName: true,
        passwordHash: true,
        isDisabled: true,
      },
    });

    if (!worker) {
      return fail("Invalid username or password", 401);
    }

    if (worker.isDisabled) {
      return fail("This account has been disabled", 403);
    }

    const passwordValid = await bcrypt.compare(password, worker.passwordHash);
    if (!passwordValid) {
      return fail("Invalid username or password", 401);
    }

    // Update last seen
    await prisma.worker.update({
      where: { id: worker.id },
      data: { lastSeenAt: new Date() },
    });

    // Create JWT token
    const token = await new SignJWT({ workerId: worker.id })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(getJwtSecret());

    const response = NextResponse.json(
      { ok: true, data: { redirectTo: "/worker" } },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );

    response.cookies.set(WORKER_COOKIE_NAME, token, {
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
