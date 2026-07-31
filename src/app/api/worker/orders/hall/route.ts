import { requireWorkerSession } from "@/lib/server/auth";
import { expireStaleOrders, orderInclude } from "@/lib/server/orders";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { serializeWorkerOrder } from "@/lib/server/serializers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const worker = await requireWorkerSession();
    const current = await prisma.worker.findUnique({ where: { id: worker.id } });
    if (!current) return fail("Worker not found", 404);
    if (current.status !== "ONLINE") return ok({ orders: [], gated: true, message: "Go online to view the order hall" });

    await expireStaleOrders();

    const orders = await prisma.order.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: orderInclude,
    });
    return ok({ orders: orders.map(serializeWorkerOrder), gated: false });
  } catch (error) {
    if (error instanceof Response) return fail("Unauthorized", 401);
    return handleRouteError(error);
  }
}
