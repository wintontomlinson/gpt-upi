import { fail } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST() {
  return fail("Guard feature has been discontinued.", 410);
}

export async function PATCH() {
  return fail("Guard feature has been discontinued.", 410);
}
