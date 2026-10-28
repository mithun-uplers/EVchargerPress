import { DashboardView } from "@/components/admin/DashboardView";
import { dashboard, requireAdmin } from "@/server/admin";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  await requireAdmin();
  return <DashboardView d={await dashboard()} />;
}
