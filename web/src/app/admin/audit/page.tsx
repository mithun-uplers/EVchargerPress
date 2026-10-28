import { AdminHeader, Chips, Empty, Pager, TableCard, one, pageOf, td, th } from "@/components/admin/AdminUI";
import { formatLocal } from "@/lib/format";
import { listAudit, namesFor, requireAdmin } from "@/server/admin";

export const metadata = { title: "Audit log" };
const SIZE = 40;
const TABLES = ["stations", "evses", "connectors", "operating_hours", "booking_rules", "tariffs", "bookings", "profiles", "user_roles", "charge_points", "checkins", "reviews"];

function summary(detail: Record<string, unknown>) {
  const entries = Object.entries(detail).filter(([k]) => !["id", "created_at", "created_by"].includes(k)).slice(0, 6);
  return entries
    .map(([k, v]) => {
      if (v && typeof v === "object" && "from" in v && "to" in v) {
        const c = v as { from: unknown; to: unknown };
        return `${k}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`;
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join(" · ");
}

export default async function AdminAudit({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin("/admin/audit");
  const sp = await searchParams;
  const table = one(sp, "table");
  const page = pageOf(sp);
  const { rows, total } = await listAudit({ table: table && TABLES.includes(table) ? table : null, page, size: SIZE });
  const names = await namesFor(rows.map((r) => r.actor_id ?? ""));
  const link = (o: { table?: string | null; page?: number }) => {
    const p = new URLSearchParams();
    const t = o.table === undefined ? table : o.table;
    if (t) p.set("table", t);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return `/admin/audit${s ? `?${s}` : ""}`;
  };
  return (
    <div className="space-y-4">
      <AdminHeader title="Audit log" subtitle="Every change made by an admin. Entries can’t be edited or removed." />
      <Chips current={table} items={[{ value: null, label: "All", href: link({ table: null }) }, ...TABLES.map((t) => ({ value: t, label: t.replaceAll("_", " "), href: link({ table: t }) }))]} />
      {rows.length === 0 ? (
        <Empty>No admin activity yet.</Empty>
      ) : (
        <TableCard caption="Admin audit log">
          <thead className="border-b border-zinc-100 dark:border-zinc-800">
            <tr><th className={th}>When (IST)</th><th className={th}>Admin</th><th className={th}>Action</th><th className={th}>Details</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={`${td} whitespace-nowrap text-xs`}>{formatLocal(r.created_at, "Asia/Kolkata", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })}</td>
                <td className={td}>{r.actor_id ? names.get(r.actor_id) ?? "Admin" : "System"}</td>
                <td className={`${td} whitespace-nowrap`}>
                  <span className="font-medium">{r.action.replaceAll("_", " ")}</span>
                  <span className="block text-xs text-zinc-500">{r.target_table.replaceAll("_", " ")}</span>
                </td>
                <td className={`${td} max-w-[28rem] break-words font-mono text-[11px] text-zinc-600 dark:text-zinc-300`}>{summary(r.detail) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
      <Pager page={page} size={SIZE} total={total} href={(p) => link({ page: p })} />
    </div>
  );
}
