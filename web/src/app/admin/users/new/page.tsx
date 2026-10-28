import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminUI";
import { CreateUserForm } from "@/components/admin/UserForms";
import { serviceConfigured } from "@/lib/supabase/service";
import { ui } from "@/lib/ui";
import { requireAdmin } from "@/server/admin";

export const metadata = { title: "Add a user" };

export default async function NewUserPage() {
  await requireAdmin("/admin/users/new");
  const ready = serviceConfigured();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <AdminHeader title="Add a user" subtitle="Create a confirmed account for a driver or another admin." actions={<Link href="/admin/users" className={ui.btnLight}>All users</Link>} />
      {!ready && (
        <p className={ui.error}>
          Adding users needs <code>SUPABASE_SERVICE_ROLE_KEY</code> in the server environment (.env.local and your host). See docs/ADMIN.md.
        </p>
      )}
      <CreateUserForm disabled={!ready} />
    </div>
  );
}
