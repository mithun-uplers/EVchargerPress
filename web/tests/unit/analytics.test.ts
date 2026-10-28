import { describe, expect, it } from "vitest";
import { busiestWindow, chargingAnalytics } from "@/lib/analytics";
import type { HistoryItem } from "@/lib/charging-stats";

const IST = "Asia/Kolkata";
const s = (o: Partial<HistoryItem>): HistoryItem => ({
  id: crypto.randomUUID(), kind: "session", start: "2026-10-14T13:00:00Z", end: "2026-10-14T14:00:00Z", timeZone: IST,
  costMinor: 40000, energyKwh: 20, currency: "INR", title: "Hub A", subtitle: null, source: "manual", chargerKw: 60, ...o,
});
const NOW = new Date("2026-10-28T10:00:00Z");

describe("chargingAnalytics", () => {
  const items = [
    s({}),
    s({ start: "2026-10-20T13:30:00Z", end: "2026-10-20T15:30:00Z", energyKwh: 14, costMinor: 21000, title: "Hub B", chargerKw: 7.4, source: "charger_ocpp", isSimulated: true }),
    s({ start: "2026-09-02T03:00:00Z", end: null, energyKwh: 10, costMinor: null, chargerKw: null }),
    s({ kind: "estimate", source: "booking_estimate", energyKwh: 99, costMinor: 999999 }),
    s({ start: "2025-08-01T03:00:00Z" }), // outside the 12-month window
  ];
  const a = chargingAnalytics(items, NOW, IST);
  it("summarises recorded sessions only, within the window", () => {
    expect(a.sessions).toBe(3);
    expect(a.kwh).toBe(44);
    expect(a.costMinor).toBe(61000);
    expect(a.pricePerKwhMinor).toBe(Math.round(61000 / 34)); // unpriced session excluded
    expect(a.avgPowerKw).toBe(r(34 / 3));
  });
  it("splits by month, hour (station time), power class and source", () => {
    expect(a.monthly).toHaveLength(12);
    expect(a.monthly.at(-1)).toMatchObject({ key: "2026-10", kwh: 34, sessions: 2 });
    expect(a.hours[18]).toBe(1); // 13:00Z = 18:30 IST
    expect(a.hours[19]).toBe(1); // 13:30Z = 19:00 IST
    expect(a.power).toEqual({ ac: 14, dc: 20, unknown: 10 });
    expect(a.sources).toEqual({ manual: 2, charger: 0, simulated: 1 });
    expect(a.topStations[0]).toMatchObject({ title: "Hub A", sessions: 2, kwh: 30 });
  });
  it("finds the busiest window", () => {
    expect(busiestWindow(a.hours)).toEqual({ from: "17:00", to: "20:00", share: 67 });
    expect(busiestWindow(Array(24).fill(0))).toBeNull();
  });
});
const r = (n: number) => Math.round(n * 10) / 10;
