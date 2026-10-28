import { afterAll, describe, expect, it } from "vitest";
import { asUser, db, errorCode, expectOk } from "./helpers";

afterAll(() => db.end());

describe("stations along a route", () => {
  it("finds stations within the buffer, ordered by distance along the route", async () => {
    const tag = crypto.randomUUID().slice(0, 6);
    // A straight route due north along lng 80.0 from lat 10.0 to 11.0 (~111 km).
    const pts = [
      { name: `Near start ${tag}`, lat: 10.1, lng: 80.01 },   // ~1 km off, ~11 km along
      { name: `Near end ${tag}`, lat: 10.9, lng: 79.99 },     // ~1 km off, ~100 km along
      { name: `Too far ${tag}`, lat: 10.5, lng: 80.2 },       // ~22 km off
    ];
    for (const p of pts) {
      await db.query("insert into public.stations (name, address, city, lat, lng, data_source) values ($1, 'Road', 'Town', $2, $3, 'demo')", [p.name, p.lat, p.lng]);
    }
    const route = { type: "LineString", coordinates: [[80.0, 10.0], [80.0, 10.5], [80.0, 11.0]] };
    const r = await asUser<{ name: string; along_km: number; detour_km: number }>(null, new Date().toISOString(),
      "select name, along_km, detour_km from public.stations_along_route($1::jsonb, 5) where name like $2", [JSON.stringify(route), `%${tag}`], "anon");
    const rows = r.ok ? r.value : [];
    expect(rows.map((x) => x.name)).toEqual([`Near start ${tag}`, `Near end ${tag}`]);
    expect(rows[0].along_km).toBeGreaterThan(10);
    expect(rows[0].along_km).toBeLessThan(12.5);
    expect(rows[1].along_km).toBeGreaterThan(98);
    expect(rows[0].detour_km).toBeLessThan(1.5);
  });

  it("rejects anything that isn't a reasonable LineString", async () => {
    const bad = await asUser(null, new Date().toISOString(), "select * from public.stations_along_route($1::jsonb)", [JSON.stringify({ type: "Point", coordinates: [80, 10] })], "anon");
    expect(errorCode(bad)).toBe("EVB15");
    expectOk(await asUser(null, new Date().toISOString(), "select count(*) from public.stations_along_route($1::jsonb)",
      [JSON.stringify({ type: "LineString", coordinates: [[80, 10], [80.001, 10.001]] })], "anon"));
  });
});
