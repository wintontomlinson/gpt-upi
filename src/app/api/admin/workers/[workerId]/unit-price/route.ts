import { requireAdminSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { serializeWorker } from "@/lib/server/serializers";

export const runtime = "nodejs";

function parseUnitPrice(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount.toFixed(2);
}

export async function POST(request: Request, context: { params: Promise<{ workerId: string }> }) {
  try {
    await requireAdminSession();
    const { workerId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const unitPrice = parseUnitPrice(body.unitPrice);
    if (unitPrice === null) return fail("Unit price must be a number >= 0");

    const updated = await prisma.worker.update({
      where: { id: workerId },
      data: { unitPrice },
      select: {
        id: true,
        username: true,
        displayName: true,
        unitPrice: true,
        payoutMode: true,
        binanceUserId: true,
        telegramUserId: true,
        telegramUsername: true,
        status: true,
        isDisabled: true,
        autoAcceptEnabled: true,
        autoAcceptNotifyEnabled: true,
        newOrderSoundEnabled: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    return ok(serializeWorker(updated));
  } catch (error) {
    if (error instanceof Response) return fail("Admin not authenticated", 401);
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") return fail("Worker account not found", 404);
    return handleRouteError(error);
  }
}
