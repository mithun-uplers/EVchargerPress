import { describe, expect, it } from "vitest";
import { extractSignals, hasAnyValue, toReading } from "@/lib/smartcar-signals";

const sig = (code: string, body: object, status = "SUCCESS", at = "2026-10-28T09:00:00Z") => ({
  id: code, type: "signal", attributes: { code, status: { value: status }, body }, meta: { oemUpdatedAt: at, retrievedAt: "2026-10-28T09:00:05Z" },
});

describe("Smartcar v3 signals", () => {
  it("maps battery, range, odometer, charging and location", () => {
    const json = { data: [
      sig("tractionbattery-stateofcharge", { value: 72.5, unit: "percent" }),
      sig("tractionbattery-range", { value: 180, unit: "miles", type: "DEFAULT" }),
      sig("odometer-traveleddistance", { value: 15234.5, unit: "km" }),
      sig("charge-ischarging", { value: true }),
      sig("charge-ischargingcableconnected", { value: true }),
      sig("charge-wattage", { value: 7200, unit: "watts" }),
      sig("charge-chargelimits", { activeLimit: 90, unit: "percent", values: [] }),
      sig("location-preciselocation", { latitude: 12.9716, longitude: 77.5946, heading: 90 }),
    ] };
    expect(toReading(extractSignals(json))).toEqual({
      recorded_at: "2026-10-28T09:00:00Z", soc_percent: 72.5, range_km: 289.7, odometer_km: 15234.5, is_charging: true, is_plugged_in: true,
      charge_power_kw: 7.2, charge_limit_percent: 90, latitude: 12.9716, longitude: 77.5946,
    });
  });
  it("ignores failed or unsupported signals instead of guessing", () => {
    const r = toReading(extractSignals({ data: [
      sig("tractionbattery-stateofcharge", { value: 50 }, "ERROR"),
      sig("odometer-traveleddistance", { value: "n/a" }),
      { attributes: { code: "x" } },
      null,
    ] }));
    expect(r.soc_percent).toBeNull();
    expect(r.odometer_km).toBeNull();
    expect(hasAnyValue(r)).toBe(false);
  });
  it("accepts single-signal responses too", () => {
    const r = toReading(extractSignals([{ data: sig("tractionbattery-stateofcharge", { value: 101 }) }, { data: sig("charge-ischarging", { value: false }) }]));
    expect(r.soc_percent).toBeNull(); // out of range
    expect(r.is_charging).toBe(false);
  });
});
