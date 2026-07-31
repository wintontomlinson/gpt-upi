import { Prisma } from "@prisma/client";
import { getPublicUserSession } from "@/lib/server/auth";
import { getPublicUserPremiumPurchaseInfo, getPublicUserPremiumTrialStatus } from "@/lib/server/public-user-premium";
import { getPublicUserSettings } from "@/lib/server/public-user-settings";
import { getPublicUpiExtractUserActiveJobs, getPublicUpiExtractUserHistory } from "@/lib/server/public-upi-extract-queue";
import { prisma } from "@/lib/server/prisma";
import {
  getLatestPublicUserDepositOrder,
  getPublicUnifiedDepositInfo,
  getPublicUserWalletHistory,
  redeemRechargeCdk,
} from "@/lib/server/public-user-wallet";
import { fail, handleRouteError, ok } from "@/lib/server/responses";

export const runtime = "nodejs";

const CDK_REDEEM_RATE_LIMIT_WINDOW_MS = 60_000;
const CDK_REDEEM_RATE_LIMIT_COUNT = 5;

async function getPremiumInfo(user: NonNullable<Awaited<ReturnType<typeof getPublicUserSession>>>) {
  const [trial, purchase] = await Promise.all([
    getPublicUserPremiumTrialStatus({
      telegramUserId: user.telegramUserId,
      isPremium: user.isPremium,
    }),
    getPublicUserPremiumPurchaseInfo(),
  ]);
  return {
    purchasePrice: purchase.purchasePrice,
    saleEnabled: purchase.saleEnabled,
    trialHours: trial.hours,
    trialClaimed: trial.claimed,
    trialAvailable: trial.available,
    trialClaimedAt: trial.claimedAt,
    trialPremiumUntil: trial.premiumUntil,
  };
}

async function assertCdkRedeemRateLimit(telegramUserId: string) {
  const key = `public_cdk_redeem_rate:${telegramUserId}`;
  const now = Date.now();
  const cutoff = now - CDK_REDEEM_RATE_LIMIT_WINDOW_MS;

  await prisma.$transaction(
    async (tx) => {
      await tx.systemSetting.upsert({
        where: { key },
        update: {},
        create: { key, value: "[]" },
      });
      const rows = await tx.$queryRaw<Array<{ value: string }>>`
        SELECT "value"
        FROM "system_settings"
        WHERE "key" = ${key}
        FOR UPDATE
      `;
      const raw = rows[0]?.value || "[]";
      let timestamps: number[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          timestamps = parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item));
        }
      } catch {
        timestamps = [];
      }

      const recent = timestamps.filter((item) => item >= cutoff);
      if (recent.length >= CDK_REDEEM_RATE_LIMIT_COUNT) {
        throw new Error("CDK redeem rate limited. Please try again in 1 minute.");
      }
      recent.push(now);

      await tx.systemSetting.update({
        where: { key },
        data: { value: JSON.stringify(recent.slice(-CDK_REDEEM_RATE_LIMIT_COUNT)) },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function POST(request: Request) {
  try {
    const user = await getPublicUserSession();
    if (!user) return fail("Please login first.", 401);

    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    await assertCdkRedeemRateLimit(user.telegramUserId);
    const redeem = await redeemRechargeCdk(user, { code: body.code });
    const [history, activeJobs, settings, depositOrder, walletHistory, premium] = await Promise.all([
      getPublicUpiExtractUserHistory(user.telegramUserId),
      getPublicUpiExtractUserActiveJobs(user.telegramUserId),
      getPublicUserSettings(user.telegramUserId),
      getLatestPublicUserDepositOrder(user),
      getPublicUserWalletHistory(user),
      getPremiumInfo(user),
    ]);

    return ok({
      redeem,
      user,
      history,
      activeJobs,
      settings,
      wallet: redeem.wallet,
      deposit: getPublicUnifiedDepositInfo(),
      depositOrder,
      walletHistory,
      premium,
    });
  } catch (error) {
    if (error instanceof Response) return fail("Please login first.", 401);
    const message = error instanceof Error ? error.message : "CDK redeem failed";
    if (message.includes("CDK") || message.includes("redeem") || message.includes("rate limit")) return fail(message);
    return handleRouteError(error);
  }
}
