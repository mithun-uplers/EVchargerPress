import Link from "next/link";
import { setAdminAction, setUserStatusAction } from "@/app/admin/actions";
import { AdminHeader, Flash, Pill } from "@/components/admin/AdminUI";
import { EditUserForm, SetPasswordForm } from "@/components/admin/UserForms";
import { formatLocal } from "@/lib/format";
import { ui } from "@/lib/ui";
import type { AdminUserDetail, AuditEntry } from "@/server/admin";

const when = (v: string | null) => (v ? formatLocal(v, "Asia/Kolkata", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "—");
const ACTION: Record<string, string> = {
  create_user: "Account created", change_email: "Email changed", set_password: "Password set by admin", update_profile: "Profile edited",
  grant_admin: "Made admin", revoke_admin: "Admin access removed", suspend_user: "Suspended", reactivate_user: "Reactivated",
};

export function UserDetailView({ u, audit, isSelf, canManageAccounts, sp }: {
  u: AdminUserDetail; audit: AuditEntry[]; isSelf: boolean; canManageAccounts: boolean; sp: Record<string, string | string[] | undefined>;
}) {
  const back = `/admin/users/${u.id}`;
  return (
    <div className="space-y-5">
      <AdminHeader title={u.display_name || u.email} subtitle={u.email} actions={<Link href="/admin/users" className={ui.btnLight}>All users</Link>} />
      <div className="flex flex-wrap gap-2">
        {u.is_admin && <Pill tone="blue">Admin</Pill>}
        {u.status === "active" ? <Pill tone="green">Active</Pill> : u.status === "suspended" ? <Pill tone="red">Suspended</Pill> : <Pill tone="amber">Deletion requested</Pill>}
        {!u.email_confirmed && <Pill tone="amber">Email not confirmed</Pill>}
        {u.password_change_required && <Pill tone="amber">Must choose a new password</Pill>}
        {isSelf && <Pill>This is you</Pill>}
      </div>
      <Flash sp={sp} />
      {!canManageAccounts && (
        <p className={ui.error}>Email and password changes are off: add <code>SUPABASE_SERVICE_ROLE_KEY</code> to the server environment (see docs/ADMIN.md). Name, phone, admin access and suspension still work.</p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-5">
          <section className={`${ui.card} space-y-4`} aria-labelledby="profile-h">
            <h2 id="profile-h" className="font-semibold">Profile</h2>
            <EditUserForm user={u} />
          </section>

          <section className={`${ui.card} space-y-3`} aria-labelledby="access-h">
            <h2 id="access-h" className="font-semibold">Access</h2>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 ring-1 ring-zinc-200 dark:ring-zinc-800">
              <div className="text-sm">
                <p className="font-medium">{u.is_admin ? "Admin" : "Driver"}</p>
                <p className="text-xs text-zinc-500">{u.is_admin ? "Can manage stations, bookings and every user." : "Can find, book and charge."}</p>
              </div>
              {u.status === "active" && (
                <form action={setAdminAction}>
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="admin" value={u.is_admin ? "false" : "true"} />
                  <input type="hidden" name="back" value={back} />
                  <button className={ui.btnLight}>{u.is_admin ? "Remove admin access" : "Make admin"}</button>
                </form>
              )}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl p-3 ring-1 ring-zinc-200 dark:ring-zinc-800">
              <div className="text-sm">
                <p className="font-medium">{u.status === "suspended" ? "Account suspended" : u.status === "deletion_requested" ? "Deletion requested" : "Account active"}</p>
                <p className="text-xs text-zinc-500">
                  {u.status === "suspended"
                    ? "They can sign in and see their history, but can’t book, check in or review."
                    : "Suspending cancels their upcoming bookings without a fee and stops new bookings, check-ins and reviews."}
                </p>
              </div>
              {u.status === "suspended" && (
                <form action={setUserStatusAction}>
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="status" value="active" />
                  <input type="hidden" name="back" value={back} />
                  <button className={ui.btn}>Activate account</button>
                </form>
              )}
              {u.status === "active" && !isSelf && (
                u.is_admin ? (
                  <p className="text-xs text-zinc-500">Remove admin access before suspending.</p>
                ) : (
                  <details className="w-full sm:w-auto">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-rose-600">Suspend account…</summary>
                    <form action={setUserStatusAction} className="mt-2 space-y-2 sm:w-72">
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="status" value="suspended" />
                      <input type="hidden" name="back" value={back} />
                      <label className="block text-xs font-medium">Reason (kept in the audit log)
                        <input name="reason" required maxLength={300} className={ui.input} />
                      </label>
                      {u.bookings_upcoming > 0 && <p className="text-xs text-zinc-500">{u.bookings_upcoming} upcoming booking{u.bookings_upcoming === 1 ? "" : "s"} will be cancelled.</p>}
                      <button className="min-h-11 w-full rounded-xl bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700">Suspend account</button>
                    </form>
                  </details>
                )
              )}
            </div>
          </section>

          {!isSelf && (
            <section className={`${ui.card} space-y-4`} aria-labelledby="pw-h">
              <div>
                <h2 id="pw-h" className="font-semibold">Set a new password</h2>
                <p className="mt-1 text-sm text-zinc-500">For someone locked out of their account. Their current password stops working immediately.</p>
              </div>
              <SetPasswordForm userId={u.id} disabled={!canManageAccounts} />
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className={ui.card} aria-labelledby="act-h">
            <h2 id="act-h" className="font-semibold">Activity</h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {[["Bookings", u.bookings], ["Upcoming", u.bookings_upcoming], ["Vehicles", u.vehicles], ["Sessions", u.sessions], ["Check-ins", u.checkins], ["Reviews", u.reviews]].map(([k, v]) => (
                <div key={k as string}><dt className="text-xs text-zinc-500">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
              ))}
            </dl>
            <dl className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
              <div className="flex justify-between gap-2"><dt className="text-zinc-500">Joined</dt><dd>{when(u.created_at)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-zinc-500">Last sign-in</dt><dd>{when(u.last_sign_in_at)}</dd></div>
            </dl>
          </section>
          <section className={ui.card} aria-labelledby="hist-h">
            <h2 id="hist-h" className="font-semibold">Admin history</h2>
            {audit.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No admin changes yet.</p>
            ) : (
              <ol className="mt-2 space-y-2 text-sm">
                {audit.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium">{ACTION[a.action] ?? a.action.replaceAll("_", " ")}</span>
                    {typeof a.detail.reason === "string" && <span className="text-zinc-500"> — {a.detail.reason}</span>}
                    <span className="block text-xs text-zinc-500">{when(a.created_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
