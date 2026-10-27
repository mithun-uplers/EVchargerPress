import { afterAll, describe, expect, it } from "vitest";
import {
  asAdmin, asUser, book, bookWithVehicle, cancel, createStation, createUser, createVehicle, db, errorCode, expectOk, newKey,
} from "./helpers";

const NOW = "2027-03-01T00:00:00Z";
const START = "2027-03-02T04:30:00Z"; // 10:00 IST

afterAll(() => db.end());

describe("vehicles and connector compatibility", () => {
  it("keeps vehicles private to their owner", async () => {
    const [owner, other] = [await createUser(), await createUser()];
    const v = await createVehicle(owner);
    const seen = await asUser(other, NOW, "select id from public.vehicles where id = $1", [v]);
    expect(seen.ok && seen.value).toEqual([]);
    const addConn = await asUser(other, NOW, "insert into public.vehicle_connectors (vehicle_id, connector_type) values ($1, 'Type 2')", [v]);
    expect(errorCode(addConn)).toBe("42501");
    const steal = await asUser(other, NOW, "update public.vehicles set make = 'x' where id = $1 returning id", [v]);
    expect(steal.ok && steal.value).toEqual([]);
  });

  it("books with a compatible vehicle and prices energy for what the vehicle can draw", async () => {
    const { evseId } = await createStation(); // 60 kW CCS2, ₹18/kWh
    const user = await createUser();
    const v = await createVehicle(user, { max_dc_kw: 50, battery_capacity_kwh: 40, connectors: [{ type: "CCS2" }] });
    const b = expectOk(await bookWithVehicle(user, NOW, evseId, v, START, 60));
    const snap = b.price_snapshot;
    expect(snap.assumptions.effective_power_kw).toBe(50);
    // 50 kW × 1 h × 0.8 = 40 kWh, capped at 80% of the 40 kWh battery = 32 kWh
    expect(snap.assumptions.estimated_kwh).toBe(32);
    expect(snap.lines.find((l: { type: string }) => l.type === "energy_kwh").amount_minor).toBe(57600);
    expect(snap.estimated_charging).toEqual({ net_minor: 57600, tax_minor: 10368, total_minor: 67968 });
    expect(snap.vehicle.label).toBe("Tata Nexon EV");
    expect(b.estimated_total_minor).toBe(5900 + 67968);
  });

  it("refuses a vehicle whose connectors don't match the charging point", async () => {
    const { evseId } = await createStation(); // CCS2 only
    const user = await createUser();
    const scooter = await createVehicle(user, { vehicle_type: "scooter", make: "Ather", model: "450X", connectors: [{ type: "Type 2" }] });
    expect(errorCode(await bookWithVehicle(user, NOW, evseId, scooter, START))).toBe("EVB17");
    const noConnectors = await createVehicle(user, { connectors: [] });
    expect(errorCode(await bookWithVehicle(user, NOW, evseId, noConnectors, START))).toBe("EVB17");
  });

  it("refuses someone else's vehicle", async () => {
    const { evseId } = await createStation();
    const [a, b] = [await createUser(), await createUser()];
    const vA = await createVehicle(a);
    expect(errorCode(await bookWithVehicle(b, NOW, evseId, vA, START))).toBe("EVB02");
  });

  it("lists only compatible charging points with the power the vehicle can use", async () => {
    const { stationId, evseIds } = await createStation({
      evses: [
        { label: "DC-1", max_power_kw: 60, connectors: [{ type: "CCS2", power_kw: 60 }] },
        { label: "AC-1", max_power_kw: 7.4, connectors: [{ type: "Type 2", power_kw: 7.4 }] },
      ],
    });
    const user = await createUser();
    const v = await createVehicle(user, { max_ac_kw: 3.3, connectors: [{ type: "Type 2" }] });
    const rows = await asUser<{ evse_id: string; effective_power_kw: string }>(user, NOW, "select * from public.compatible_evses($1, $2)", [v, stationId]);
    expect(rows.ok && rows.value.map((x) => [x.evse_id, Number(x.effective_power_kw)])).toEqual([[evseIds[1], 3.3]]);
    const stranger = await createUser();
    const none = await asUser(stranger, NOW, "select * from public.compatible_evses($1, $2)", [v, stationId]);
    expect(none.ok && none.value).toEqual([]);
  });

  it("treats a different vehicle as a different request for the same idempotency key", async () => {
    const { evseIds } = await createStation({ evses: [{ label: "A" }, { label: "B" }] });
    const user = await createUser();
    const [v1, v2] = [await createVehicle(user), await createVehicle(user)];
    const key = newKey();
    expectOk(await bookWithVehicle(user, NOW, evseIds[0], v1, START, 60, key));
    expect(errorCode(await bookWithVehicle(user, NOW, evseIds[0], v2, START, 60, key))).toBe("EVB08");
    expect(expectOk(await bookWithVehicle(user, NOW, evseIds[0], v1, START, 60, key)).id).toBeTruthy();
  });

  it("protects vehicles with live bookings from removal, and freezes the vehicle on the booking", async () => {
    const { evseId } = await createStation();
    const user = await createUser();
    const v = await createVehicle(user);
    const b = expectOk(await bookWithVehicle(user, NOW, evseId, v, START));
    const remove = await asUser(user, NOW, "update public.vehicles set deleted_at = now() where id = $1 returning id", [v]);
    expect(errorCode(remove)).toBe("EVB18");
    expect(errorCode(await asAdmin(NOW, "update public.bookings set vehicle_id = null where id = $1", [b.id]))).toBe("EVB10");
    expectOk(await cancel(user, NOW, b.id));
    expectOk(await asUser(user, NOW, "update public.vehicles set deleted_at = now() where id = $1 returning id", [v]));
  });

  it("still supports booking without a vehicle (legacy API)", async () => {
    const { evseId } = await createStation();
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    expect(b.price_snapshot.vehicle).toBeUndefined();
  });
});

