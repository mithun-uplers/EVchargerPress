import { describe, expect, it } from "vitest";
import {
  averagePricePerKwhMinor, buildHistory, chargeEstimate, efficiencyKwhPer100Km, formatDuration, monthKey, normalisePeriod,
  monthlyTrend, periodKeys, toHistoryItems, type HistoryItem,
} from "@/lib/charging-stats";

const IST = "Asia/Kolkata";
const s = (over: Partial<HistoryItem>): HistoryItem => ({
  id: crypto.randomUUID(), kind: "session", start: "2026-10-14T17:45:00Z", end: "2026-10-14T19:15:00Z", timeZone: IST,
  costMinor: 52000, energyKwh: 24.5, currency: "INR", title: "Demo Hub", subtitle: null, source: "manual", ...over,
});

describe("periods", () => {
  it("uses the local month (IST rolls over before UTC)", () => {
    expect(monthKey("2026-10-31T19:00:00Z", IST)).toBe("2026-11");
    expect(monthKey("2026-10-31T19:00:00Z", "UTC")).toBe("2026-10");
  });
  it("lists recent months and years newest first", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    expect(periodKeys("month", now, IST, 4)).toEqual(["2026-10", "2026-09", "2026-08", "2026-07"]);
    expect(periodKeys("month", new Date("2026-01-05T00:00:00Z"), IST, 2)).toEqual(["2026-01", "2025-12"]);
    expect(periodKeys("year", now, IST)).toEqual(["2026", "2025", "2024"]);
  });
  it("rejects malformed periods", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    expect(normalisePeriod("month", "2026-13", now, IST)).toBe("2026-10");
    expect(normalisePeriod("year", "20x6", now, IST)).toBe("2026");
    expect(normalisePeriod("month", "2026-03", now, IST)).toBe("2026-03");
  });
});

describe("buildHistory", () => {
  const items = [
    s({ start: "2026-10-14T17:45:00Z", costMinor: 52000, energyKwh: 24.5 }), // 14 Oct 23:15 IST
    s({ start: "2026-10-14T19:00:00Z", costMinor: 30000, energyKwh: 15 }), // 15 Oct 00:30 IST — next local day
    s({ kind: "estimate", source: "booking_estimate", start: "2026-10-20T04:30:00Z", costMinor: 74718, energyKwh: 32.4 }),
    s({ start: "2026-09-02T04:30:00Z", costMinor: 10000, energyKwh: 5 }),
  ];
  it("keeps actual and estimated totals separate", () => {
    const h = buildHistory(items, "month", "2026-10", "cost");
    expect(h.sessions).toBe(2);
    expect(h.estimates).toBe(1);
    expect(h.actualCostMinor).toBe(82000);
    expect(h.estimateCostMinor).toBe(74718);
    expect(h.actualKwh).toBe(39.5);
    expect(h.estimateKwh).toBe(32.4);
  });
  it("puts each session on its local calendar day", () => {
    const h = buildHistory(items, "month", "2026-10", "energy");
    expect(h.bars).toHaveLength(31);
    expect(h.bars[13]).toEqual({ label: "14", actual: 24.5, estimate: 0 });
    expect(h.bars[14]).toEqual({ label: "15", actual: 15, estimate: 0 });
    expect(h.bars[19].estimate).toBe(32.4);
  });
  it("aggregates a year by month and sorts items newest first", () => {
    const h = buildHistory(items, "year", "2026", "cost");
    expect(h.bars).toHaveLength(12);
    expect(h.bars[9].actual).toBe(820);
    expect(h.bars[8].actual).toBe(100);
    expect(h.items.map((i) => i.start)).toEqual([...items.map((i) => i.start)].sort().reverse());
  });
  it("returns empty bars for a period with no data", () => {
    const h = buildHistory(items, "month", "2026-02", "cost");
    expect(h.bars).toHaveLength(28);
    expect(h.items).toEqual([]);
  });
});

describe("estimates", () => {
  it("averages the price paid per kWh from sessions only", () => {
    expect(averagePricePerKwhMinor([s({ costMinor: 52000, energyKwh: 26 }), s({ costMinor: 18000, energyKwh: 9 }),
      s({ kind: "estimate", source: "booking_estimate", costMinor: 999999, energyKwh: 1 })])).toBe(2000);
    expect(averagePricePerKwhMinor([s({ energyKwh: null })])).toBeNull();
  });
  it("estimates energy, time and cost to 80% and refuses to guess missing specs", () => {
    expect(chargeEstimate({ socPercent: 48, batteryKwh: 40, powerKw: 50, pricePerKwhMinor: 2000 }))
      .toEqual({ kwh: 12.8, minutes: 19, costMinor: 25600, target: 80 });
    expect(chargeEstimate({ socPercent: 48, batteryKwh: null, powerKw: 50, pricePerKwhMinor: 2000 })).toBeNull();
    expect(chargeEstimate({ socPercent: 90, batteryKwh: 40, powerKw: null, pricePerKwhMinor: null }))
      .toEqual({ kwh: 0, minutes: null, costMinor: null, target: 80 });
  });
  it("computes kWh/100 km only with enough distance and charging data", () => {
    const odo = [{ recorded_at: "2026-10-01T00:00:00Z", odometer_km: 10000 }, { recorded_at: "2026-10-28T00:00:00Z", odometer_km: 10400 }];
    expect(efficiencyKwhPer100Km(odo, [s({ start: "2026-10-10T00:00:00Z", energyKwh: 30 }), s({ start: "2026-10-20T00:00:00Z", energyKwh: 30 })])).toBe(15);
    expect(efficiencyKwhPer100Km(odo.slice(0, 1), [])).toBeNull();
    expect(efficiencyKwhPer100Km([odo[0], { recorded_at: "2026-10-02T00:00:00Z", odometer_km: 10010 }], [])).toBeNull();
  });
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatDuration(null)).toBeNull();
  });
});

describe("toHistoryItems", () => {
  const station = { name: "Demo Hub", time_zone: IST, address: "SG Highway", city: "Ahmedabad", operator: "VoltGrid" };
  it("keeps sessions actual and turns uncovered finished bookings into estimates", () => {
    const items = toHistoryItems(
      [{ id: "s1", started_at: "2026-10-14T17:45:00Z", ended_at: null, energy_kwh: "24.5", total_cost_minor: 52000, currency: "INR",
        source: "manual", booking: { reference: "EVB-1" }, vehicle: null, station }],
      [
        { id: "b1", reference: "EVB-1", start: "2026-10-14T17:30:00Z", end: "2026-10-14T18:30:00Z", currency: "INR", estimatedTotalMinor: 70000, estimatedKwh: 30, station, vehicle: null },
        { id: "b2", reference: "EVB-2", start: "2026-10-20T04:30:00Z", end: "2026-10-20T05:30:00Z", currency: "INR", estimatedTotalMinor: 74718, estimatedKwh: 32.4, station, vehicle: null },
      ],
    );
    expect(items.map((i) => [i.id, i.kind])).toEqual([["b2", "estimate"], ["s1", "session"]]);
    expect(items[1].energyKwh).toBe(24.5);
    expect(items[1].title).toBe("VoltGrid");
    expect(items[1].subtitle).toBe("Demo Hub · SG Highway, Ahmedabad");
  });
  it("builds a monthly trend oldest first", () => {
    const t = monthlyTrend([s({ start: "2026-10-14T17:45:00Z", energyKwh: 10 })], new Date("2026-10-28T00:00:00Z"), IST, 3);
    expect(t.map((m) => m.key)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(t[2].kwh).toBe(10);
  });
});
