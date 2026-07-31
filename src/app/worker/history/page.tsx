import { redirect } from "next/navigation";
import { WorkerHistoryClient } from "@/components/app/worker-history-client";
import { getWorkerSession } from "@/lib/server/auth";

export default async function WorkerHistoryPage() {
  const worker = await getWorkerSession();
  if (!worker) redirect("/worker/login");
  return <WorkerHistoryClient />;
}
