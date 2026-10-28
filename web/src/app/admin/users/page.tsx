import { one, pageOf } from "@/components/admin/AdminUI";
import { UsersView } from "@/components/admin/UsersView";
import { getCurrentUser } from "@/lib/supabase/server";
import { listUsers, requireAdmin } from "@/server/admin";

export const metadata = { title: "Users" };
const SIZE = 25;

export default async function AdminUsers({ searchParams }: PageProps<"/admin/users">) {
  await requireAdmin("/admin/users");
  const [me, sp] = await Promise.all([getCurrentUser(), searchParams]);
  const q = one(sp, "q");
  const page = pageOf(sp);
  const rows = await listUsers(q, page, SIZE);
  return <UsersView rows={rows} q={q} page={page} size={SIZE} meId={me?.id ?? null} sp={sp} />;
}
