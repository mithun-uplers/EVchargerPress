import { notFound } from "next/navigation";
import { UserDetailView } from "@/components/admin/UserDetailView";
import { getCurrentUser } from "@/lib/supabase/server";
import { serviceConfigured } from "@/lib/supabase/service";
import { BookingError } from "@/server/bookings";
import { getUser, requireAdmin, userAudit } from "@/server/admin";

export const metadata = { title: "Manage user" };

export default async function AdminUserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/users/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [sp, me] = await Promise.all([searchParams, getCurrentUser()]);
  const u = await getUser(id).catch((e) => {
    if (e instanceof BookingError && e.code === "not_found") return null;
    throw e;
  });
  if (!u) notFound();
  const audit = await userAudit(id);
  return <UserDetailView u={u} audit={audit} isSelf={me?.id === id} canManageAccounts={serviceConfigured()} sp={sp} />;
}
