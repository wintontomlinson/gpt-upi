import { requireAdminSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { getWorkerWalletSummary, parseMoneyAmount } from "@/lib/server/wallet";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ workerId: string }> }) {
  try {
    const admin = await requireAdminSession();
    const { workerId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const amount = parseMoneyAmount(body.amount);
    const note = String(body.note || "").trim();
    if (!amount) return fail("Please enter a valid advance amount");

    const worker = await prisma.worker.findUnique({ where: { id: workerId }, select: { id: true } });
    if (!worker) return fail("Worker account not found", 404);

    await prisma.workerWalletLedger.create({
      data: {
        workerId,
        type: "ADMIN_ADVANCE",
        amount: (-Number(amount)).toFixed(2),
        note: note || "Admin advance payment",
        createdBy: admin.username,
      },
    });
    await prisma.worker.update({ where: { id: workerId }, data: { payoutMode: "PREPAID" } });

    return ok(await getWorkerWalletSummary(workerId));
  } catch (error) {
    if (error instanceof Response) return fail("Admin not authenticated", 401);
    return handleRouteError(error);
  }
}
