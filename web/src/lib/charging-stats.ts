/**
 * Pure helpers for the charging history and EV dashboard. No I/O, so they are unit-tested
 * and also drive the design-preview screens.
 *
 * Two kinds of rows:
 *  - "session":  a recorded charging session (manual entry, operator API or charger) — actual values.
 *  - "estimate": a finished booking with no recorded session — values come from the booking's price
 *                snapshot and are always shown as estimates (prefixed "~").
 */

export type HistoryItem = {
  id: string;
  kind: "session" | "estimate";
  start: string; // ISO UTC
  end: string | null;
  timeZone: string;
  costMinor: number | null;
  energyKwh: number | null;
  currency: string;
  title: string; // operator or station name
  subtitle: string | null; // address
  source: "manual" | "operator_api" | "charger_ocpp" | "booking_estimate";
  reference?: string | null;
  vehicleId?: string | null;
  vehicleLabel?: string | null;
  href?: string | null;
};

export type HistoryView = "month" | "year";
export type HistoryMetric = "cost" | "energy";

/** "2026-10" in the given zone. */
export function monthKey(iso: string, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}
function dayOfMonth(iso: string, timeZone: string) {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone, day: "numeric" }).format(new Date(iso)));
}
function daysIn(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Period keys to offer as tabs, newest first. */
export function periodKeys(view: HistoryView, now: Date, timeZone: string, count = view === "month" ? 6 : 3) {
  const current = monthKey(now.toISOString(), timeZone);
  const [y, m] = current.split("-").map(Number);
  if (view === "year") return Array.from({ length: count }, (_, i) => String(y - i));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function normalisePeriod(view: HistoryView, raw: string | undefined, now: Date, timeZone: string) {
  const valid = view === "month" ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}$/;
  return raw && valid.test(raw) ? raw : periodKeys(view, now, timeZone, 1)[0];
}

export type Bar = { label: string; actual: number; estimate: number };

export type HistorySummary = {
  period: string;
  view: HistoryView;
  metric: HistoryMetric;
  currency: string;
  actualCostMinor: number;
  estimateCostMinor: number;
  actualKwh: number;
  estimateKwh: number;
  sessions: number;
  estimates: number;
  bars: Bar[];
  items: HistoryItem[];
};

/** Filters items to a period and aggregates them into summary totals and chart bars. */
export function buildHistory(all: HistoryItem[], view: HistoryView, period: string, metric: HistoryMetric, currency = "INR"): HistorySummary {
  const items = all
    .filter((i) => (view === "month" ? monthKey(i.start, i.timeZone) === period : monthKey(i.start, i.timeZone).startsWith(`${period}-`)))
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

  const bars: Bar[] =
    view === "month"
      ? Array.from({ length: daysIn(period) }, (_, d) => ({ label: String(d + 1), actual: 0, estimate: 0 }))
      : Array.from({ length: 12 }, (_, m) => ({
          label: new Date(Date.UTC(2000, m, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
          actual: 0,
          estimate: 0,
        }));

  const s = { actualCostMinor: 0, estimateCostMinor: 0, actualKwh: 0, estimateKwh: 0, sessions: 0, estimates: 0 };
  for (const i of items) {
    const value = metric === "cost" ? (i.costMinor ?? 0) / 100 : i.energyKwh ?? 0;
    const idx = view === "month" ? dayOfMonth(i.start, i.timeZone) - 1 : Number(monthKey(i.start, i.timeZone).slice(5)) - 1;
    if (i.kind === "session") {
      s.sessions++;
      s.actualCostMinor += i.costMinor ?? 0;
      s.actualKwh += i.energyKwh ?? 0;
      bars[idx].actual += value;
    } else {
      s.estimates++;
      s.estimateCostMinor += i.costMinor ?? 0;
      s.estimateKwh += i.energyKwh ?? 0;
      bars[idx].estimate += value;
    }
  }
  s.actualKwh = Math.round(s.actualKwh * 10) / 10;
  s.estimateKwh = Math.round(s.estimateKwh * 10) / 10;
  return { period, view, metric, currency, ...s, bars, items };
}

/** Average price actually paid per kWh across sessions that record both energy and cost. */
export function averagePricePerKwhMinor(items: HistoryItem[]) {
  let kwh = 0;
  let cost = 0;
  for (const i of items) {
    if (i.kind === "session" && i.energyKwh && i.energyKwh > 0 && i.costMinor !== null) {
      kwh += i.energyKwh;
      cost += i.costMinor;
    }
  }
  return kwh > 0 ? Math.round(cost / kwh) : null;
}

/**
 * Estimate to charge from the last reading to a target %, using battery size, a charging
 * power and a price per kWh. Returns null when any input is unknown — we never guess specs.
 */
export function chargeEstimate(input: {
  socPercent: number | null;
  targetPercent?: number;
  batteryKwh: number | null;
  powerKw: number | null;
  pricePerKwhMinor: number | null;
}) {
  const target = input.targetPercent ?? 80;
  if (input.socPercent === null || input.batteryKwh === null) return null;
  const kwh = Math.max(0, ((target - input.socPercent) / 100) * input.batteryKwh);
  const minutes = input.powerKw ? Math.round((kwh / (input.powerKw * 0.8)) * 60) : null; // ~80% average draw
  const costMinor = input.pricePerKwhMinor !== null ? Math.round(kwh * input.pricePerKwhMinor) : null;
  return { kwh: Math.round(kwh * 10) / 10, minutes, costMinor, target };
}

/** Energy per 100 km between the first and last odometer reading, if sessions cover that span. */
export function efficiencyKwhPer100Km(
  odometer: { recorded_at: string; odometer_km: number }[],
  items: HistoryItem[],
): number | null {
  const pts = [...odometer].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  if (pts.length < 2) return null;
  const km = pts.at(-1)!.odometer_km - pts[0].odometer_km;
  if (km < 50) return null; // too short to say anything useful
  const from = Date.parse(pts[0].recorded_at);
  const to = Date.parse(pts.at(-1)!.recorded_at);
  const kwh = items
    .filter((i) => i.kind === "session" && i.energyKwh && Date.parse(i.start) > from && Date.parse(i.start) <= to)
    .reduce((a, i) => a + (i.energyKwh ?? 0), 0);
  return kwh > 0 ? Math.round((kwh / km) * 1000) / 10 : null;
}

export function formatDuration(minutes: number | null) {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/* ---------- Mapping database rows to history items (pure, so previews and tests can use it) ---------- */

export type SessionInput = {
  id: string;
  started_at: string;
  ended_at: string | null;
  energy_kwh: number | string | null;
  total_cost_minor: number | null;
  currency: string;
  source: "manual" | "operator_api" | "charger_ocpp";
  booking: { id?: string; reference: string } | null;
  vehicle: { id?: string; make: string; model: string; nickname: string | null } | null;
  station: { name: string; time_zone: string; address?: string | null; city?: string | null; operator?: string | null } | null;
};

export type FinishedBookingInput = {
  id: string;
  reference: string;
  start: string;
  end: string;
  currency: string;
  estimatedTotalMinor: number;
  estimatedKwh: number | null;
  station: { name: string; time_zone: string; address?: string | null; city?: string | null; operator?: string | null } | null;
  vehicle: { id?: string; make: string; model: string; nickname: string | null } | null;
};

const vLabel = (v: { make: string; model: string; nickname: string | null } | null) => (v ? v.nickname || `${v.make} ${v.model}` : null);
const place = (s: { address?: string | null; city?: string | null } | null) =>
  s ? [s.address, s.city].filter(Boolean).join(", ") || null : null;

/**
 * Sessions become actual items. Completed bookings with no recorded session become estimate
 * items from their frozen price snapshot, so spending isn't silently missing — but they are
 * never counted as actual cost or energy.
 */
export function toHistoryItems(sessions: SessionInput[], finished: FinishedBookingInput[] = []): HistoryItem[] {
  const covered = new Set(sessions.map((s) => s.booking?.reference).filter(Boolean));
  const fromSessions: HistoryItem[] = sessions.map((s) => ({
    id: s.id,
    kind: "session",
    start: s.started_at,
    end: s.ended_at,
    timeZone: s.station?.time_zone ?? "Asia/Kolkata",
    costMinor: s.total_cost_minor,
    energyKwh: s.energy_kwh === null ? null : Number(s.energy_kwh),
    currency: s.currency,
    title: s.station?.operator || s.station?.name || "Charging session",
    subtitle: s.station ? [s.station.operator ? s.station.name : null, place(s.station)].filter(Boolean).join(" · ") || null : null,
    source: s.source,
    reference: s.booking?.reference ?? null,
    vehicleId: s.vehicle?.id ?? null,
    vehicleLabel: vLabel(s.vehicle),
    href: s.booking ? `/bookings/${s.booking.reference}` : null,
  }));
  const fromBookings: HistoryItem[] = finished
    .filter((b) => !covered.has(b.reference))
    .map((b) => ({
      id: b.id,
      kind: "estimate",
      start: b.start,
      end: b.end,
      timeZone: b.station?.time_zone ?? "Asia/Kolkata",
      costMinor: b.estimatedTotalMinor,
      energyKwh: b.estimatedKwh,
      currency: b.currency,
      title: b.station?.operator || b.station?.name || "Charging booking",
      subtitle: b.station ? [b.station.operator ? b.station.name : null, place(b.station)].filter(Boolean).join(" · ") || null : null,
      source: "booking_estimate",
      reference: b.reference,
      vehicleId: b.vehicle?.id ?? null,
      vehicleLabel: vLabel(b.vehicle),
      href: `/bookings/${b.reference}`,
    }));
  return [...fromSessions, ...fromBookings].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
}

/** Totals for the last `count` months (oldest first) — for small trend charts. */
export function monthlyTrend(items: HistoryItem[], now: Date, timeZone: string, count = 6) {
  return periodKeys("month", now, timeZone, count)
    .reverse()
    .map((key) => {
      const h = buildHistory(items, "month", key, "energy");
      return {
        key,
        label: new Date(`${key}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
        kwh: h.actualKwh,
        estimateKwh: h.estimateKwh,
        costMinor: h.actualCostMinor,
        estimateCostMinor: h.estimateCostMinor,
      };
    });
}