describe("profile preferences and privacy", () => {
  it("lets users edit their profile but not their account status", async () => {
    const user = await createUser();
    expectOk(await asUser(user, NOW, "update public.profiles set display_name = 'Mithun', phone = '+919876543210' where id = $1 returning id", [user]));
    expect(errorCode(await asUser(user, NOW, "update public.profiles set status = 'active' , deletion_requested_at = now() where id = $1", [user]))).toBe("42501");
    expect(errorCode(await asUser(user, NOW, "update public.profiles set phone = 'not a phone' where id = $1", [user]))).toBe("23514");
  });

  it("only accepts the user's own vehicle as preferred, and clears it when removed", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const vA = await createVehicle(a);
    const vB = await createVehicle(b);
    expect(errorCode(await asUser(a, NOW, "update public.profiles set preferred_vehicle_id = $2 where id = $1", [a, vB]))).toBe("EVB02");
    expectOk(await asUser(a, NOW, "update public.profiles set preferred_vehicle_id = $2 where id = $1 returning id", [a, vA]));
    expectOk(await asUser(a, NOW, "update public.vehicles set deleted_at = now() where id = $1 returning id", [vA]));
    const { rows } = await db.query("select preferred_vehicle_id from public.profiles where id = $1", [a]);
    expect(rows[0].preferred_vehicle_id).toBeNull();
  });

  it("records an account-deletion request", async () => {
    const user = await createUser();
    const p = expectOk(await asUser<{ status: string }>(user, NOW, "select * from public.request_account_deletion()"));
    expect(p.status).toBe("deletion_requested");
  });
});

