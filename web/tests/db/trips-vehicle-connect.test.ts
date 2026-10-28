import { afterAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, createUser, createVehicle, db, errorCode, expectOk } from "./helpers";

const NOW = "2027-03-01T03:00:00Z"; // 08:30 IST
afterAll(() => db.end());

const trip = (o: Record<string, unknown> = {}) => ({
  name: "Bengaluru to Chennai", from_label: "Bengaluru", from_lat: 12.97, from_lng: 77.59, to_label: "Chennai", to_lat: 13.08, to_lng: 80.27,
  distance_km: 346.2, duration_min: 360, route_source: "osrm", route_geometry: { type: "LineString", coordinates: [[77.59, 12.97], [80.27, 13.08]] },
  start_soc_percent: 80, reserve_percent: 15, consumption_kwh_per_100km: 15, battery_kwh: 40, feasible: true, arrive_soc_percent: 18,
  charge_minutes: 35, energy_kwh: 22.5, ...o,
});
const stations = [
  { name: "Highway Stop", lat: 12.9, lng: 78.5, connector_types: ["CCS2"], max_power_kw: 60, is_bookable: true, is_compatible: true, along_km: 150, detour_km: 0.4,
    stop_order: 1, arrive_soc_percent: 24, depart_soc_percent: 76, energy_kwh: 20.8, power_kw: 50, charge_minutes: 31 },
  { name: "Town AC", lat: 12.95, lng: 78.9, connector_types: ["Type 2"], max_power_kw: 7.4, is_bookable: false, is_compatible: false, along_km: 190, detour_km: 1.2 },
];

describe("saved trips", () => {
  it("saves a trip with every station along the route, private to its owner", async () => {
    const [me, other] = [await createUser(), await createUser()];
    const t = expectOk(await asUser<{ id: string; name: string }>(me, NOW, "select * from public.save_trip($1::jsonb, $2::jsonb)", [JSON.stringify(trip()), JSON.stringify(stations)]));
    expect(t.name).toBe("Bengaluru to Chennai");
    const mine = await asUser<{ name: string; stop_order: number | null }>(me, NOW, "select name, stop_order from public.trip_stations where trip_id = $1 order by along_km", [t.id]);
    expect(mine.ok && mine.value).toEqual([{ name: "Highway Stop", stop_order: 1 }, { name: "Town AC", stop_order: null }]);
    const theirs = await asUser(other, NOW, "select * from public.trip_stations where trip_id = $1", [t.id]);
    expect(theirs.ok && theirs.value).toEqual([]);
    expect(errorCode(await asUser(other, NOW, "insert into public.trip_stations (trip_id, name, lat, lng, along_km, detour_km) values ($1, 'x', 0, 0, 0, 0)", [t.id]))).toBe("42501");
    const gone = await asUser(other, NOW, "delete from public.trips where id = $1 returning id", [t.id]);
    expect(gone.ok && gone.value).toEqual([]);
    const del = await asUser(me, NOW, "delete from public.trips where id = $1 returning id", [t.id]);
    expect(del.ok && del.value).toHaveLength(1);
    expect((await db.query("select count(*)::int as n from public.trip_stations where trip_id = $1", [t.id])).rows[0].n).toBe(0);
  });

  it("is atomic and validates input", async () => {
    const me = await createUser();
    const bad = await asUser(me, NOW, "select * from public.save_trip($1::jsonb, $2::jsonb)", [JSON.stringify(trip({ name: "" })), JSON.stringify(stations)]);
    expect(errorCode(bad)).toBe("23514");
    const badStation = await asUser(me, NOW, "select * from public.save_trip($1::jsonb, $2::jsonb)", [JSON.stringify(trip()), JSON.stringify([{ name: "x" }])]);
    expect(badStation.ok).toBe(false);
    expect((await asUser<{ n: number }>(me, NOW, "select count(*)::int as n from public.trips")).ok).toBe(true);
    const n = expectOk(await asUser<{ n: number }>(me, NOW, "select count(*)::int as n from public.trips")).n;
    expect(n).toBe(0);
    expect(errorCode(await asUser(null, NOW, "select * from public.save_trip($1::jsonb, '[]'::jsonb)", [JSON.stringify(trip())], "anon"))).toMatch(/EVB01|42501/);
  });
});

