import Link from "next/link";
import type { ReactNode } from "react";
import { BoltIcon } from "@/components/nav/icons";
import {
  chargeEstimate, efficiencyKwhPer100Km, formatDuration, monthlyTrend, type HistoryItem,
} from "@/lib/charging-stats";
import { formatLocal, formatMoney } from "@/lib/format";
import { VEHICLE_TYPE_LABEL } from "@/lib/vehicle-types";
import type { BatteryReading, Vehicle } from "@/server/account";
import { BarChart } from "./BarChart";
import { SessionCard, UpcomingBookings, type BookingBrief } from "./HistoryView";
import { BatteryBar, LineChart, VehicleArt } from "./VehicleVisuals";

const card = "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800";

function Stat({ label, value, note, tone = "zinc" }: { label: string; value: ReactNode; note?: ReactNode; tone?: "zinc" | "energy" | "charge" }) {
  const bg = tone === "energy" ? "bg-energy-50 dark:bg-energy-500/10" : tone === "charge" ? "bg-charge-50 dark:bg-charge-500/10" : "bg-zinc-50 dark:bg-zinc-800/60";
  return (
    <div className={`rounded-xl p-3 ${bg}`}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
      {note && <dd className="mt-0.5 text-[11px] text-zinc-500">{note}</dd>}
    </div>
  );
}

