import { redirect } from "next/navigation";
import { WorkerWithdrawalsClient } from "@/components/app/worker-withdrawals-client";
import { getWorkerSession } from "@/lib/server/auth";

export default async function WorkerWithdrawalsPage() {
  const worker = await getWorkerSession();
  if (!worker) redirect("/worker/login");
  return <WorkerWithdrawalsClient />;
}
