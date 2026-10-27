import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SessionForm } from "@/components/account/SessionForm";
import { parseRange } from "@/lib/booking-types";
import { formatLocal, formatMoney } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { listSessions, listVehicles, monthlyTotals, sessionCandidateBookings, vehicleLabel } from "@/server/account";

export const metadata: Metadata = { title: "My charging" };

const SOURCE: Record<string, { label: string; cls: string }> = {
  manual: { label: "Manual entry", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  operator_api: { label: "From operator", cls: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" },
  charger_ocpp: { label: "From charger", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

const MONTH = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/history");
  const [sessions, vehicles, bookings] = await Promise.all([listSessions(), listVehicles(), sessionCandidateBookings()]);
  const months = monthlyTotals(sessions);
  const maxCost = Math.max(1, ...months.map((m) => m.cost_minor));
  const total = months.reduce((a, m) => ({ kwh: a.kwh + m.energy_kwh, cost: a.cost + m.cost_minor, n: a.n + m.sessions }), { kwh: 0, cost: 0, n: 0 });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My charging</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Charging sessions are separate from bookings — a booking reserves time, a session records what was actually charged.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Last 6 months</h2>
          <p className="text-sm text-zinc-500">
            {total.n} session{total.n === 1 ? "" : "s"} · {Math.round(total.kwh * 10) / 10} kWh · {formatMoney(total.cost, "INR")}
          </p>
        </div>
        <figure className="mt-4">
          <div className="flex h-36 items-end gap-3" role="img" aria-label="Monthly charging spend, last 6 months">
            {months.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] tabular-nums text-zinc-500">{m.cost_minor ? formatMoney(m.cost_minor, "INR").replace(".00", "") : ""}</span>
                <div className="w-full rounded-t bg-emerald-600/80" style={{ height: `${Math.max(2, (m.cost_minor / maxCost) * 100)}px` }} />
                <span className="text-xs text-zinc-500">{MONTH(m.month)}</span>
              </div>
            ))}
          </div>
          <figcaption className="mt-2 text-xs text-zinc-500">Monthly spend from your recorded sessions (by start date, UTC month).</figcaption>
        </figure>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-medium">Sessions</h2>
        {sessions.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No sessions yet. Chargers in our network don’t report sessions automatically yet, so add them below from your receipt or the charger screen.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {sessions.map((s) => {
              const tz = s.station?.time_zone ?? "Asia/Kolkata";
              const mins = s.ended_at ? Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60000) : null;
              const src = SOURCE[s.source];
              return (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{s.station?.name ?? "Charging session"}</p>
                    <p className="text-zinc-500">
                      {formatLocal(s.started_at, tz)}{mins ? ` · ${mins} min` : ""}
                      {s.vehicle ? ` · ${s.vehicle.nickname || `${s.vehicle.make} ${s.vehicle.model}`}` : ""}
                      {s.booking ? ` · ${s.booking.reference}` : ""}
                    </p>
                    {s.notes && <p className="mt-0.5 text-xs text-zinc-500">{s.notes}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="tabular-nums">
                      {s.energy_kwh !== null ? `${Number(s.energy_kwh)} kWh` : "— kWh"} · {s.total_cost_minor !== null ? formatMoney(s.total_cost_minor, s.currency) : "—"}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${src.cls}`}>{src.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-medium">Add a session</h2>
        <p className="mb-4 mt-1 text-xs text-zinc-500">Saved as a manual entry and always labelled that way.</p>
        <SessionForm
          vehicles={vehicles.map((v) => ({ id: v.id, label: vehicleLabel(v) }))}
          bookings={bookings.map((b) => {
            const { start } = parseRange(b.period);
            return { id: b.id, label: `${b.reference} · ${b.station?.name ?? ""} · ${formatLocal(start, "Asia/Kolkata", { day: "numeric", month: "short" })}` };
          })}
        />
      </section>
    </div>
  );
}
