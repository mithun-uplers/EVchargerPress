import Link from "next/link";
import type { ReactNode } from "react";
import { busiestWindow, type Analytics } from "@/lib/analytics";
import { formatDuration } from "@/lib/charging-stats";
import { formatMoney } from "@/lib/format";
import { BarChart } from "./BarChart";
import { LineChart } from "./VehicleVisuals";

const card = "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800";
const money = (m: number) => formatMoney(m, "INR").replace(/\.00$/, "");
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-inset ring-white/15">
      <dt className="text-xs text-white/70">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-[11px] text-white/60">{note}</dd>}
    </div>
  );
}

function Split({ parts }: { parts: { label: string; value: number; cls: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return <p className="text-sm text-zinc-500">No data yet.</p>;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ")}>
        {parts.map((p) => p.value > 0 && <div key={p.label} className={p.cls} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${p.cls}`} />{p.label} · {Math.round((p.value / total) * 100)}%
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnalyticsView({ a, banner }: { a: Analytics; banner?: ReactNode }) {
  const window = busiestWindow(a.hours);
  const priceTrend = a.monthly.filter((m) => m.pricePerKwhMinor !== null).map((m) => ({ t: `${m.key}-01T00:00:00Z`, v: m.pricePerKwhMinor! / 100 }));
  const fromLabel = new Date(`${a.from}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <div className="space-y-5">
      {banner}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Charging analytics</h1>
          <p className="mt-1 text-sm text-zinc-500">Last 12 months (since {fromLabel}) · recorded sessions only, booking estimates excluded.</p>
        </div>
        <Link href="/history" className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-medium ring-1 ring-inset ring-zinc-300 hover:bg-white dark:ring-zinc-700">Charging history</Link>
      </div>

      <section aria-label="Totals" className="rounded-3xl bg-gradient-to-br from-energy-700 via-energy-600 to-energy-800 p-5 text-white shadow-md sm:p-6">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Energy charged" value={`${a.kwh} kWh`} note={`${a.sessions} session${a.sessions === 1 ? "" : "s"}`} />
          <Kpi label="Spent" value={money(a.costMinor)} />
          <Kpi label="Avg. price" value={a.pricePerKwhMinor !== null ? `${formatMoney(a.pricePerKwhMinor, "INR")}/kWh` : "—"} note="sessions with cost and kWh" />
          <Kpi label="Avg. power" value={a.avgPowerKw !== null ? `${a.avgPowerKw} kW` : "—"} note={a.avgMinutes ? `avg ${formatDuration(a.avgMinutes)} per session` : undefined} />
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">Monthly spending</h2>
          <div className="mt-4">
            <BarChart bars={a.monthly.map((m) => ({ label: m.label, actual: m.costMinor / 100, estimate: 0 }))} format={(v) => `₹${Math.round(v).toLocaleString("en-IN")}`} label="Spending per month, last 12 months" labelEvery={2} height={150} highlightIndex={a.monthly.length - 1} />
          </div>
        </section>
        <section className={card}>
          <h2 className="font-semibold">Price per kWh</h2>
          <div className="mt-2">
            <LineChart points={priceTrend} label="Average price per kWh by month" format={(v) => `₹${v.toFixed(1)}`} stroke="stroke-charge-500" dot="fill-charge-500" />
          </div>
          <p className="mt-1 text-xs text-zinc-500">What you paid on average each month, from sessions that record both cost and energy.</p>
        </section>
        <section className={card}>
          <h2 className="font-semibold">When you charge</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {window ? <>Most sessions ({window.share}%) start between <strong className="text-zinc-900 dark:text-white">{window.from}–{window.to}</strong>, in the station’s local time.</> : "Add a few more sessions to see your pattern."}
          </p>
          <div className="mt-4">
            <BarChart bars={a.hours.map((n, h) => ({ label: String(h).padStart(2, "0"), actual: n, estimate: 0 }))} format={(v) => `${Math.round(v)}`} label="Sessions by starting hour" labelEvery={6} height={110} />
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5" role="img" aria-label={`Sessions by weekday: ${a.weekdays.map((n, i) => `${WEEK[i]} ${n}`).join(", ")}`}>
            {a.weekdays.map((n, i) => {
              const max = Math.max(1, ...a.weekdays);
              return (
                <div key={i} className="text-center">
                  <div className="h-9 rounded-lg bg-energy-600" style={{ opacity: n ? 0.25 + 0.75 * (n / max) : 0.08 }} />
                  <span className="mt-1 block text-[11px] text-zinc-500">{WEEK[i]}</span>
                </div>
              );
            })}
          </div>
        </section>
        <section className={card}>
          <h2 className="font-semibold">Where your energy comes from</h2>
          <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Charger type (by kWh)</h3>
          <div className="mt-2">
            <Split parts={[
              { label: "DC fast", value: a.power.dc, cls: "bg-charge-400" },
              { label: "AC", value: a.power.ac, cls: "bg-energy-500" },
              { label: "Unknown", value: a.power.unknown, cls: "bg-zinc-300 dark:bg-zinc-600" },
            ]} />
          </div>
          <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">Data source (sessions)</h3>
          <div className="mt-2">
            <Split parts={[
              { label: "From charger", value: a.sources.charger, cls: "bg-energy-600" },
              { label: "Manual entry", value: a.sources.manual, cls: "bg-zinc-400" },
              { label: "Simulated", value: a.sources.simulated, cls: "bar-estimate bg-charge-100" },
            ]} />
          </div>
          <p className="mt-3 text-xs text-zinc-500">Manual entries are as accurate as the receipt they came from. Simulated sessions come from the demo charger simulator.</p>
        </section>
      </div>

      <section className={card}>
        <h2 className="font-semibold">Top stations</h2>
        {a.topStations.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No sessions in the last 12 months.</p>
        ) : (
          <div className="-mx-1 mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">Stations by energy charged</caption>
              <thead className="text-left text-xs text-zinc-500">
                <tr><th className="px-1 py-1.5 font-medium">Station</th><th className="px-1 py-1.5 text-right font-medium">Sessions</th><th className="px-1 py-1.5 text-right font-medium">kWh</th><th className="px-1 py-1.5 text-right font-medium">Spent</th><th className="px-1 py-1.5 text-right font-medium">₹/kWh</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {a.topStations.map((s) => (
                  <tr key={`${s.title}${s.subtitle}`}>
                    <td className="px-1 py-2"><span className="font-medium">{s.title}</span>{s.subtitle && <span className="block truncate text-xs text-zinc-500">{s.subtitle}</span>}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{s.sessions}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{s.kwh}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{money(s.costMinor)}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{s.pricePerKwhMinor !== null ? (s.pricePerKwhMinor / 100).toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
