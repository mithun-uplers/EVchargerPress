"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/charging-stats";
import { formatMoney, formatTime } from "@/lib/format";
import { minutesToTarget, provenance, secondsAgo, type LiveSample, type LiveSessionData, type StartState } from "@/lib/live";

type Payload = { live: LiveSessionData | null; start: StartState };

const POLL_MS = 5_000;

/** Power (kW, area) and battery % (line) over the session, from the charger's meter values. */
function PowerCurve({ samples, maxKw, timeZone }: { samples: LiveSample[]; maxKw: number | null; timeZone: string }) {
  const pts = samples.filter((s) => s.w !== null);
  if (pts.length < 2) return <p className="py-8 text-center text-sm text-zinc-500">The power curve appears after the first few readings.</p>;
  const W = 640, H = 180, pl = 54, pr = 40, pt = 12, pb = 24;
  const t0 = Date.parse(pts[0].t), t1 = Date.parse(pts.at(-1)!.t);
  const top = Math.max(maxKw ?? 0, ...pts.map((p) => (p.w ?? 0) / 1000)) || 1;
  const x = (t: string) => pl + ((Date.parse(t) - t0) / Math.max(1, t1 - t0)) * (W - pl - pr);
  const y = (kw: number) => pt + (1 - kw / top) * (H - pt - pb);
  const ys = (soc: number) => pt + (1 - soc / 100) * (H - pt - pb);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y((p.w ?? 0) / 1000).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.at(-1)!.t).toFixed(1)} ${H - pb} L${pl} ${H - pb} Z`;
  const socPts = pts.filter((p) => p.soc !== null);
  const soc = socPts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${ys(p.soc!).toFixed(1)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Charging power and battery level over this session" className="w-full">
        {[top, top / 2, 0].map((v, i) => (
          <g key={i}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeDasharray="3 4" />
            <text x={pl - 6} y={y(v) + 4} textAnchor="end" className="fill-zinc-400 text-[12px] tabular-nums">{Math.round(v)} kW</text>
          </g>
        ))}
        {socPts.length > 1 && [100, 50].map((v, i) => (
          <text key={i} x={W - pr + 6} y={ys(v) + 4} className="fill-energy-600 text-[12px] tabular-nums">{v}%</text>
        ))}
        <path d={area} className="fill-charge-400/25" />
        <path d={line} fill="none" className="stroke-charge-500" strokeWidth={2.5} strokeLinejoin="round" />
        {socPts.length > 1 && <path d={soc} fill="none" className="stroke-energy-600" strokeWidth={2} strokeDasharray="6 4" />}
        <text x={pl} y={H - 6} className="fill-zinc-400 text-[12px]">{formatTime(pts[0].t, timeZone)}</text>
        <text x={W - pr} y={H - 6} textAnchor="end" className="fill-zinc-400 text-[12px]">{formatTime(pts.at(-1)!.t, timeZone)}</text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-charge-400" />Power (kW)</span>
        {socPts.length > 1 && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-energy-600" />Battery % (from charger)</span>}
      </figcaption>
    </figure>
  );
}

function SocRing({ soc, size = 168 }: { soc: number | null; size?: number }) {
  const r = 70, c = 2 * Math.PI * r;
  const p = soc === null ? 0 : Math.max(0, Math.min(100, soc));
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={soc === null ? "Battery level not reported" : `Battery ${Math.round(p)}%`}>
      <circle cx="80" cy="80" r={r} fill="none" strokeWidth="12" className="stroke-white/20" />
      {soc !== null && (
        <circle cx="80" cy="80" r={r} fill="none" strokeWidth="12" strokeLinecap="round" className="stroke-charge-400 transition-[stroke-dashoffset] duration-700"
          strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} transform="rotate(-90 80 80)" />
      )}
      <text x="80" y="78" textAnchor="middle" className="fill-white text-[34px] font-semibold tabular-nums">{soc === null ? "—" : `${Math.round(p)}%`}</text>
      <text x="80" y="102" textAnchor="middle" className="fill-white/70 text-[12px]">{soc === null ? "SoC not reported" : "battery"}</text>
    </svg>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-3 ring-1 ring-inset ring-white/15">
      <dt className="text-xs text-white/70">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-[11px] text-white/60">{note}</dd>}
    </div>
  );
}

export function LiveCharging({ reference, initial, canStart, serverNow, demo = false }: { reference: string; initial: Payload; canStart: boolean; serverNow: number; demo?: boolean }) {
  const [data, setData] = useState<Payload>(initial);
  // Start from the server's clock so the first client render matches the HTML (no hydration mismatch).
  const [now, setNow] = useState(() => (initial.live?.now ? Date.parse(initial.live.now) : serverNow));
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState(true);
  const live = data.live;
  const s = live?.session;
  const active = s?.status === "in_progress" || data.start.state === "waiting" || !!live?.pending_command;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/bookings/${reference}/live`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData((await res.json()).data);
      setLastOk(true);
    } catch {
      setLastOk(false);
    }
    setNow(Date.now());
  }, [reference]);

  useEffect(() => {
    if (!active || demo) return;
    timer.current = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [active, demo, refresh]);

  async function post(url: string, kind: "start" | "stop") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error?.message ?? "Something went wrong. Please try again.");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const simulated = !!s?.is_simulated;
  const tz = live?.station?.time_zone ?? "Asia/Kolkata";
  const mins = s ? Math.max(0, Math.round(((s.ended_at ? Date.parse(s.ended_at) : now) - Date.parse(s.started_at)) / 60000)) : 0;
  const kwh = s?.energy_kwh !== null && s?.energy_kwh !== undefined ? Number(s.energy_kwh) : null;
  const power = s?.last_power_kw !== null && s?.last_power_kw !== undefined ? Number(s.last_power_kw) : null;
  const soc = s?.last_soc_percent !== null && s?.last_soc_percent !== undefined ? Number(s.last_soc_percent) : null;
  const battery = live?.vehicle?.battery_capacity_kwh ? Number(live.vehicle.battery_capacity_kwh) : null;
  const to80 = minutesToTarget(soc, 80, battery, power);
  const currency = s?.currency ?? "INR";
  const stopping = live?.pending_command?.action === "RemoteStopTransaction";

  return (
    <div className="space-y-5">
      {simulated && (
        <div role="note" className="rounded-xl bg-charge-50 px-3 py-2 text-xs text-charge-600 ring-1 ring-inset ring-charge-200">
          <strong>Simulated charger.</strong> This demo station is connected to the EVChargePress charger simulator — power, energy and battery values are generated for testing, not measured.
        </div>
      )}

      {!s && data.start.state !== "waiting" && (
        <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
          <p className="text-lg font-semibold">Ready to charge</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
            Plug the cable into your vehicle, then start. We’ll ask the charger to begin and show live power, energy and cost here.
          </p>
          {data.start.state === "rejected" && <p className="mt-3 text-sm text-rose-700">The charger refused to start. Check the cable is connected and try again.</p>}
          {data.start.state === "expired" && <p className="mt-3 text-sm text-rose-700">The charger didn’t respond. It may be offline — try again or start on the charger’s screen.</p>}
          {canStart ? (
            <button onClick={() => post(`/api/v1/bookings/${reference}/start-charging`, "start")} disabled={busy !== null}
              className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-energy-600 px-6 text-base font-semibold text-white shadow-sm hover:bg-energy-700 disabled:opacity-60">
              {busy === "start" ? "Starting…" : "Start charging"}
            </button>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Charging can start from your booking’s check-in time.</p>
          )}
        </section>
      )}

      {!s && data.start.state === "waiting" && (
        <section aria-live="polite" className="rounded-3xl bg-gradient-to-br from-energy-700 via-energy-600 to-energy-800 p-6 text-center text-white shadow-md">
          <span aria-hidden="true" className="mx-auto block h-10 w-10 rounded-full border-4 border-white/30 border-t-charge-400 motion-safe:animate-spin" />
          <p className="mt-4 text-lg font-semibold">Waiting for the charger…</p>
          <p className="mt-1 text-sm text-white/80">Asked {secondsAgo(data.start.since, now)}. Make sure the cable is plugged in.</p>
        </section>
      )}

      {s && (
        <section aria-label="Charging session" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-energy-800 via-energy-700 to-energy-900 p-5 text-white shadow-md sm:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-charge-400/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-sm font-medium">
              {s.status === "in_progress" ? (
                <><span aria-hidden="true" className="h-2 w-2 rounded-full bg-charge-400 motion-safe:animate-pulse" />{stopping ? "Stopping…" : "Charging"}</>
              ) : (
                <>Session complete</>
              )}
            </p>
            <p className="text-xs text-white/70">
              {provenance(simulated)}{s.last_meter_at ? ` · updated ${secondsAgo(s.last_meter_at, now)}` : ""}{!lastOk ? " · reconnecting…" : ""}
            </p>
          </div>
          <div className="relative mt-4 grid items-center gap-5 sm:grid-cols-[auto_1fr]">
            <div className="justify-self-center"><SocRing soc={soc} /></div>
            <dl className="grid grid-cols-2 gap-2 sm:gap-3">
              <Stat label={s.status === "in_progress" ? "Power now" : "Avg. power"} value={s.status === "in_progress" ? (power !== null ? `${power.toFixed(1)} kW` : "—") : kwh && mins ? `${(kwh / (mins / 60)).toFixed(1)} kW` : "—"} />
              <Stat label="Energy" value={kwh !== null ? `${kwh.toFixed(2)} kWh` : "—"} />
              <Stat label="Duration" value={formatDuration(mins) ?? "—"} note={`since ${formatTime(s.started_at, tz)}`} />
              {s.status === "in_progress" ? (
                <Stat label="Cost so far" value={live?.cost_so_far_minor !== null && live?.cost_so_far_minor !== undefined ? `~${formatMoney(live.cost_so_far_minor, currency)}` : "—"} note="Estimate from your booking’s tariff" />
              ) : (
                <Stat label="Charging cost" value={s.total_cost_minor !== null ? formatMoney(s.total_cost_minor, currency) : "—"} note="From your booking’s tariff" />
              )}
            </dl>
          </div>
          {s.status === "in_progress" && (
            <p className="relative mt-4 text-sm text-white/80">
              {to80 !== null ? (to80 === 0 ? "Above 80% — charging slows from here." : `About ${formatDuration(to80)} to 80% at the current power (estimate).`) : soc === null ? "This charger doesn’t report battery %." : null}
              {live?.booking ? ` Booking ends ${formatTime(live.booking.end, tz)}.` : ""}
            </p>
          )}
          {s.status === "in_progress" && (
            <button onClick={() => post(`/api/v1/sessions/${s.id}/stop`, "stop")} disabled={busy !== null || stopping}
              className="relative mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-white text-base font-semibold text-energy-800 hover:bg-energy-50 disabled:opacity-60 sm:w-auto sm:px-8">
              {busy === "stop" || stopping ? "Stopping…" : "Stop charging"}
            </button>
          )}
          {s.status !== "in_progress" && (
            <p className="relative mt-4 text-sm text-white/80">
              Stopped {s.ended_at ? formatTime(s.ended_at, tz) : ""}{s.stop_reason ? ` · ${s.stop_reason === "Remote" ? "stopped from the app" : s.stop_reason === "EVDisconnected" ? "vehicle full or unplugged" : s.stop_reason === "Local" ? "booking ended or stopped at the charger" : s.stop_reason}` : ""}.
              {" "}<Link href="/history" className="font-medium text-white underline">See charging history</Link>
            </p>
          )}
        </section>
      )}

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {s && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800">
          <h2 className="mb-3 font-semibold">Power curve</h2>
          <PowerCurve samples={live!.samples} maxKw={live?.evse?.max_power_kw ? Number(live.evse.max_power_kw) : null} timeZone={tz} />
          <p className="mt-2 text-xs text-zinc-500">
            {simulated ? "Generated by the charger simulator." : "Meter values reported by the charger."} Final cost is confirmed by the operator’s receipt.
          </p>
        </section>
      )}
    </div>
  );
}
