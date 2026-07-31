import { requireAdminSession } from "@/lib/server/auth";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { setPublicUserPremiumStatus, type PublicUserPremiumTier } from "@/lib/server/public-user-premium";

export const runtime = "nodejs";

function parsePremiumUntil(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export async function POST(request: Request, context: { params: Promise<{ telegramUserId: string }> }) {
  try {
    const admin = await requireAdminSession();
    const { telegramUserId: rawTelegramUserId } = await context.params;
    const telegramUserId = decodeURIComponent(rawTelegramUserId || "").trim();
    if (!telegramUserId) return fail("Telegram ID is required", 400);

    const body = await request.json().catch(() => ({}));
    const enabled = Boolean(body.enabled);
    const premiumUntil = parsePremiumUntil(body.premiumUntil);
    const premiumTier: PublicUserPremiumTier = body.premiumTier === "premium_og" ? "premium_og" : "premium";
    if (premiumUntil === undefined) return fail("Premium expiry format is invalid", 400);
    if (enabled && premiumUntil && new Date(premiumUntil).getTime() <= Date.now()) {
      return fail("Premium expiry must be later than current time", 400);
    }

    const status = await setPublicUserPremiumStatus({
      telegramUserId,
      enabled,
      premiumUntil: enabled ? premiumUntil : null,
      premiumTier: enabled ? premiumTier : "none",
      updatedBy: admin.username,
    });

    return ok(status);
  } catch (error) {
    if (error instanceof Response) return fail("Admin not authenticated", 401);
    return handleRouteError(error);
  }
}
