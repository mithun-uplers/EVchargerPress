/**
 * Charging analytics over recorded sessions only (pure). Booking estimates are excluded so the
 * numbers describe what was actually charged.
 */
import { monthKey, periodKeys, type HistoryItem } from "@/lib/charging-stats";

const DC_MIN_KW = 25;
const r1 = (n: number) => Math.round(n * 10) / 10;

export type Analytics = ReturnType<typeof chargingAnalytics>;

function localParts(iso: string, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(iso));
  const hour = Number(p.find((x) => x.type === "hour")!.value);
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.find((x) => x.type === "weekday")!.value);
  return { hour, wd };
}

export function chargingAnalytics(all: HistoryItem[], now: Date, timeZone = "Asia/Kolkata", months = 12) {
  const keys = periodKeys("month", now, timeZone, months).reverse();
  const first = keys[0];
  const items = all.filter((i) => i.kind === "session" && monthKey(i.start, i.timeZone) >= first);

  let kwh = 0, cost = 0, pricedKwh = 0, pricedCost = 0, minutes = 0, timedKwh = 0, timedHours = 0;
  const monthly = new Map(keys.map((k) => [k, { key: k, kwh: 0, costMinor: 0, pricedKwh: 0, pricedCost: 0, sessions: 0 }]));
  const hours = Array.from({ length: 24 }, () => 0);
  const weekdays = Array.from({ length: 7 }, () => 0);
  const stations = new Map<string, { title: string; subtitle: string | null; sessions: number; kwh: number; costMinor: number; pricedKwh: number; pricedCost: number }>();
  const power = { ac: 0, dc: 0, unknown: 0 };
  const sources = { manual: 0, charger: 0, simulated: 0 };

  for (const i of items) {
    const e = i.energyKwh ?? 0;
    kwh += e;
    cost += i.costMinor ?? 0;
    const priced = i.energyKwh && i.energyKwh > 0 && i.costMinor !== null;
    if (priced) { pricedKwh += e; pricedCost += i.costMinor!; }
    if (i.end) {
      const m = (Date.parse(i.end) - Date.parse(i.start)) / 60000;
      minutes += m;
      if (e > 0 && m > 0) { timedKwh += e; timedHours += m / 60; }
    }
    const mm = monthly.get(monthKey(i.start, i.timeZone));
    if (mm) {
      mm.kwh += e; mm.costMinor += i.costMinor ?? 0; mm.sessions++;
      if (priced) { mm.pricedKwh += e; mm.pricedCost += i.costMinor!; }
    }
    const { hour, wd } = localParts(i.start, i.timeZone);
    hours[hour]++;
    if (wd >= 0) weekdays[wd]++;
    const k = `${i.title}|${i.subtitle ?? ""}`;
    const st = stations.get(k) ?? { title: i.title, subtitle: i.subtitle, sessions: 0, kwh: 0, costMinor: 0, pricedKwh: 0, pricedCost: 0 };
    st.sessions++; st.kwh += e; st.costMinor += i.costMinor ?? 0;
    if (priced) { st.pricedKwh += e; st.pricedCost += i.costMinor!; }
    stations.set(k, st);
    if (i.chargerKw == null) power.unknown += e;
    else if (i.chargerKw >= DC_MIN_KW) power.dc += e;
    else power.ac += e;
    if (i.isSimulated) sources.simulated++;
    else if (i.source === "manual") sources.manual++;
    else sources.charger++;
  }

  const n = items.length;
  return {
    from: first,
    sessions: n,
    kwh: r1(kwh),
    costMinor: cost,
    pricePerKwhMinor: pricedKwh > 0 ? Math.round(pricedCost / pricedKwh) : null,
    avgKwh: n ? r1(kwh / n) : null,
    avgMinutes: n && minutes ? Math.round(minutes / items.filter((i) => i.end).length) : null,
    avgPowerKw: timedHours > 0 ? r1(timedKwh / timedHours) : null,
    monthly: [...monthly.values()].map((m) => ({
      key: m.key,
      label: new Date(`${m.key}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
      kwh: r1(m.kwh),
      costMinor: m.costMinor,
      sessions: m.sessions,
      pricePerKwhMinor: m.pricedKwh > 0 ? Math.round(m.pricedCost / m.pricedKwh) : null,
    })),
    hours,
    weekdays,
    topStations: [...stations.values()]
      .sort((a, b) => b.kwh - a.kwh)
      .slice(0, 5)
      .map((s) => ({ ...s, kwh: r1(s.kwh), pricePerKwhMinor: s.pricedKwh > 0 ? Math.round(s.pricedCost / s.pricedKwh) : null })),
    power: { ac: r1(power.ac), dc: r1(power.dc), unknown: r1(power.unknown) },
    sources,
  };
}

/** e.g. "Most of your charging starts between 18:00 and 21:00". Null when there's too little data. */
export function busiestWindow(hours: number[], width = 3) {
  const total = hours.reduce((a, b) => a + b, 0);
  if (total < 3) return null;
  let best = 0, bestSum = -1;
  for (let h = 0; h < 24; h++) {
    let sum = 0;
    for (let k = 0; k < width; k++) sum += hours[(h + k) % 24];
    if (sum > bestSum) { bestSum = sum; best = h; }
  }
  const pad = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  return { from: pad(best), to: pad(best + width), share: Math.round((bestSum / total) * 100) };
}
