/** Live charger data helpers (pure). Live = reported by a connected charger; never inferred. */

export type LiveStatus =
  | "available" | "preparing" | "charging" | "suspended_ev" | "suspended_evse" | "finishing" | "reserved" | "unavailable" | "faulted";

export type EvseLive = {
  evse_id: string;
  station_id: string;
  label: string;
  max_power_kw: number | null;
  is_bookable: boolean;
  is_connected: boolean;
  live_status: LiveStatus | null;
  live_status_at: string | null;
  live_error_code: string | null;
  live_source: "charger_ocpp" | "operator_api" | null;
  live_is_simulated: boolean;
  is_fresh: boolean;
};

export const LIVE_STALE_MS = 15 * 60_000;

export const LIVE_LABEL: Record<LiveStatus, { label: string; tone: "free" | "busy" | "warn" | "off" }> = {
  available: { label: "Available", tone: "free" },
  preparing: { label: "Plugging in", tone: "busy" },
  charging: { label: "Charging", tone: "busy" },
  suspended_ev: { label: "Paused by vehicle", tone: "busy" },
  suspended_evse: { label: "Paused by charger", tone: "busy" },
  finishing: { label: "Finishing", tone: "busy" },
  reserved: { label: "Reserved", tone: "busy" },
  unavailable: { label: "Unavailable", tone: "off" },
  faulted: { label: "Out of order", tone: "warn" },
};

export const TONE_CLS = {
  free: "bg-energy-100 text-energy-800 ring-energy-600/20 dark:bg-energy-500/15 dark:text-energy-300",
  busy: "bg-charge-50 text-charge-600 ring-charge-300/50 dark:bg-charge-500/10 dark:text-charge-300",
  warn: "bg-rose-100 text-rose-800 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300",
  off: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

export function isFresh(at: string | null | undefined, now = Date.now()) {
  return !!at && now - Date.parse(at) <= LIVE_STALE_MS;
}

/** "Live" vs "Simulated" — the provenance label every live value carries. */
export const provenance = (simulated: boolean | null | undefined) => (simulated ? "Simulated" : "Live");

export function secondsAgo(at: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

/** Minutes to reach a target SoC at the current power (null if anything is unknown). */
export function minutesToTarget(socPercent: number | null, targetPercent: number, batteryKwh: number | null, powerKw: number | null) {
  if (socPercent === null || batteryKwh === null || !powerKw || powerKw <= 0) return null;
  if (socPercent >= targetPercent) return 0;
  return Math.round((((targetPercent - socPercent) / 100) * batteryKwh / powerKw) * 60);
}

export type LiveSample = { t: string; wh: number | null; w: number | null; soc: number | null };
export type LiveSessionData = {
  now: string;
  cost_so_far_minor: number | null;
  session: {
    id: string;
    status: "in_progress" | "completed" | "failed";
    started_at: string;
    ended_at: string | null;
    energy_kwh: number | null;
    total_cost_minor: number | null;
    currency: string;
    last_power_kw: number | null;
    last_soc_percent: number | null;
    start_soc_percent: number | null;
    last_meter_at: string | null;
    stop_reason: string | null;
    is_simulated: boolean;
    source: string;
  };
  booking: { id: string; reference: string; status: string; start: string; end: string; currency: string; energy_unit_price_minor: number | null } | null;
  station: { id: string; name: string; time_zone: string; address: string | null } | null;
  evse: { id: string; label: string; max_power_kw: number | null; live_status: LiveStatus | null; live_status_at: string | null } | null;
  vehicle: { id: string; label: string; battery_capacity_kwh: number | null } | null;
  pending_command: { action: string; status: string; created_at: string } | null;
  samples: LiveSample[];
};

/** What the live screen is waiting for when there's no session yet. */
export type StartState =
  | { state: "none" }
  | { state: "waiting"; since: string }
  | { state: "rejected" | "expired"; at: string };