describe("connected vehicles", () => {
  it("connects a simulated car and records labelled readings", async () => {
    const me = await createUser();
    const v = await createVehicle(me, { battery_capacity_kwh: 40 });
    const c = expectOk(await asUser<{ id: string; status: string; mode: string }>(me, NOW, "select * from public.start_vehicle_connection($1, 'simulator')", [v]));
    expect(c).toMatchObject({ status: "active", mode: "simulated" });
    const t = (await db.query("select * from public.vehicle_telemetry where connection_id = $1", [c.id])).rows;
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ source: "simulator", is_simulated: true });
    const br = (await db.query("select source, is_simulated, notes from public.battery_readings where vehicle_id = $1", [v])).rows;
    expect(br).toEqual([{ source: "vehicle_api", is_simulated: true, notes: "Simulated car" }]);
    // Second connection is refused while one is active.
    expect(errorCode(await asUser(me, NOW, "select * from public.start_vehicle_connection($1, 'simulator')", [v]))).toBe("EVB22");
    // Simulator tick adds a reading every 5 minutes; commute hours add distance.
    expectOk(await asAdmin("2027-03-01T03:06:00Z", "select app.vehicle_sim_tick()"));
    const t2 = (await db.query("select odometer_km, soc_percent from public.vehicle_telemetry where connection_id = $1 order by recorded_at", [c.id])).rows;
    expect(t2).toHaveLength(2);
    expect(Number(t2[1].odometer_km)).toBeGreaterThan(Number(t2[0].odometer_km));
    expect(Number(t2[1].soc_percent)).toBeLessThan(Number(t2[0].soc_percent));
    expectOk(await asAdmin("2027-03-01T03:07:00Z", "select app.vehicle_sim_tick()")); // too soon: skipped
    expect((await db.query("select count(*)::int n from public.vehicle_telemetry where connection_id = $1", [c.id])).rows[0].n).toBe(2);
    expectOk(await asUser(me, NOW, "select * from public.disconnect_vehicle($1)", [c.id]));
    expectOk(await asAdmin("2027-03-01T03:20:00Z", "select app.vehicle_sim_tick()"));
    expect((await db.query("select count(*)::int n from public.vehicle_telemetry where connection_id = $1", [c.id])).rows[0].n).toBe(2);
  });

  it("completes a Smartcar connection only with the right state, and only the server can write readings", async () => {
    const [me, other] = [await createUser(), await createUser()];
    const v = await createVehicle(me);
    const c = expectOk(await asUser<{ id: string; state_nonce: string; status: string }>(me, NOW, "select * from public.start_vehicle_connection($1, 'smartcar', 'simulated')", [v]));
    expect(c.status).toBe("pending");
    expect(c.state_nonce).toMatch(/^[0-9a-f]{36}$/);
    expect(errorCode(await asUser(other, NOW, "select * from public.complete_vehicle_connection($1, 'sc-user-1')", [c.state_nonce]))).toBe("EVB02");
    expect(errorCode(await asUser(me, "2027-03-01T04:00:00Z", "select * from public.complete_vehicle_connection($1, 'sc-user-1')", [c.state_nonce]))).toBe("EVB02"); // expired
    const done = expectOk(await asUser<{ status: string; state_nonce: string | null }>(me, NOW, "select * from public.complete_vehicle_connection($1, 'sc-user-1')", [c.state_nonce]));
    expect(done).toMatchObject({ status: "active", state_nonce: null });

    await db.query("select app.set_integration_key('vehicle_ingest', 'test-ingest-key-123456')");
    const reading = { soc_percent: 71, range_km: 260, odometer_km: 15234.5, is_charging: false, latitude: 12.97, longitude: 77.59 };
    expect(errorCode(await asUser(me, NOW, "select public.ingest_vehicle_telemetry('wrong', $1, $2::jsonb)", [c.id, JSON.stringify(reading)]))).toBe("28000");
    expectOk(await asUser(null, NOW, "select public.ingest_vehicle_telemetry('test-ingest-key-123456', $1, $2::jsonb, $3::jsonb)",
      [c.id, JSON.stringify(reading), JSON.stringify({ id: "sc-veh-9", make: "TESLA", model: "Model 3", year: 2022 })], "anon"));
    const t = (await db.query("select soc_percent, source, is_simulated from public.vehicle_telemetry where connection_id = $1", [c.id])).rows[0];
    expect(t).toEqual({ soc_percent: "71.00", source: "smartcar", is_simulated: true }); // simulated Smartcar mode stays labelled
    // Drivers can't write vehicle data directly.
    expect(errorCode(await asUser(me, NOW, "insert into public.vehicle_telemetry (vehicle_id, connection_id, recorded_at, source) values ($1, $2, now(), 'smartcar')", [v, c.id]))).toBe("42501");
    expect(errorCode(await asUser(me, NOW, "insert into public.battery_readings (vehicle_id, soc_percent, source) values ($1, 50, 'vehicle_api')", [v]))).toBe("42501");
    // The owner sees the connection without the OAuth state in the view; others see nothing.
    const view = await asUser<{ provider_make: string }>(me, NOW, "select provider_make from public.my_vehicle_connections where id = $1", [c.id]);
    expect(view.ok && view.value).toEqual([{ provider_make: "TESLA" }]);
    const peek = await asUser(other, NOW, "select * from public.vehicle_connections where id = $1", [c.id]);
    expect(peek.ok && peek.value).toEqual([]);
  });
});
