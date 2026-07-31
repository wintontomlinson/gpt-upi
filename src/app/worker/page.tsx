import { redirect } from "next/navigation";
import { WorkerClient } from "@/components/app/worker-client";
import { getWorkerSession } from "@/lib/server/auth";

export default async function WorkerPage() {
  const worker = await getWorkerSession();
  if (!worker) redirect("/worker/login");
  return <WorkerClient />;
}
