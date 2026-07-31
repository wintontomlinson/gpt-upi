import { requireWorkerSession } from "@/lib/server/auth";
import { markOrderProblem } from "@/lib/server/orders";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { serializeWorkerOrder } from "@/lib/server/serializers";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const worker = await requireWorkerSession();
    const { orderId } = await context.params;
    const body = await request.json();
    const reason = String(body.reason || "").trim() || "UPI QR code cannot be generated or processed. Please replace session token and resubmit.";
    const order = await markOrderProblem({ orderId, workerId: worker.id, reason });
    return ok(serializeWorkerOrder(order));
  } catch (error) {
    if (error instanceof Response) return fail("Unauthorized", 401);
    const message = error instanceof Error ? error.message : "Failed to mark as problem";
    if (message.includes("order") || message.includes("self")) return fail(message);
    return handleRouteError(error);
  }
}