describe("charging history and battery readings", () => {
  it("records manual sessions linked to the user's booking, filling station and charging point", async () => {
    const { evseId, stationId } = await createStation();
    const user = await createUser();
    const v = await createVehicle(user);
    const b = expectOk(await bookWithVehicle(user, NOW, evseId, v, START));
    const s = expectOk(await asUser<{ station_id: string; evse_id: string; vehicle_id: string; source: string }>(user, NOW,
      `insert into public.charging_sessions (user_id, booking_id, started_at, ended_at, energy_kwh, total_cost_minor, source)
       values ($1, $2, $3, $3::timestamptz + interval '50 minutes', 31.5, 66000, 'manual') returning station_id, evse_id, vehicle_id, source`,
      [user, b.id, START]));
    expect(s).toEqual({ station_id: stationId, evse_id: evseId, vehicle_id: v, source: "manual" });
  });

  it("does not let customers fabricate operator or charger telemetry", async () => {
    const user = await createUser();
    const r = await asUser(user, NOW,
      "insert into public.charging_sessions (user_id, started_at, ended_at, energy_kwh, source) values ($1, $2, $2::timestamptz + interval '1 hour', 10, 'charger_ocpp')",
      [user, START]);
    expect(errorCode(r)).toBe("42501");
  });

  it("rejects sessions on someone else's booking and hides sessions from other users", async () => {
    const { evseId } = await createStation();
    const [a, b] = [await createUser(), await createUser()];
    const bk = expectOk(await book(a, NOW, evseId, START));
    const r = await asUser(b, NOW,
      "insert into public.charging_sessions (user_id, booking_id, started_at, ended_at, source) values ($1, $2, $3, $3::timestamptz + interval '1 hour', 'manual')",
      [b, bk.id, START]);
    expect(errorCode(r)).toBe("EVB02");
    expectOk(await asUser(a, NOW,
      "insert into public.charging_sessions (user_id, started_at, ended_at, energy_kwh, source) values ($1, $2, $2::timestamptz + interval '1 hour', 10, 'manual') returning id",
      [a, START]));
    const seen = await asUser(b, NOW, "select id from public.charging_sessions where user_id = $1", [a]);
    expect(seen.ok && seen.value).toEqual([]);
  });

  it("validates session times", async () => {
    const user = await createUser();
    const r = await asUser(user, NOW,
      "insert into public.charging_sessions (user_id, started_at, ended_at, source) values ($1, $2, $2::timestamptz - interval '1 hour', 'manual')",
      [user, START]);
    expect(errorCode(r)).toBe("23514");
  });

  it("stores manual battery readings for the user's own vehicles only", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const v = await createVehicle(a);
    expectOk(await asUser(a, NOW, "insert into public.battery_readings (vehicle_id, soc_percent, odometer_km) values ($1, 64, 12450) returning id", [v]));
    expect(errorCode(await asUser(b, NOW, "insert into public.battery_readings (vehicle_id, soc_percent) values ($1, 50)", [v]))).toBe("42501");
    expect(errorCode(await asUser(a, NOW, "insert into public.battery_readings (vehicle_id, soc_percent, source) values ($1, 50, 'vehicle_api')", [v]))).toBe("42501");
    expect(errorCode(await asUser(a, NOW, "insert into public.battery_readings (vehicle_id) values ($1)", [v]))).toBe("23514");
    expect(errorCode(await asUser(a, NOW, "insert into public.battery_readings (vehicle_id, soc_percent) values ($1, 140)", [v]))).toBe("23514");
  });
});

describe("vehicle connector updates", () => {
  it("replaces the connector list for the owner only", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const v = await createVehicle(a, { connectors: [{ type: "CCS2" }] });
    const r = expectOk(await asUser<{ connector_type: string }>(a, NOW, "select connector_type from public.set_vehicle_connectors($1, $2, $3) order by 1", [v, ["Type 2", "CCS2"], [7.4, 50]]));
    expect(r.connector_type).toBe("CCS2");
    const { rows } = await db.query("select connector_type, supported_power_kw::float from public.vehicle_connectors where vehicle_id = $1 order by 1", [v]);
    expect(rows).toEqual([{ connector_type: "CCS2", supported_power_kw: 50 }, { connector_type: "Type 2", supported_power_kw: 7.4 }]);
    expect(errorCode(await asUser(b, NOW, "select * from public.set_vehicle_connectors($1, $2)", [v, ["CHAdeMO"]]))).toBe("EVB02");
    expect(errorCode(await asUser(null, NOW, "select * from public.set_vehicle_connectors($1, $2)", [v, ["CHAdeMO"]], "anon"))).toBe("42501");
  });
});
