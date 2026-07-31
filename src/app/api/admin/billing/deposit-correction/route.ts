import { Prisma, PublicUserWalletLedgerType } from "@prisma/client";
import { requireAdminSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { decimalToNumber } from "@/lib/server/serializers";

export const runtime = "nodejs";

type DbLike = typeof prisma | Prisma.TransactionClient;

class CorrectionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function money(value: unknown) {
  const amount = decimalToNumber(value as never);
  return Number(amount.toFixed(6));
}

function decimal(value: unknown) {
  return new Prisma.Decimal(String(value ?? 0));
}

function normalizeTxHash(value: unknown) {
  const txHash = String(value || "").trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new CorrectionError("Please enter a valid transaction hash");
  return txHash;
}

function normalizeLogIndex(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) throw new CorrectionError("logIndex must be a non-negative integer");
  return index;
}

function normalizeTarget(value: unknown) {
  const target = String(value || "").trim().replace(/^@+/, "");
  if (!target) throw new CorrectionError("Please enter the correct target user's Telegram ID or username");
  return target;
}

function shortHash(value?: string | null) {
  if (!value) return "-";
  return value.length > 22 ? `${value.slice(0, 12)}...${value.slice(-8)}` : value;
}

async function findChainDeposit(db: DbLike, txHash: string, logIndex: number | null) {
  const rows = await db.publicChainDeposit.findMany({
    where: {
      txHash: { equals: txHash, mode: "insensitive" },
      ...(logIndex !== null ? { logIndex } : {}),
    },
    orderBy: { logIndex: "asc" },
  });
  if (rows.length === 0) throw new CorrectionError("On-chain deposit record not found. Please confirm the transaction has been scanned.", 404);
  if (rows.length > 1) throw new CorrectionError("This transaction contains multiple deposit logs. Please specify logIndex to preview.", 400);
  return rows[0];
}

async function findTargetWallet(db: DbLike, target: string) {
  const wallet = await db.publicUserWallet.findFirst({
    where: {
      OR: [
        { telegramUserId: target },
        { telegramUsername: { equals: target, mode: "insensitive" } },
      ],
    },
  });
  if (!wallet) throw new CorrectionError("Target user wallet not found. Please confirm the user has logged in.", 404);
  return wallet;
}