export function VehicleDashboard({
  vehicle,
  readings,
  items,
  upcoming,
  pricePerKwhMinor,
  priceBasis,
  timeZone = "Asia/Kolkata",
  now = new Date(),
  preferredSlot,
  editSlot,
  readingForm,
  removeSlot,
  details,
  chargerReading = null,
}: {
  vehicle: Vehicle;
  readings: BatteryReading[];
  items: HistoryItem[]; // this vehicle's sessions and estimates
  upcoming: BookingBrief[];
  pricePerKwhMinor: number | null;
  priceBasis: string | null;
  timeZone?: string;
  now?: Date;
  preferredSlot?: ReactNode;
  editSlot?: ReactNode;
  readingForm?: ReactNode;
  removeSlot?: ReactNode;
  details?: ReactNode;
  chargerReading?: { soc_percent: number; recorded_at: string; simulated: boolean } | null;
}) {
  const manualSoc = readings.find((r) => r.soc_percent !== null) ?? null;
  // Battery % reported by a connected charger during a session counts as telemetry (labelled with its source).
  const chargerSoc = chargerReading && (!manualSoc || Date.parse(chargerReading.recorded_at) > Date.parse(manualSoc.recorded_at)) ? chargerReading : null;
  const latestSoc = chargerSoc ? { soc_percent: chargerSoc.soc_percent, recorded_at: chargerSoc.recorded_at } : manualSoc;
  const socLabel = chargerSoc ? (chargerSoc.simulated ? "Simulated charger" : "From charger") : "Manual";
  const latestOdo = readings.find((r) => r.odometer_km !== null) ?? null;
  const battery = vehicle.battery_capacity_kwh !== null ? Number(vehicle.battery_capacity_kwh) : null;
  const powerKw = vehicle.max_dc_kw ? Number(vehicle.max_dc_kw) : vehicle.max_ac_kw ? Number(vehicle.max_ac_kw) : null;
  const powerLabel = vehicle.max_dc_kw ? `DC ${Number(vehicle.max_dc_kw)} kW` : vehicle.max_ac_kw ? `AC ${Number(vehicle.max_ac_kw)} kW` : null;
  const est = chargeEstimate({ socPercent: latestSoc ? Number(latestSoc.soc_percent) : null, batteryKwh: battery, powerKw, pricePerKwhMinor });
  const odo = readings.filter((r) => r.odometer_km !== null).map((r) => ({ recorded_at: r.recorded_at, odometer_km: Number(r.odometer_km) }));
  const efficiency = efficiencyKwhPer100Km(odo, items);
  const trend = monthlyTrend(items, now, timeZone, 6);
  const thisMonth = trend.at(-1)!;
  const sessionsOnly = items.filter((i) => i.kind === "session");
  const totalKwh = Math.round(sessionsOnly.reduce((a, i) => a + (i.energyKwh ?? 0), 0) * 10) / 10;

  return (
    <div className="space-y-5">
      <Link href="/vehicles" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">← My vehicles</Link>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-energy-800 via-energy-700 to-energy-900 p-5 text-white shadow-md sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-energy-400/20 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-white/75">{VEHICLE_TYPE_LABEL[vehicle.vehicle_type]}{vehicle.registration_label ? ` · ${vehicle.registration_label}` : ""}</p>
            <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{vehicle.nickname || `${vehicle.make} ${vehicle.model}`}</h1>
            {vehicle.nickname && <p className="text-sm text-white/75">{vehicle.make} {vehicle.model}{vehicle.model_year ? ` (${vehicle.model_year})` : ""}</p>}
          </div>
          <div className="flex flex-wrap gap-2">{preferredSlot}</div>
        </div>
        <div className="relative mt-4 grid items-end gap-5 sm:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <BatteryBar percent={latestSoc ? Number(latestSoc.soc_percent) : null} recordedAt={latestSoc?.recorded_at} timeZone={timeZone} tone="dark" sourceLabel={socLabel} />
            <div className="flex flex-wrap gap-1.5">
              {vehicle.vehicle_connectors.map((c) => (
                <span key={c.connector_type} className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-white/20">
                  {c.connector_type}{c.supported_power_kw ? ` · ${Number(c.supported_power_kw)} kW` : ""}
                </span>
              ))}
              {battery !== null && <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-inset ring-white/20">{battery} kWh battery</span>}
              {powerLabel && <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-inset ring-white/20">Max {powerLabel}</span>}
            </div>
          </div>
          <VehicleArt type={vehicle.vehicle_type} className="h-24 w-auto justify-self-end text-energy-100 sm:h-28" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {/* Charge estimate */}
          <section aria-labelledby="est-h" className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="est-h" className="flex items-center gap-2 font-semibold"><BoltIcon className="h-5 w-5 text-charge-500" />To {est?.target ?? 80}% — estimate</h2>
              <span className="rounded bg-charge-50 px-1.5 py-0.5 text-[11px] font-medium text-charge-600 ring-1 ring-inset ring-charge-200">Estimate</span>
            </div>
            {est ? (
              <>
                <dl className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
                  <Stat tone="charge" label="Energy" value={`~${est.kwh} kWh`} />
                  <Stat tone="charge" label="Time" value={est.minutes !== null ? `~${formatDuration(est.minutes)}` : "—"} note={powerLabel ? `at ${powerLabel}` : "max power not set"} />
                  <Stat tone="charge" label="Cost" value={est.costMinor !== null ? `~${formatMoney(est.costMinor, "INR").replace(/\.00$/, "")}` : "—"} note={pricePerKwhMinor !== null ? `${formatMoney(pricePerKwhMinor, "INR")}/kWh` : "no price history"} />
                </dl>
                <p className="mt-3 text-xs text-zinc-500">
                  From your last {chargerSoc ? "charger-reported" : "manual"} reading ({Number(latestSoc!.soc_percent)}%) and battery size. Time assumes ~80% of max power on average.
                  {priceBasis ? ` Price: ${priceBasis}.` : " Add a session with cost and kWh to estimate cost."} Real charging varies with temperature, charger and battery state.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                {battery === null ? "Add your battery size (Edit) and " : ""}log a battery reading below to see an estimate. We don’t guess vehicle specs.
              </p>
            )}
          </section>

          {/* Monthly energy */}
          <section aria-labelledby="trend-h" className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="trend-h" className="font-semibold">Charging trend</h2>
              <p className="text-sm text-zinc-500">Last 6 months</p>
            </div>
            <dl className="mb-4 mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <Stat tone="energy" label="This month" value={`${thisMonth.kwh} kWh`} note={thisMonth.estimateKwh ? `+ ~${thisMonth.estimateKwh} kWh est.` : undefined} />
              <Stat tone="energy" label="Spent this month" value={formatMoney(thisMonth.costMinor, "INR").replace(/\.00$/, "")} />
              <Stat label="All recorded" value={`${totalKwh} kWh`} note={`${sessionsOnly.length} session${sessionsOnly.length === 1 ? "" : "s"}`} />
              <Stat label="Efficiency" value={efficiency !== null ? `${efficiency}` : "—"} note={efficiency !== null ? "kWh / 100 km (from your entries)" : "needs 2+ odometer readings and sessions"} />
            </dl>
            <BarChart
              bars={trend.map((m) => ({ label: m.label, actual: m.kwh, estimate: m.estimateKwh }))}
              format={(v) => `${Math.round(v)}`}
              label="kWh charged per month, last 6 months"
              height={140}
              highlightIndex={trend.length - 1}
            />
            <p className="mt-2 text-xs text-zinc-500">kWh per month from sessions recorded for this vehicle.</p>
          </section>

          {/* Readings */}
          <section aria-labelledby="readings-h" className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="readings-h" className="font-semibold">Battery & odometer</h2>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Manual entries</span>
            </div>
            <div className="mt-3 grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="mb-1 text-sm text-zinc-500">Battery %</h3>
                <LineChart
                  points={readings.filter((r) => r.soc_percent !== null).slice(0, 30).map((r) => ({ t: r.recorded_at, v: Number(r.soc_percent) }))}
                  label="Battery percentage over time, manual readings"
                  format={(v) => `${Math.round(v)}%`}
                  min={0}
                  max={100}
                  stroke="stroke-charge-500"
                  dot="fill-charge-500"
                />
              </div>
              <div>
                <h3 className="mb-1 text-sm text-zinc-500">Odometer {latestOdo ? <span className="font-medium text-zinc-900 dark:text-white">· {Number(latestOdo.odometer_km).toLocaleString("en-IN")} km</span> : null}</h3>
                <LineChart
                  points={odo.slice(0, 30).map((r) => ({ t: r.recorded_at, v: r.odometer_km }))}
                  label="Odometer over time, manual readings"
                  format={(v) => `${Math.round(v / 100) / 10}k`}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">From readings you entered — not live vehicle data. We don’t calculate battery health from percentage alone.</p>
            {readingForm && <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">{readingForm}</div>}
            {readings.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium text-energy-700 dark:text-energy-400">All readings ({readings.length})</summary>
                <table className="mt-2 w-full">
                  <caption className="sr-only">Battery and odometer reading history</caption>
                  <thead className="text-left text-xs text-zinc-500">
                    <tr><th className="py-1 font-medium">When</th><th className="py-1 font-medium">Battery</th><th className="py-1 font-medium">Odometer</th><th className="py-1 font-medium">Source</th></tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {readings.slice(0, 30).map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5">{formatLocal(r.recorded_at, timeZone)}</td>
                        <td className="py-1.5 tabular-nums">{r.soc_percent !== null ? `${Number(r.soc_percent)}%` : "—"}</td>
                        <td className="py-1.5 tabular-nums">{r.odometer_km !== null ? `${Number(r.odometer_km).toLocaleString("en-IN")} km` : "—"}</td>
                        <td className="py-1.5 text-zinc-500">{r.source === "manual" ? "Manual" : "Vehicle"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </section>

          {editSlot}
        </div>

        <aside className="min-w-0 space-y-5">
          <UpcomingBookings bookings={upcoming} title="Booked for this vehicle" empty={<>No upcoming bookings for this vehicle. <Link href="/" className="font-medium text-energy-700 hover:underline">Find a charger</Link></>} />
          <section aria-labelledby="recent-h" className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 id="recent-h" className="font-semibold">Recent charging</h2>
              <Link href="/history" className="text-sm font-medium text-energy-700 hover:underline dark:text-energy-400">History</Link>
            </div>
            {items.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">No sessions recorded for this vehicle yet.</p>
            ) : (
              <ul className="space-y-3">{items.slice(0, 3).map((i) => <SessionCard key={i.id} item={i} />)}</ul>
            )}
          </section>
          {details}
          {removeSlot}
        </aside>
      </div>
    </div>
  );
}
