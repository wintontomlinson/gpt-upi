import { NextResponse } from "next/server";
import { setAdminCookie, setPublicUserCookie, setWorkerCookie } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import {
  getTelegramLoginChallenge,
  markTelegramLoginChallengeUsed,
  parseLoginPurpose,
} from "@/lib/server/telegram-login";
import { fail, handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ challengeId: string }> }) {
  try {
    const { challengeId } = await context.params;
    const purpose = parseLoginPurpose(new URL(request.url).searchParams.get("purpose"));
    if (!purpose) return fail("Invalid login type");

    const challenge = await getTelegramLoginChallenge(challengeId, purpose);
    if (!challenge) return fail("Login code not found", 404);

    if (challenge.status !== "APPROVED") {
      return NextResponse.json({
        ok: true,
        data: {
          status: challenge.status,
          expiresAt: challenge.expiresAt,
        },
      });
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        status: "APPROVED",
        redirectTo: purpose === "ADMIN" ? "/admin" : purpose === "USER" ? "/" : "/worker",
      },
    });

    if (purpose === "ADMIN") {
      if (!challenge.telegramUserId) return fail("Admin login confirmation missing Telegram ID", 400);
      await setAdminCookie(response, challenge.telegramUserId);
    } else if (purpose === "USER") {
      if (!challenge.telegramUserId) return fail("User login confirmation missing Telegram ID", 400);
      await setPublicUserCookie(response, {
        telegramUserId: challenge.telegramUserId,
        telegramUsername: challenge.telegramUsername,
      });
    } else {
      if (!challenge.workerId) return fail("Worker login confirmation missing worker ID", 400);
      await prisma.worker.update({
        where: { id: challenge.workerId },
        data: { lastSeenAt: new Date() },
      });
      await setWorkerCookie(response, challenge.workerId);
    }

    await markTelegramLoginChallengeUsed(challenge.id);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
