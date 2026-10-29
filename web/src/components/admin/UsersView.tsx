import Link from "next/link";
import { confirmEmailAction, setAdminAction, setUserStatusAction } from "@/app/admin/actions";
import { AdminHeader, Empty, Flash, Pager, Pill, TableCard, td, th } from "@/components/admin/AdminUI";
import { formatLocal } from "@/lib/format";
import { ui } from "@/lib/ui";
import type { AdminUser } from "@/server/admin";

const date = (v: string | null) => (v ? formatLocal(v, "Asia/Kolkata", { day: "numeric", month: "short", year: "numeric" }) : "—");

export function UsersView({ rows, q, page, size, meId, sp }: { rows: AdminUser[]; q: string | null; page: number; size: number; meId: string | null; sp: Record<string, string | string[] | undefined> }) {
  const total = rows[0]?.total ?? 0;
  const link = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    const str = s.toString();
    return `/admin/users${str ? `?${str}` : ""}`;
  };
  const back = link(page);
  return (
    <div className="space-y-4">
      <AdminHeader
        title="Users"
        subtitle="Add accounts, edit details, grant admin access, suspend or activate."
        actions={<Link href="/admin/users/new" className={ui.btn}>Add a user</Link>}
      />
      <Flash sp={sp} />
      <form className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search users</label>
        <input id="q" name="q" defaultValue={q ?? ""} placeholder="Email or name" className={`${ui.input} mt-0`} />
        <button className={ui.btnLight}>Search</button>
      </form>
      {rows.length === 0 ? (
        <Empty>No users match.</Empty>
      ) : (
        <TableCard caption="Users">
          <thead className="border-b border-zinc-100 dark:border-zinc-800">
            <tr><th className={th}>User</th><th className={th}>Joined</th><th className={th}>Activity</th><th className={th}>Access</th><th className={th}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((u) => {
              const self = u.id === meId;
              return (
                <tr key={u.id}>
                  <td className={`${td} min-w-[13rem]`}>
                    <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">{u.display_name || "—"}</Link>{self && <span className="text-zinc-500"> (you)</span>}
                    <span className="block break-all text-xs text-zinc-500">{u.email}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap text-xs`}>
                    {date(u.created_at)}
                    <span className="block text-zinc-500">last sign-in {date(u.last_sign_in_at)}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap text-xs`}>{u.bookings} bookings · {u.vehicles} vehicles · {u.sessions} sessions</td>
                  <td className={`${td} space-x-1 space-y-1`}>
                    {u.is_admin && <Pill tone="blue">Admin</Pill>}
                    {!u.email_confirmed && <Pill tone="amber">Email not confirmed</Pill>}
                    {u.status === "active" ? <Pill tone="green">Active</Pill> : u.status === "suspended" ? <Pill tone="red">Suspended</Pill> : <Pill tone="amber">Deletion requested</Pill>}
                  </td>
                  <td className={`${td} text-right`}>
                    <div className="flex flex-wrap justify-end gap-x-3">
                      {!u.email_confirmed && (
                        <form action={confirmEmailAction}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="back" value={back} />
                          <button className="min-h-10 text-sm font-semibold text-amber-700 hover:underline dark:text-amber-300">Allow sign-in</button>
                        </form>
                      )}
                      <Link href={`/admin/users/${u.id}`} className="inline-flex min-h-10 items-center text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-200">Edit</Link>
                      {!self && !u.is_admin && (
                        <Link href={`/admin/users/${u.id}#delete`} className="inline-flex min-h-10 items-center text-sm font-medium text-rose-600 hover:underline dark:text-rose-400">Delete…</Link>
                      )}
                      {u.status === "active" && (
                        <form action={setAdminAction}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="admin" value={u.is_admin ? "false" : "true"} />
                          <input type="hidden" name="back" value={back} />
                          <button className="min-h-10 text-sm font-medium text-energy-700 hover:underline dark:text-energy-400">{u.is_admin ? "Remove admin" : "Make admin"}</button>
                        </form>
                      )}
                      {!self && !u.is_admin && u.status === "active" && (
                        <details className="text-left">
                          <summary className="min-h-10 cursor-pointer list-none py-2 text-sm font-medium text-rose-600 hover:underline [&::-webkit-details-marker]:hidden">Suspend…</summary>
                          <form action={setUserStatusAction} className="mt-1 w-64 space-y-2 rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="status" value="suspended" />
                            <input type="hidden" name="back" value={back} />
                            <label className="block text-xs font-medium">Reason (kept in the audit log)
                              <input name="reason" required maxLength={300} className={ui.input} />
                            </label>
                            <p className="text-xs text-zinc-500">Their upcoming bookings are cancelled without a fee. They can’t book, check in or review until reactivated.</p>
                            <button className="min-h-10 w-full rounded-xl bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700">Suspend account</button>
                          </form>
                        </details>
                      )}
                      {u.status === "suspended" && (
                        <form action={setUserStatusAction}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="status" value="active" />
                          <input type="hidden" name="back" value={back} />
                          <button className="min-h-10 text-sm font-medium text-energy-700 hover:underline dark:text-energy-400">Activate</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}
      <Pager page={page} size={size} total={total} href={link} />
    </div>
  );
}
