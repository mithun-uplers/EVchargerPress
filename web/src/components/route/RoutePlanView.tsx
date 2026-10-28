import Link from "next/link";
import type { ReactNode } from "react";
import { BoltIcon } from "@/components/nav/icons";
import { formatDuration } from "@/lib/charging-stats";
import { provenance } from "@/lib/live";
import type { Plan, PlannedStop } from "@/lib/route-plan";

export type RouteResult = {
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  durationMin: number | null;
  source: "osrm" | "straight_line";
  plan: Plan;
  inputs: { startSocPct: number; reservePct: number; batteryKwh: number; consumption: number; consumptionSource: "entered" | "your history" };
  stationsConsidered: number;
};

const km = (n: number) => `${Math.round(n)} km`;
const card = "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800";

/** Battery % along the trip: drops while driving, jumps at each stop (estimate). */
function SocProfile({ r }: { r: RouteResult }) {
  const W = 640, H = 170, pl = 54, pr = 12, pt = 12, pb = 26;
  const kmPerPct = r.inputs.batteryKwh / r.inputs.consumption;
  const pts: { km: number; soc: number }[] = [{ km: 0, soc: r.inputs.startSocPct }];
  for (const s of r.plan.stops) {
    pts.push({ km: s.station.along_km, soc: s.arriveSocPct }, { km: s.station.along_km, soc: s.departSocPct });
  }
  const last = pts.at(-1)!;
  const endKm = r.plan.ok ? r.distanceKm : Math.min(r.distanceKm, last.km + Math.max(0, last.soc) * kmPerPct);
  pts.push({ km: endKm, soc: r.plan.ok ? r.plan.arriveSocPct : Math.max(0, last.soc - (endKm - last.km) / kmPerPct) });
  const x = (k: number) => pl + (k / Math.max(1, r.distanceKm)) * (W - pl - pr);
  const y = (s: number) => pt + (1 - s / 100) * (H - pt - pb);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.km).toFixed(1)} ${y(p.soc).toFixed(1)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Estimated battery level along the route" className="max-h-72 w-full">
        <rect x={pl} y={y(r.inputs.reservePct)} width={W - pl - pr} height={y(0) - y(r.inputs.reservePct)} className="fill-rose-500/10" />
        {[100, 50, r.inputs.reservePct, 0].map((v) => (
          <g key={v}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeDasharray="3 4" />
            <text x={pl - 6} y={y(v) + 4} textAnchor="end" className="fill-zinc-400 text-[13px] tabular-nums">{v}%</text>
          </g>
        ))}
        <path d={`${d} L${x(endKm)} ${y(0)} L${x(0)} ${y(0)} Z`} className="fill-energy-500/10" />
        <path d={d} fill="none" className="stroke-energy-600" strokeWidth={2.5} strokeLinejoin="round" />
        {r.plan.stops.map((s, i) => (
          <g key={s.station.id}>
            <line x1={x(s.station.along_km)} x2={x(s.station.along_km)} y1={y(s.arriveSocPct)} y2={y(s.departSocPct)} className="stroke-charge-400" strokeWidth={6} strokeLinecap="round" />
            <circle cx={x(s.station.along_km)} cy={y(s.departSocPct) - 14} r={10} className="fill-charge-400" />
            <text x={x(s.station.along_km)} y={y(s.departSocPct) - 10} textAnchor="middle" className="fill-zinc-900 text-[13px] font-bold">{i + 1}</text>
          </g>
        ))}
        <text x={pl} y={H - 6} className="fill-zinc-500 text-[13px]">A · 0 km</text>
        <text x={W - pr} y={H - 6} textAnchor="end" className="fill-zinc-500 text-[13px]">B · {km(r.distanceKm)}</text>
      </svg>
      <figcaption className="mt-1 text-xs text-zinc-500">Estimated battery % along the route. Shaded band = your arrival reserve.</figcaption>
    </figure>
  );
}