async function buildCorrectionContext(input: {
  txHash: string;
  logIndex: number | null;
  target: string;
  targetOrderId?: string | null;
}, db: DbLike = prisma) {
  const chainDeposit = await findChainDeposit(db, input.txHash, input.logIndex);
  const targetWallet = await findTargetWallet(db, input.target);
  const currentWallet = await db.publicUserWallet.findUnique({
    where: { telegramUserId: chainDeposit.telegramUserId },
  });
  if (!currentWallet) throw new CorrectionError("Current credited user's wallet does not exist. Cannot auto-correct.", 400);

  const currentOrder = await db.publicUserDepositOrder.findFirst({
    where: {
      txHash: { equals: chainDeposit.txHash, mode: "insensitive" },
      logIndex: chainDeposit.logIndex,
    },
  });
  const currentLedger = await db.publicUserWalletLedger.findFirst({
    where: {
      type: PublicUserWalletLedgerType.CHAIN_DEPOSIT,
      OR: [
        ...(currentOrder ? [{ referenceId: `pub_deposit_order:${currentOrder.id}` }] : []),
        { referenceId: `${chainDeposit.txHash}:${chainDeposit.logIndex}` },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const amount = decimal(chainDeposit.amount);
  const paidAt = currentOrder?.paidAt || chainDeposit.creditedAt || chainDeposit.createdAt;
  const candidateOrders = await db.publicUserDepositOrder.findMany({
    where: {
      walletId: targetWallet.id,
      depositAddress: chainDeposit.toAddress,
      createdAt: { lte: paidAt },
      expiresAt: { gte: paidAt },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const selectedTargetOrder = input.targetOrderId
    ? await db.publicUserDepositOrder.findUnique({ where: { id: input.targetOrderId } })
    : null;

  const warnings: string[] = [];
  const errors: string[] = [];
  if (currentWallet.telegramUserId === targetWallet.telegramUserId) errors.push("This deposit already belongs to the target user. No correction needed.");
  if (amount.lte(0)) errors.push("On-chain deposit amount is invalid.");
  if (decimal(currentWallet.availableBalance).lt(amount)) errors.push(`Current incorrect user's available balance is insufficient to deduct ${money(amount)} USDT.`);
  if (decimal(currentWallet.totalDeposited).lt(amount)) errors.push(`Current incorrect user's total deposited is insufficient to deduct ${money(amount)} USDT.`);
  if (!currentLedger) errors.push("Wallet ledger entry for this deposit not found. Cannot auto-correct.");
  if (selectedTargetOrder) {
    if (selectedTargetOrder.walletId !== targetWallet.id) errors.push("Selected target deposit order does not belong to the target user.");
    if (selectedTargetOrder.depositAddress !== chainDeposit.toAddress) errors.push("Selected target deposit order address does not match the on-chain deposit address.");
    if (selectedTargetOrder.status === "PAID" && selectedTargetOrder.txHash !== chainDeposit.txHash) {
      errors.push("Selected target deposit order has already been paid by another transaction and cannot be bound again.");
    }
    if (selectedTargetOrder.createdAt.getTime() > paidAt.getTime() || selectedTargetOrder.expiresAt.getTime() < paidAt.getTime()) {
      warnings.push("Selected target deposit order is not within the payment time window for this transaction. Please confirm before executing.");
    }
  }
  if (currentOrder && currentOrder.status !== "PAID") warnings.push(`Current bound deposit order status is ${currentOrder.status}. Executing will still clear the tx binding.`);
  if (candidateOrders.length === 0) warnings.push("No target deposit orders found within the payment time window. Will only credit balance to target user by tx.");

  const bindableCandidate = candidateOrders.find((item) => item.status !== "PAID" || item.txHash === chainDeposit.txHash);
  const ledgerReference = selectedTargetOrder ? `pub_deposit_order:${selectedTargetOrder.id}` : `${chainDeposit.txHash}:${chainDeposit.logIndex}`;

  return {
    chainDeposit,
    currentWallet,
    currentOrder,
    currentLedger,
    targetWallet,
    candidateOrders,
    selectedTargetOrder,
    amount,
    paidAt,
    preview: {
      tx: {
        txHash: chainDeposit.txHash,
        logIndex: chainDeposit.logIndex,
        amount: money(chainDeposit.amount),
        fromAddress: chainDeposit.fromAddress,
        toAddress: chainDeposit.toAddress,
        blockNumber: chainDeposit.blockNumber,
        confirmations: chainDeposit.confirmations,
        creditedAt: chainDeposit.creditedAt,
      },
      current: {
        telegramUserId: currentWallet.telegramUserId,
        telegramUsername: currentWallet.telegramUsername || chainDeposit.telegramUsername || null,
        walletId: currentWallet.id,
        availableBalance: money(currentWallet.availableBalance),
        totalDeposited: money(currentWallet.totalDeposited),
        order: currentOrder ? {
          id: currentOrder.id,
          orderNo: currentOrder.orderNo,
          status: currentOrder.status,
          payAmount: money(currentOrder.payAmount),
          txHash: currentOrder.txHash,
          logIndex: currentOrder.logIndex,
        } : null,
        ledger: currentLedger ? {
          id: currentLedger.id,
          referenceId: currentLedger.referenceId,
          availableDelta: money(currentLedger.availableDelta),
        } : null,
      },
      target: {
        telegramUserId: targetWallet.telegramUserId,
        telegramUsername: targetWallet.telegramUsername,
        walletId: targetWallet.id,
        availableBalance: money(targetWallet.availableBalance),
        totalDeposited: money(targetWallet.totalDeposited),
      },
      candidateOrders: candidateOrders.map((item) => ({
        id: item.id,
        orderNo: item.orderNo,
        status: item.status,
        baseAmount: money(item.baseAmount),
        payAmount: money(item.payAmount),
        txHash: item.txHash,
        logIndex: item.logIndex,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        paidAt: item.paidAt,
        canBind: item.status !== "PAID" || item.txHash === chainDeposit.txHash,
      })),
      selectedTargetOrderId: selectedTargetOrder?.id || null,
      recommendedTargetOrderId: bindableCandidate?.id || null,
      plan: {
        amount: money(amount),
        debit: {
          telegramUserId: currentWallet.telegramUserId,
          beforeAvailable: money(currentWallet.availableBalance),
          afterAvailable: money(decimal(currentWallet.availableBalance).minus(amount)),
          beforeTotalDeposited: money(currentWallet.totalDeposited),
          afterTotalDeposited: money(decimal(currentWallet.totalDeposited).minus(amount)),
        },
        credit: {
          telegramUserId: targetWallet.telegramUserId,
          beforeAvailable: money(targetWallet.availableBalance),
          afterAvailable: money(decimal(targetWallet.availableBalance).plus(amount)),
          beforeTotalDeposited: money(targetWallet.totalDeposited),
          afterTotalDeposited: money(decimal(targetWallet.totalDeposited).plus(amount)),
        },
        wrongOrderAction: currentOrder ? `Deposit order ${currentOrder.orderNo} will be set to EXPIRED and ${shortHash(chainDeposit.txHash)} binding cleared.` : "No currently bound deposit order found.",
        targetOrderAction: selectedTargetOrder
          ? `Target deposit order ${selectedTargetOrder.orderNo} will be marked as PAID and bound to this tx.`
          : "No target deposit order will be bound. Only crediting balance to target user by tx.",
        chainDepositAction: "On-chain deposit record will be reassigned to target user.",
        ledgerAction: `Wallet ledger entry will be migrated to target user, reference changed to ${ledgerReference}.`,
        canExecute: errors.length === 0,
        errors,
        warnings,
      },
    },
  };
}

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const url = new URL(request.url);
    const context = await buildCorrectionContext({
      txHash: normalizeTxHash(url.searchParams.get("txHash")),
      logIndex: normalizeLogIndex(url.searchParams.get("logIndex")),
      target: normalizeTarget(url.searchParams.get("target")),
      targetOrderId: url.searchParams.get("targetOrderId")?.trim() || null,
    });
    return ok(context.preview);
  } catch (error) {
    if (error instanceof Response) return fail("Admin not authenticated", 401);
    if (error instanceof CorrectionError) return fail(error.message, error.status);
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const body = await request.json().catch(() => ({}));
    if (String(body.confirmText || "").trim() !== "CONFIRM") {
      return fail("Please enter CONFIRM before executing deposit correction.", 400);
    }
    const txHash = normalizeTxHash(body.txHash);
    const logIndex = normalizeLogIndex(body.logIndex);
    const target = normalizeTarget(body.target);
    const targetOrderId = String(body.targetOrderId || "").trim() || null;
    const adminNote = String(body.adminNote || "").trim();

    const result = await prisma.$transaction(async (tx) => {
      const context = await buildCorrectionContext({ txHash, logIndex, target, targetOrderId }, tx);
      const { chainDeposit, currentWallet, currentOrder, currentLedger, targetWallet, selectedTargetOrder, amount } = context;
      if (!context.preview.plan.canExecute) throw new CorrectionError(context.preview.plan.errors.join("; ") || "Cannot execute correction in current state.", 400);
      if (!currentLedger) throw new CorrectionError("Corresponding wallet ledger entry not found.", 400);

      if (currentOrder) {
        await tx.publicUserDepositOrder.update({
          where: { id: currentOrder.id },
          data: {
            status: "EXPIRED",
            txHash: null,
            logIndex: null,
            fromAddress: null,
            blockNumber: null,
            confirmations: null,
            paidAt: null,
          },
        });
      }

      if (selectedTargetOrder) {
        await tx.publicUserDepositOrder.update({
          where: { id: selectedTargetOrder.id },
          data: {
            status: "PAID",
            payAmount: amount,
            txHash: chainDeposit.txHash,
            logIndex: chainDeposit.logIndex,
            fromAddress: chainDeposit.fromAddress,
            blockNumber: chainDeposit.blockNumber,
            confirmations: chainDeposit.confirmations,
            paidAt: currentOrder?.paidAt || chainDeposit.creditedAt || chainDeposit.createdAt,
          },
        });
      }

      await tx.publicChainDeposit.update({
        where: { txHash_logIndex: { txHash: chainDeposit.txHash, logIndex: chainDeposit.logIndex } },
        data: {
          telegramUserId: targetWallet.telegramUserId,
          telegramUsername: targetWallet.telegramUsername || null,
        },
      });

      const referenceId = selectedTargetOrder ? `pub_deposit_order:${selectedTargetOrder.id}` : `${chainDeposit.txHash}:${chainDeposit.logIndex}`;
      await tx.publicUserWalletLedger.update({
        where: { id: currentLedger.id },
        data: {
          walletId: targetWallet.id,
          telegramUserId: targetWallet.telegramUserId,
          referenceId,
          note: adminNote || `Deposit correction: reassigned from ${currentWallet.telegramUsername ? `@${currentWallet.telegramUsername}` : currentWallet.telegramUserId} to ${targetWallet.telegramUsername ? `@${targetWallet.telegramUsername}` : targetWallet.telegramUserId}, tx ${shortHash(chainDeposit.txHash)}`,
        },
      });

      await tx.publicUserWallet.update({
        where: { id: currentWallet.id },
        data: {
          availableBalance: { decrement: amount },
          totalDeposited: { decrement: amount },
        },
      });
      await tx.publicUserWallet.update({
        where: { id: targetWallet.id },
        data: {
          telegramUsername: targetWallet.telegramUsername || null,
          availableBalance: { increment: amount },
          totalDeposited: { increment: amount },
        },
      });

      return buildCorrectionContext({ txHash: chainDeposit.txHash, logIndex: chainDeposit.logIndex, target: targetWallet.telegramUserId }, tx).then((next) => next.preview);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000, maxWait: 10_000 });

    return ok(result);
  } catch (error) {
    if (error instanceof Response) return fail("Admin not authenticated", 401);
    if (error instanceof CorrectionError) return fail(error.message, error.status);
    return handleRouteError(error);
  }
}

