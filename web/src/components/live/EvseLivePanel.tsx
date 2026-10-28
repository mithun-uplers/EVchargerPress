"use client";

import { useEffect, useState } from "react";
import { LIVE_LABEL, TONE_CLS, provenance, secondsAgo, type EvseLive } from "@/lib/live";

/** Charging points with their live status, refreshed every 15 s while the tab is visible. */
export function EvseLivePanel({ stationId, initial, serverNow, demoNow }: { stationId: string; initial: EvseLive[]; serverNow: number; demoNow?: number }) {
  const [rows, setRows] = useState(initial);
  // Server clock first, so server HTML and the first client render agree (no hydration mismatch).
  const [now, setNow] = useState(() => demoNow ?? serverNow);
  const connected = rows.some((r) => r.is_connected);

  useEffect(() => {
    if (!connected || demoNow !== undefined) return;
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/v1/stations/${stationId}/live`, { cache: "no-store" });
        if (res.ok && !stop) setRows((await res.json()).data);
      } catch {
        /* keep the last values; freshness labels show their age */
      }
      setNow(Date.now());
    };
    const t = setInterval(tick, 15_000);
    const c = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      stop = true;
      clearInterval(t);
      clearInterval(c);
    };
  }, [stationId, connected, demoNow]);

  if (rows.length === 0) return null;
  const simulated = rows.some((r) => r.live_is_simulated && r.is_fresh);
  return (
    <section aria-labelledby="live-h" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="live-h" className="font-semibold">Charging points</h2>
        {connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-energy-500 motion-safe:animate-pulse" />
            {simulated ? "Simulated charger feed (testing)" : "Live from the charger"}
          </span>
        ) : (
          <span className="text-xs text-zinc-500">No live feed — status comes from driver reports</span>
        )}
      </div>
      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800" aria-live="polite">
        {rows.map((r) => {
          const fresh = r.is_fresh && r.live_status && r.live_status_at && now - Date.parse(r.live_status_at) <= 15 * 60_000;
          const info = fresh ? LIVE_LABEL[r.live_status!] : null;
          return (
            <li key={r.evse_id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.label}</p>
                <p className="text-xs text-zinc-500">
                  {r.max_power_kw ? `Up to ${Number(r.max_power_kw)} kW` : "Power not listed"}
                  {r.is_bookable ? " · Bookable" : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                {info ? (
                  <>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLS[info.tone]}`}>
                      {info.label}{r.live_error_code && r.live_status === "faulted" ? ` (${r.live_error_code})` : ""}
                    </span>
                    <span className="text-[11px] text-zinc-500">{provenance(r.live_is_simulated)} · {secondsAgo(r.live_status_at!, now)}</span>
                  </>
                ) : (
                  <span className="text-xs text-zinc-400">{r.is_connected ? "No recent status" : "No live status"}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
