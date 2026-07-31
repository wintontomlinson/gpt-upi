import { fail } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST() {
  return fail("Customers cannot confirm order completion. Please wait for the worker to process", 403);
}

