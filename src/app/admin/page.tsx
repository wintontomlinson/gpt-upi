import { redirect } from "next/navigation";
import { AdminDashboardClient } from "@/components/app/admin-client";
import { getAdminSession } from "@/lib/server/auth";

export default async function AdminPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return <AdminDashboardClient />;
}
