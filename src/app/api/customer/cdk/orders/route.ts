import { fail } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST() {
  return fail("UPI Scanner is discontinued. Please go to /.", 410);
}