function Stop({ s, i }: { s: PlannedStop; i: number }) {
  const free = s.station.live_evse_count ? `${s.station.live_available_count ?? 0} of ${s.station.live_evse_count} free · ${provenance(s.station.live_is_simulated)}` : null;
  return (
    <li className="relative pl-10">
      <span aria-hidden="true" className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full bg-charge-400 text-sm font-bold text-zinc-900 ring-4 ring-white dark:ring-zinc-900">{i + 1}</span>
      <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{s.station.name}</p>
            <p className="text-sm text-zinc-500">{[s.station.operator, s.station.city].filter(Boolean).join(" · ") || "—"} · {km(s.station.along_km)} along{s.station.detour_km >= 0.5 ? `, ${s.station.detour_km.toFixed(1)} km off route` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {s.station.is_bookable && <span className="rounded-full bg-energy-600 px-2 py-0.5 font-medium text-white">Bookable</span>}
            {free && <span className="rounded-full bg-energy-50 px-2 py-0.5 font-medium text-energy-800 ring-1 ring-inset ring-energy-600/20">{free}</span>}
          </div>
        </div>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <div><dt className="text-xs text-zinc-500">Arrive</dt><dd className="font-semibold tabular-nums">~{Math.round(s.arriveSocPct)}%</dd></div>
          <div><dt className="text-xs text-zinc-500">Charge to</dt><dd className="font-semibold tabular-nums">~{Math.round(s.departSocPct)}%</dd></div>
          <div>
            <dt className="text-xs text-zinc-500">Charging</dt>
            <dd className="font-semibold tabular-nums">{s.chargeMinutes !== null ? `~${formatDuration(s.chargeMinutes)}` : "—"}</dd>
          </div>
        </dl>
        <p className="mt-1 text-xs text-zinc-500">
          ~{s.energyKwh} kWh{s.powerKw ? ` at up to ${s.powerKw} kW` : " · charger power not listed"} · {km(s.legKm)} from the previous point
        </p>
        <div className="mt-2 flex gap-3 text-sm font-medium">
          <Link href={`/stations/${s.station.id}`} className="text-energy-700 hover:underline dark:text-energy-400">Station details</Link>
          {s.station.is_bookable && <Link href={`/stations/${s.station.id}/book`} className="text-energy-700 hover:underline dark:text-energy-400">Book a slot</Link>}
        </div>
      </div>
    </li>
  );
}

export function RoutePlanView({ form, result, map, error, banner, save, title = "Plan a trip", subtitle, extra }: {
  form?: ReactNode; result: RouteResult | null; map?: ReactNode; error?: string | null; banner?: ReactNode; save?: ReactNode;
  title?: string; subtitle?: ReactNode; extra?: ReactNode;
}) {
  const p = result?.plan;
  return (
    <div className="space-y-5">
      {banner}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{subtitle ?? "Charging stops matched to your vehicle’s connectors. All times and battery levels are estimates."}</p>
      </div>
      <div className={`grid grid-cols-1 gap-5 ${form ? "lg:grid-cols-[22rem_minmax(0,1fr)]" : ""}`}>
        {form && <section aria-label="Trip details" className={`${card} h-fit ${result ? "order-2 lg:order-none" : ""}`}>{form}</section>}
        <div className="min-w-0 space-y-5">
          {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          {!result && !error && (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-transparent">
              Enter where you’re going and your battery level to see where to charge.
            </div>
          )}
          {result && p && (
            <>
              <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-energy-700 via-energy-600 to-energy-800 p-5 text-white shadow-md sm:p-6">
                <p className="truncate text-sm text-white/80">{result.fromLabel} → {result.toLabel}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div><p className="text-xs text-white/70">Distance</p><p className="text-2xl font-semibold tabular-nums">{km(result.distanceKm)}</p></div>
                  <div><p className="text-xs text-white/70">Driving</p><p className="text-2xl font-semibold tabular-nums">{result.durationMin !== null ? formatDuration(result.durationMin) : "—"}</p></div>
                  <div><p className="text-xs text-white/70">Charging stops</p><p className="text-2xl font-semibold tabular-nums">{p.stops.length}</p></div>
                  <div>
                    <p className="text-xs text-white/70">{p.ok ? "Arrive with" : "Status"}</p>
                    <p className="text-2xl font-semibold tabular-nums">{p.ok ? `~${Math.round(p.arriveSocPct)}%` : "Gap"}</p>
                  </div>
                </div>
                {p.ok && p.chargeMinutes !== null && p.stops.length > 0 && (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-charge-400/20 px-3 py-1 text-xs text-charge-100 ring-1 ring-inset ring-charge-300/40">
                    <BoltIcon className="h-3.5 w-3.5" /> ~{formatDuration(p.chargeMinutes)} charging · ~{p.energyKwh} kWh added
                  </p>
                )}
                {save}
              </section>
              {result.source === "straight_line" && (
                <p role="note" className="rounded-xl bg-charge-50 px-3 py-2 text-xs text-charge-600 ring-1 ring-inset ring-charge-200">
                  The routing service couldn’t be reached, so this uses a straight line between the two places. Real road distance is longer — treat the plan as a rough guide.
                </p>
              )}
              {!p.ok && (
                <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
                  We couldn’t find a compatible charger between {km(p.gapFromKm)} and {km(p.gapToKm)} along the route
                  {p.compatibleStations === 0 ? " — no stations near this route list your vehicle’s connectors." : "."} Try a higher starting battery, a lower reserve, or a different route.
                </p>
              )}
              {map}
              <section className={card}>
                <h2 className="mb-2 font-semibold">Battery along the route</h2>
                <SocProfile r={result} />
              </section>
              <section className={card}>
                <h2 className="mb-4 font-semibold">Stops</h2>
                <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-4 before:top-3 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-700">
                  <li className="relative pl-10">
                    <span aria-hidden="true" className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full bg-zinc-900 text-xs font-bold text-white ring-4 ring-white dark:ring-zinc-900">A</span>
                    <p className="pt-1 font-medium">{result.fromLabel}</p>
                    <p className="text-sm text-zinc-500">Start with {result.inputs.startSocPct}%</p>
                  </li>
                  {p.stops.map((s, i) => <Stop key={s.station.id} s={s} i={i} />)}
                  <li className="relative pl-10">
                    <span aria-hidden="true" className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full bg-zinc-900 text-xs font-bold text-white ring-4 ring-white dark:ring-zinc-900">B</span>
                    <p className="pt-1 font-medium">{result.toLabel}</p>
                    <p className="text-sm text-zinc-500">{p.ok ? `Arrive with ~${Math.round(p.arriveSocPct)}%` : "Not reachable with this plan"}</p>
                  </li>
                </ol>
                <p className="mt-4 text-xs text-zinc-500">
                  Assumes {result.inputs.consumption} kWh/100 km ({result.inputs.consumptionSource}), a {result.inputs.batteryKwh} kWh battery, a {result.inputs.reservePct}% arrival reserve, charging to at most 80% and ~80% of the charger’s or your vehicle’s max power.
                  Checked {result.stationsConsidered} stations within 5 km of the route. Speed, weather, load and elevation change real range — keep a margin.
                </p>
              </section>
              {extra}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
