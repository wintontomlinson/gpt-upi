import { requireWorkerSession } from "@/lib/server/auth";
import { acceptOrder } from "@/lib/server/orders";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { serializeWorkerOrder } from "@/lib/server/serializers";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const worker = await requireWorkerSession();
    const { orderId } = await context.params;
    const order = await acceptOrder(orderId, worker.id);
    return ok(serializeWorkerOrder(order));
  } catch (error) {
    if (error instanceof Response) return fail("Unauthorized", 401);
    const message = error instanceof Error ? error.message : "Failed to accept order";
    if (message.includes("order") || message.includes("accept") || message.includes("online")) return fail(message);
    return handleRouteError(error);
  }
}
