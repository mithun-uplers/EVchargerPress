import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · EVChargePress" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-energy-700 dark:text-energy-400">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-energy-500" />
        EVChargePress admin
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
