import { AdminHeader, Chips, Empty, Pager, Pill, TableCard, one, pageOf, td, th } from "@/components/admin/AdminUI";
import { formatLocal, formatMoney } from "@/lib/format";
import { listSessions, namesFor, requireAdmin } from "@/server/admin";

export const metadata = { title: "Charging sessions" };
const SIZE = 25;
const SOURCE: Record<string, string> = { charger_ocpp: "From charger", operator_api: "Operator", manual: "Manual entry" };

export default async function AdminSessions({ searchParams }: PageProps<"/admin/sessions">) {
  await requireAdmin("/admin/sessions");
  const sp = await searchParams;
  const status = one(sp, "status");
  const page = pageOf(sp);
  const { rows, total } = await listSessions({ status, page, size: SIZE });
  const names = await namesFor(rows.map((r) => r.user_id));
  const link = (o: { status?: string | null; page?: number }) => {
    const p = new URLSearchParams();
    const st = o.status === undefined ? status : o.status;
    if (st) p.set("status", st);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return `/admin/sessions${s ? `?${s}` : ""}`;
  };
  return (
    <div className="space-y-4">
      <AdminHeader title="Charging sessions" subtitle="Sessions reported by chargers, operators and drivers. Simulated sessions come from the demo charger simulator." />
      <Chips
        current={status}
        items={[
          { value: null, label: "All", href: link({ status: null }) },
          { value: "in_progress", label: "Charging now", href: link({ status: "in_progress" }) },
          { value: "completed", label: "Completed", href: link({ status: "completed" }) },
          { value: "failed", label: "Failed", href: link({ status: "failed" }) },
        ]}
      />
      {rows.length === 0 ? (
        <Empty>No sessions.</Empty>
      ) : (
        <TableCard caption="Charging sessions">
          <thead className="border-b border-zinc-100 dark:border-zinc-800">
            <tr><th className={th}>Station</th><th className={th}>Started</th><th className={th}>Driver</th><th className={th}>Energy</th><th className={th}>Cost</th><th className={th}>Source</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((s) => {
              const tz = s.station?.time_zone ?? "Asia/Kolkata";
              return (
                <tr key={s.id}>
                  <td className={td}>
                    {s.station?.name ?? "—"}
                    {s.booking && <span className="block font-mono text-xs text-zinc-500">{s.booking.reference}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {formatLocal(s.started_at, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                    <span className="block text-xs text-zinc-500">
                      {s.ended_at ? `ended ${formatLocal(s.ended_at, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}` : s.status === "in_progress" ? `charging${s.last_power_kw ? ` · ${Number(s.last_power_kw)} kW` : ""}` : ""}
                    </span>
                  </td>
                  <td className={td}>{names.get(s.user_id) ?? "Driver"}</td>
                  <td className={`${td} tabular-nums`}>
                    {s.energy_kwh != null ? `${Number(s.energy_kwh).toFixed(1)} kWh` : "—"}
                    {s.last_soc_percent != null && <span className="block text-xs text-zinc-500">SoC {Math.round(Number(s.last_soc_percent))}% (from charger)</span>}
                  </td>
                  <td className={`${td} tabular-nums`}>{s.total_cost_minor != null ? formatMoney(s.total_cost_minor, s.currency ?? "INR") : "—"}</td>
                  <td className={`${td} space-x-1 space-y-1`}>
                    {s.status === "in_progress" ? <Pill tone="blue">Charging</Pill> : s.status === "failed" ? <Pill tone="red">Failed</Pill> : <Pill>Completed</Pill>}
                    <Pill tone={s.is_simulated ? "amber" : "zinc"}>{s.is_simulated ? "Simulated" : SOURCE[s.source] ?? s.source}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}
      <Pager page={page} size={SIZE} total={total} href={(p) => link({ page: p })} />
    </div>
  );
}
