import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LineChart } from "@/components/charging/VehicleVisuals";
import { axisRange } from "@/lib/chart";

describe("chart axes", () => {
  it("gives distinct gridlines for a flat series (used to produce duplicate React keys)", () => {
    const r = axisRange([12000, 12000, 12000]);
    expect(new Set(r.ticks).size).toBe(r.ticks.length);
    expect(r.ticks.length).toBe(3);
    expect(r.lo).toBeLessThan(12000);
    expect(r.hi).toBeGreaterThan(12000);
  });
  it("respects fixed bounds and dedupes ticks", () => {
    expect(axisRange([40, 60], 0, 100).ticks).toEqual([100, 50, 0]);
    expect(axisRange([0, 0], 0).ticks.length).toBe(3);
  });
  it("renders dates in the given time zone", () => {
    const html = renderToString(createElement(LineChart, {
      points: [{ t: "2026-10-27T20:00:00Z", v: 1 }, { t: "2026-10-28T10:00:00Z", v: 1 }], label: "x", format: String, timeZone: "Asia/Kolkata",
    }));
    expect(html).toContain("28 Oct"); // 20:00 UTC on the 27th is the 28th in IST
  });
});
