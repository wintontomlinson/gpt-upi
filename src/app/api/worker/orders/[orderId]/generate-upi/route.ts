import { Prisma } from "@prisma/client";
import { requireWorkerSession } from "@/lib/server/auth";
import { EmailBoundError, extractUpiQrFromCredential } from "@/lib/server/chatgpt-upi";
import { decryptSessionCredential } from "@/lib/server/credential-vault";
import { orderInclude } from "@/lib/server/orders";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { serializeWorkerOrder } from "@/lib/server/serializers";
import { saveGeneratedQrPng } from "@/lib/server/upload";

export const runtime = "nodejs";
const GENERATED_QR_TTL_MS = 5 * 60 * 1000;

export async function POST(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const worker = await requireWorkerSession().catch(() => null);
  if (!worker) return fail("Unauthorized", 401);

  const { orderId } = await context.params;
  let encryptedCredential = "";

  try {
    const prepared = await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            status: "ASSIGNED",
            assignedWorkerId: worker.id,
          },
          select: {
            id: true,
            source: true,
            sessionCredentialEncrypted: true,
            upiExtractionStatus: true,
          },
        });

        if (!order) return { type: "notFound" as const };
        if (order.source === "PUBLIC_SCAN") return { type: "publicScan" as const };
        if (!order.sessionCredentialEncrypted) return { type: "missingCredential" as const };
        if (order.upiExtractionStatus === "GENERATING") return { type: "generating" as const };

        await tx.order.update({
          where: { id: order.id },
          data: {
            qrImageUrl: "",
            qrDecodedText: null,
            qrIsUpi: null,
            upiExtractionStatus: "GENERATING",
            upiExtractError: null,
            upiExtractedAt: null,
            upiExpiresAt: null,
            subscriptionCheckStatus: "IDLE",
            subscriptionCheckRounds: 0,
            subscriptionCheckAttemptCount: 0,
            subscriptionCheckLastPlan: null,
            subscriptionCheckLastError: null,
            subscriptionCheckedAt: null,
          },
        });

        return { type: "ok" as const, encryptedCredential: order.sessionCredentialEncrypted };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (prepared.type === "notFound") return fail("Order not found or does not belong to current worker", 404);
    if (prepared.type === "publicScan") return fail("This order's QR code was published by the user. Worker does not need to regenerate.");
    if (prepared.type === "missingCredential") return fail("This order has no session token available for extraction");
    if (prepared.type === "generating") return fail("UPI QR code is being generated. Please refresh later");
    encryptedCredential = prepared.encryptedCredential;
  } catch (error) {
    return handleRouteError(error);
  }

  try {
    const credential = decryptSessionCredential(encryptedCredential);
    const extracted = await extractUpiQrFromCredential(credential, { maxProxyAttempts: 2 });
    const qrImageUrl = await saveGeneratedQrPng(extracted.qrPngBuffer);
    const upiExpiresAt = new Date(Date.now() + GENERATED_QR_TTL_MS);

    const updated = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: "ASSIGNED",
        assignedWorkerId: worker.id,
        upiExtractionStatus: "GENERATING",
      },
      data: {
        qrImageUrl,
        qrVersion: { increment: 1 },
        qrDecodedText: extracted.upiUri,
        qrIsUpi: true,
        upiExtractionStatus: "READY",
        upiExtractError: null,
        upiExtractedAt: new Date(),
        upiExpiresAt,
      },
    });
    if (updated.count !== 1) {
      return fail("Order status has changed. Please refresh and retry", 409);
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });
    if (!order) return fail("Order not found", 404);

    return ok(serializeWorkerOrder(order));
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPI QR code generation failed";
    await prisma.order.updateMany({
      where: {
        id: orderId,
        status: "ASSIGNED",
        assignedWorkerId: worker.id,
        upiExtractionStatus: "GENERATING",
      },
      data: {
        upiExtractionStatus: "FAILED",
        upiExtractError: message,
      },
    });

    if (error instanceof EmailBoundError) return fail(error.message, 403);
    if (
      message.includes("UPI") ||
      message.includes("upi://") ||
      message.includes("Stripe") ||
      message.includes("checkout") ||
      message.includes("session") ||
      message.includes("Cloudflare") ||
      message.includes("protocol response") ||
      message.includes("QR code")
    ) {
      return fail(message);
    }
    return handleRouteError(error);
  }
}
