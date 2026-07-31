import { requireAdminSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { serializeWorker } from "@/lib/server/serializers";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ workerId: string }> }) {
  try {
    await requireAdminSession();
    const { workerId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const disabled = Boolean(body.disabled);
    if (disabled) {
      const active = await prisma.workerActiveOrder.findFirst({
        where: { workerId },
        select: { order: { select: { orderNo: true } } },
      });
      if (active) return fail(`This worker has an active order ${active.order.orderNo}. Complete or release it before disabling`);
    }

    const updated = await prisma.worker.update({
      where: { id: workerId },
      data: disabled
        ? { isDisabled: true, status: "OFFLINE", autoAcceptEnabled: false, lastSeenAt: new Date() }
        : { isDisabled: false },
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
