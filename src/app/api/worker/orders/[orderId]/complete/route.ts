import { requireWorkerSession } from "@/lib/server/auth";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { serializeWorkerOrder } from "@/lib/server/serializers";
import { runWorkerSubscriptionCheck } from "@/lib/server/subscription-checks";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const worker = await requireWorkerSession();
    const { orderId } = await context.params;
    const result = await runWorkerSubscriptionCheck({ orderId, workerId: worker.id });

    return ok({
      ...result,
      order: serializeWorkerOrder(result.order),
    });
  } catch (error) {
    if (error instanceof Response) return fail("Unauthorized", 401);
    const message = error instanceof Error ? error.message : "Complete failed";
    if (
      message.includes("order") ||
      message.includes("self") ||
      message.includes("status") ||
      message.includes("UPI") ||
      message.includes("QR code") ||
      message.includes("expired") ||
      message.includes("generate") ||
      message.includes("subscription") ||
      message.includes("check") ||
      message.includes("session") ||
      message.toLowerCase().includes("order") ||
      message.toLowerCase().includes("subscription") ||
      message.toLowerCase().includes("session")
    ) return fail(message);
    return handleRouteError(error);
  }
}
