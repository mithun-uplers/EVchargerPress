import { describe, expect, it } from "vitest";
import { haversineKm, parseLatLng, planRoute, stationPowerKw, thin, type RouteStation } from "@/lib/route-plan";

const st = (along: number, over: Partial<RouteStation> = {}): RouteStation => ({
  id: `s${along}`, name: `Station ${along}`, lat: 0, lng: 0, address: null, city: null, operator: null, is_bookable: false,
  max_power_kw: 60, connector_types: ["CCS2"], live_evse_count: null, live_available_count: null, live_is_simulated: null,
  along_km: along, detour_km: 0.5, ...over,
});
// 40 kWh battery, 15 kWh/100 km → 1 % ≈ 2.67 km, 100 % ≈ 267 km.
const base = { batteryKwh: 40, consumptionKwhPer100Km: 15, vehicleConnectors: ["CCS2"], vehicleMaxDcKw: 50, vehicleMaxAcKw: 7.2 };

describe("planRoute", () => {
  it("needs no stop when the trip fits within the battery and reserve", () => {
    const p = planRoute({ ...base, distanceKm: 150, startSocPct: 80, stations: [st(70)] });
    expect(p.ok && p.stops).toEqual([]);
    expect(p.ok && p.arriveSocPct).toBeCloseTo(23.8, 1);
  });

  it("plans a stop at the farthest good charger in range and charges just enough", () => {
    const p = planRoute({ ...base, distanceKm: 300, startSocPct: 90, stations: [st(60), st(150), st(170, { max_power_kw: 7.4 }), st(250)] });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.stops.map((s) => s.station.id)).toEqual(["s150"]); // 170 is AC-only; 250 is out of range
    const stop = p.stops[0];
    expect(stop.powerKw).toBe(50);
    expect(stop.arriveSocPct).toBeGreaterThanOrEqual(15);
    expect(stop.departSocPct).toBeLessThanOrEqual(80);
    expect(p.arriveSocPct).toBeGreaterThanOrEqual(15);
    expect(stop.chargeMinutes).toBe(Math.round((stop.energyKwh / 40) * 60));
  });

  it("ignores incompatible chargers and reports a gap", () => {
    const p = planRoute({ ...base, distanceKm: 400, startSocPct: 60, stations: [st(100, { connector_types: ["Type 2"] })] });
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.compatibleStations).toBe(0);
    expect(p.gapFromKm).toBe(0);
    expect(p.gapToKm).toBeCloseTo(120, 0);
  });

  it("chains several stops on a long trip", () => {
    const stations = Array.from({ length: 12 }, (_, i) => st(60 * (i + 1)));
    const p = planRoute({ ...base, distanceKm: 700, startSocPct: 80, stations });
    expect(p.ok).toBe(true);
    expect(p.ok && p.stops.length).toBeGreaterThanOrEqual(3);
    if (p.ok) for (const s of p.stops) expect(s.arriveSocPct).toBeGreaterThanOrEqual(14.9);
  });
});

describe("route helpers", () => {
  it("limits power by vehicle AC/DC maximum and doesn't guess unknown power", () => {
    expect(stationPowerKw({ max_power_kw: 120 }, 50, 7.2)).toBe(50);
    expect(stationPowerKw({ max_power_kw: 22 }, 50, 7.2)).toBe(7.2);
    expect(stationPowerKw({ max_power_kw: null }, 50, 7.2)).toBeNull();
  });
  it("thins polylines and measures distance", () => {
    const line = Array.from({ length: 1000 }, (_, i) => [i, 0] as [number, number]);
    const t = thin(line, 100);
    expect(t).toHaveLength(100);
    expect(t[0]).toEqual([0, 0]);
    expect(t.at(-1)).toEqual([999, 0]);
    expect(haversineKm([72.5714, 23.0225], [72.8311, 21.1702])).toBeCloseTo(207, -1);
  });
  it("parses typed coordinates", () => {
    expect(parseLatLng("23.0225, 72.5714")).toEqual([72.5714, 23.0225]);
    expect(parseLatLng("Surat")).toBeNull();
    expect(parseLatLng("123, 72")).toBeNull();
  });
});
