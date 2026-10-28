import { describe, expect, it } from "vitest";
import { recommend, type RecCandidate } from "@/lib/recommend";

const c = (o: Partial<RecCandidate>): RecCandidate => ({
  id: crypto.randomUUID(), name: "S", city: null, operator: null, is_bookable: false, max_power_kw: 60, connector_types: ["CCS2"],
  last_status: null, live_evse_count: null, live_available_count: null, live_is_simulated: null, distance_km: null,
  energy_price_minor: null, visits: 0, ...o,
});
const ctx = { vehicleConnectors: ["CCS2"], vehicleMaxDcKw: 50, avgPricePaidMinor: 2000 };

describe("recommend", () => {
  it("never recommends incompatible or broken stations", () => {
    const r = recommend([c({ connector_types: ["Type 2"], distance_km: 1 }), c({ last_status: "broken", distance_km: 1 })], ctx);
    expect(r).toEqual([]);
  });
  it("ranks near, free, bookable, familiar and cheaper stations higher, with reasons", () => {
    const near = c({ name: "Near free", distance_km: 2, live_evse_count: 2, live_available_count: 1, is_bookable: true });
    const far = c({ name: "Far", distance_km: 22 });
    const fav = c({ name: "Favourite", distance_km: 10, visits: 4, energy_price_minor: 1700 });
    const r = recommend([far, fav, near], ctx);
    expect(r.map((x) => x.station.name)).toEqual(["Near free", "Favourite", "Far"]);
    expect(r[0].reasons[0]).toBe("2.0 km away");
    expect(r[0].reasons).toContain("1 of 2 free now");
    expect(r[1].reasons).toContain("You’ve charged here 4 times");
    expect(r[1].reasons.some((x) => x.includes("below your average"))).toBe(true);
  });
  it("marks simulated live data and penalises fully busy stations", () => {
    const busy = c({ name: "Busy", distance_km: 1, live_evse_count: 2, live_available_count: 0, live_is_simulated: true });
    const idle = c({ name: "Idle", distance_km: 3 });
    const r = recommend([busy, idle], ctx);
    expect(r[0].station.name).toBe("Idle");
    expect(r[1].warnings).toContain("All 2 busy right now (simulated)");
  });
});
