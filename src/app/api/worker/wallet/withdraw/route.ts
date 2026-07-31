import { requireWorkerSession } from "@/lib/server/auth";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { serializeWorkerWithdrawalRequest } from "@/lib/server/serializers";
import { createWithdrawalRequest, parseMoneyAmount } from "@/lib/server/wallet";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const worker = await requireWorkerSession();
    const body = await request.json().catch(() => ({}));
    const amount = parseMoneyAmount(body.amount);
    const note = String(body.note || "").trim();
    if (!amount) return fail("Please enter a valid withdrawal amount");

    const requestRecord = await createWithdrawalRequest({
      workerId: worker.id,
      amount,
      note: note || null,
    });
    return ok(serializeWorkerWithdrawalRequest(requestRecord));
  } catch (error) {
    if (error instanceof Response) return fail("Unauthorized", 401);
    const message = error instanceof Error ? error.message : "Withdrawal request failed";
    if (message.includes("Binance") || message.includes("balance") || message.includes("worker")) return fail(message);
    return handleRouteError(error);
  }
}
