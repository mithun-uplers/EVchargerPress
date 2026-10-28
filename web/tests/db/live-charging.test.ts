import { afterAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, bookWithVehicle, checkIn, confirm, createStation, createUser, createVehicle, db, errorCode, expectOk } from "./helpers";

const NOW = "2027-03-01T00:00:00Z";
const START = "2027-03-02T04:30:00Z"; // 10:00 IST, 60 min booking
const AT = (min: number) => new Date(Date.parse(START) + min * 60_000).toISOString();

afterAll(() => db.end());

type Frame = unknown[];

/** Creates a station whose charging point is wired to a charge point; returns ids and its secret. */
async function connectedStation(simulated = false) {
  const st = await createStation(); // 60 kW CCS2, ₹18/kWh + 18% GST
  await db.query(
    "insert into public.charger_networks (slug, name, protocol, is_simulated) values ($1, $1, $2, $3) on conflict (slug) do nothing",
    [simulated ? "sim-test" : "ocpp-test", simulated ? "simulator" : "ocpp16j", simulated],
  );
  const identity = `CP-${crypto.randomUUID().slice(0, 8)}`;
  const { rows } = await db.query("select app.register_charge_point($1, $2, $3, $4) as secret", [
    simulated ? "sim-test" : "ocpp-test", st.stationId, identity, simulated]);
  await db.query(
    "update public.evses set charge_point_id = (select id from public.charge_points where identity = $1), ocpp_connector_id = 1 where id = $2",
    [identity, st.evseId],
  );
  return { ...st, identity, secret: rows[0].secret as string };
}

/** Sends a frame as the anonymous gateway (the HTTP endpoint uses the anon key). */
async function send(identity: string, secret: string, frame: Frame, now = NOW) {
  return asUser<{ reply: Frame | null }>(null, now, "select public.ocpp_ingest($1, $2, $3::jsonb) as reply", [identity, secret, JSON.stringify(frame)], "anon");
}
async function call(identity: string, secret: string, action: string, payload: object, now = NOW) {
  const r = expectOk(await send(identity, secret, [2, crypto.randomUUID(), action, payload], now));
  return r.reply as [number, string, Record<string, any>]; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function checkedInBooking(evseId: string) {
  const user = await createUser();
  const vehicle = await createVehicle(user, { max_dc_kw: 50, battery_capacity_kwh: 40 });
  const b = expectOk(await bookWithVehicle(user, NOW, evseId, vehicle, START, 60));
  expectOk(await confirm(user, NOW, b.id));
  return { user, vehicle, booking: b };
}

describe("OCPP gateway authentication", () => {
  it("rejects unknown charge points and wrong secrets", async () => {
    const { identity } = await connectedStation();
    expect(errorCode(await send(identity, "wrong", [2, "1", "Heartbeat", {}]))).toBe("28000");
    expect(errorCode(await send("NOPE-123", "x", [2, "1", "Heartbeat", {}]))).toBe("28000");
  });

  it("never exposes charge point secrets through the API", async () => {
    await connectedStation();
    const user = await createUser();
    const r = await asUser(user, NOW, "select secret_hash from public.charge_points");
    expect(r.ok && r.value).toEqual([]);
    const log = await asUser(user, NOW, "select * from public.ocpp_messages");
    expect(log.ok && log.value).toEqual([]);
  });

  it("answers malformed and unsupported messages with OCPP errors", async () => {
    const { identity, secret } = await connectedStation();
    expect(errorCode(await send(identity, secret, { not: "a frame" } as unknown as Frame))).toBe("22023");
    const reply = await call(identity, secret, "FirmwareStatusNotification", { status: "Idle" });
    expect(reply[0]).toBe(4);
    expect(reply[2]).toBe("NotImplemented");
  });
});

describe("charger status", () => {
  it("records boot, heartbeat and connector status as live data from the charger", async () => {
    const { identity, secret, evseId, stationId } = await connectedStation();
    const boot = await call(identity, secret, "BootNotification", { chargePointVendor: "Acme", chargePointModel: "DC60" });
    expect(boot[2].status).toBe("Accepted");
    expect(boot[2].interval).toBe(60);
    await call(identity, secret, "StatusNotification", { connectorId: 1, status: "Faulted", errorCode: "GroundFailure", timestamp: NOW });
    const { rows } = await db.query("select live_status, live_error_code, live_source, live_is_simulated from public.evses where id = $1", [evseId]);
    expect(rows[0]).toEqual({ live_status: "faulted", live_error_code: "GroundFailure", live_source: "charger_ocpp", live_is_simulated: false });
    // An unknown status is a formation error, not a silent change.
    const bad = await call(identity, secret, "StatusNotification", { connectorId: 1, status: "Exploded", errorCode: "NoError" });
    expect(bad[2]).toBe("FormationViolation");
    // A future-dated timestamp is clamped to now.
    await call(identity, secret, "StatusNotification", { connectorId: 1, status: "Available", errorCode: "NoError", timestamp: "2099-01-01T00:00:00Z" });
    const t = await db.query("select live_status, live_status_at from public.evses where id = $1", [evseId]);
    expect(t.rows[0].live_status).toBe("available");
    expect(new Date(t.rows[0].live_status_at).toISOString()).toBe(new Date(NOW).toISOString());
    const s = await db.query("select live_evse_count, live_available_count from public.station_summaries where id = $1", [stationId]);
    expect(s.rows[0]).toEqual({ live_evse_count: 1, live_available_count: 1 });
  });
});

describe("OCPP transactions", () => {
  it("runs a session from Authorize to StopTransaction and prices it from the booking snapshot", async () => {
    const { identity, secret, evseId } = await connectedStation();
    const { user, booking } = await checkedInBooking(evseId);
    // Not checked in yet → the charger must refuse the card.
    expect((await call(identity, secret, "Authorize", { idTag: booking.reference }, AT(0)))[2].idTagInfo.status).toBe("Invalid");
    expectOk(await checkIn(user, AT(-5), booking.id));
    expect((await call(identity, secret, "Authorize", { idTag: booking.reference }, AT(0)))[2].idTagInfo.status).toBe("Accepted");
    expect((await call(identity, secret, "Authorize", { idTag: "EV-NOTREAL" }, AT(0)))[2].idTagInfo.status).toBe("Invalid");

    const start = await call(identity, secret, "StartTransaction", { connectorId: 1, idTag: booking.reference, meterStart: 125000, timestamp: AT(1) }, AT(1));
    expect(start[2].idTagInfo.status).toBe("Accepted");
    const tx = start[2].transactionId as number;
    expect(tx).toBeGreaterThan(0);
    // A retried StartTransaction (lost reply) gets the same transaction back.
    const again = await call(identity, secret, "StartTransaction", { connectorId: 1, idTag: booking.reference, meterStart: 125000, timestamp: AT(1) }, AT(1));
    expect(again[2].transactionId).toBe(tx);

    await call(identity, secret, "MeterValues", {
      connectorId: 1, transactionId: tx,
      meterValue: [{ timestamp: AT(11), sampledValue: [
        { value: "133.5", measurand: "Energy.Active.Import.Register", unit: "kWh" },
        { value: "48.2", measurand: "Power.Active.Import", unit: "kW" },
        { value: "62", measurand: "SoC", unit: "Percent" },
        { value: "120", measurand: "Power.Active.Import", unit: "W", phase: "L1" }, // per-phase values are ignored
      ] }],
    }, AT(11));
    const live = await asUser<{ r: any }>(user, AT(11), "select public.live_session(id) as r from public.charging_sessions where booking_id = $1", [booking.id]); // eslint-disable-line @typescript-eslint/no-explicit-any
    const r = expectOk(live).r;
    expect(r.session.status).toBe("in_progress");
    expect(r.session.source).toBe("charger_ocpp");
    expect(r.session.is_simulated).toBe(false);
    expect(Number(r.session.energy_kwh)).toBe(8.5);
    expect(Number(r.session.last_power_kw)).toBe(48.2);
    expect(Number(r.session.last_soc_percent)).toBe(62);
    expect(r.samples).toHaveLength(1);
    expect(r.cost_so_far_minor).toBe(Math.round(8.5 * 1800 * 1.18)); // 18054
    expect(r.session.id_tag).toBeUndefined();

    // Other drivers can't see the session or its samples.
    const other = await createUser();
    expect(errorCode(await asUser(other, AT(11), "select public.live_session($1)", [r.session.id]))).toBe("EVB02");
    const mv = await asUser(other, AT(11), "select * from public.meter_values where session_id = $1", [r.session.id]);
    expect(mv.ok && mv.value).toEqual([]);

    const stop = await call(identity, secret, "StopTransaction", { transactionId: tx, meterStop: 141250, timestamp: AT(31), reason: "EVDisconnected" }, AT(31));
    expect(stop[2].idTagInfo.status).toBe("Accepted");
    const { rows } = await db.query("select * from public.charging_sessions where id = $1", [r.session.id]);
    expect(rows[0].status).toBe("completed");
    expect(Number(rows[0].energy_kwh)).toBe(16.25);
    expect(rows[0].total_cost_minor).toBe(Math.round(16.25 * 1800 * 1.18)); // 34515
    expect(rows[0].stop_reason).toBe("EVDisconnected");
    expect(rows[0].cost_basis).toBe("tariff_snapshot");
    // Late samples after the stop are ignored.
    await call(identity, secret, "MeterValues", { connectorId: 1, transactionId: tx, meterValue: [{ timestamp: AT(40), sampledValue: [{ value: "150000" }] }] }, AT(40));
    expect(Number((await db.query("select energy_kwh from public.charging_sessions where id = $1", [r.session.id])).rows[0].energy_kwh)).toBe(16.25);
  });

  it("refuses to start for another charger's booking", async () => {
    const a = await connectedStation();
    const b = await connectedStation();
    const { user, booking } = await checkedInBooking(a.evseId);
    expectOk(await checkIn(user, AT(-5), booking.id));
    const start = await call(b.identity, b.secret, "StartTransaction", { connectorId: 1, idTag: booking.reference, meterStart: 0 }, AT(0));
    expect(start[2].idTagInfo.status).toBe("Invalid");
  });
});

describe("remote start and stop", () => {
  it("queues a start command, checking the booking in, and hands it to the gateway once", async () => {
    const { identity, secret, evseId } = await connectedStation();
    const { user, booking } = await checkedInBooking(evseId);
    const cmd = expectOk(await asUser<{ id: string; status: string; payload: { idTag: string; connectorId: number } }>(
      user, AT(-5), "select * from public.start_charging($1)", [booking.id]));
    expect(cmd.status).toBe("pending");
    expect(cmd.payload).toEqual({ connectorId: 1, idTag: booking.reference });
    expect((await db.query("select status from public.bookings where id = $1", [booking.id])).rows[0].status).toBe("checked_in");
    // Repeat tap returns the same command.
    expect(expectOk(await asUser<{ id: string }>(user, AT(-4), "select * from public.start_charging($1)", [booking.id])).id).toBe(cmd.id);

    const poll = expectOk(await asUser<{ f: Frame[] }>(null, AT(-4), "select public.ocpp_poll_commands($1, $2) as f", [identity, secret], "anon")).f;
    expect(poll).toEqual([[2, cmd.id, "RemoteStartTransaction", { connectorId: 1, idTag: booking.reference }]]);
    const poll2 = expectOk(await asUser<{ f: Frame[] }>(null, AT(-4), "select public.ocpp_poll_commands($1, $2) as f", [identity, secret], "anon")).f;
    expect(poll2).toEqual([]);
    expectOk(await send(identity, secret, [3, cmd.id, { status: "Accepted" }], AT(-4)));
    expect((await db.query("select status from public.charger_commands where id = $1", [cmd.id])).rows[0].status).toBe("accepted");
  });

  it("explains when a charger isn't connected, and blocks other users", async () => {
    const { evseId } = await createStation();
    const { user, booking } = await checkedInBooking(evseId);
    expect(errorCode(await asUser(user, AT(-5), "select * from public.start_charging($1)", [booking.id]))).toBe("EVB19");
    const other = await createUser();
    expect(errorCode(await asUser(other, AT(-5), "select * from public.start_charging($1)", [booking.id]))).toBe("EVB02");
    // Refused either by the function itself (EVB01) or, once 20261030000003 is applied, by the grant (42501).
    expect(["EVB01", "42501"]).toContain(errorCode(await asUser(null, AT(-5), "select * from public.start_charging($1)", [booking.id], "anon")));
  });
});

describe("charger simulator", () => {
  it("starts, meters and stops a simulated session through the OCPP path, labelled simulated", async () => {
    const { evseId } = await connectedStation(true);
    const { user, booking, vehicle } = await checkedInBooking(evseId);
    await db.query("insert into public.battery_readings (vehicle_id, recorded_at, soc_percent) values ($1, $2, 40)", [vehicle, NOW]);
    expectOk(await asUser(user, AT(0), "select * from public.start_charging($1)", [booking.id]));
    expectOk(await asAdmin(AT(0), "select app.simulator_tick()"));
    let s = (await db.query("select * from public.charging_sessions where booking_id = $1", [booking.id])).rows[0];
    expect(s.status).toBe("in_progress");
    expect(s.is_simulated).toBe(true);
    expect((await db.query("select live_status, live_is_simulated from public.evses where id = $1", [evseId])).rows[0])
      .toEqual({ live_status: "charging", live_is_simulated: true });

    // 12 minutes at 50 kW (vehicle limit) ≈ 10 kWh, SoC 40 % → 65 % on a 40 kWh battery.
    expectOk(await asAdmin(AT(12), "select app.simulator_tick()"));
    s = (await db.query("select * from public.charging_sessions where id = $1", [s.id])).rows[0];
    expect(Number(s.energy_kwh)).toBeCloseTo(10, 1);
    expect(Number(s.last_power_kw)).toBe(50);
    expect(Number(s.last_soc_percent)).toBeCloseTo(65, 0);
    const mv = await db.query("select bool_and(is_simulated) as sim, count(*)::int as n from public.meter_values where session_id = $1", [s.id]);
    expect(mv.rows[0]).toEqual({ sim: true, n: 2 });

    expectOk(await asUser(user, AT(13), "select * from public.stop_charging($1)", [s.id]));
    expectOk(await asAdmin(AT(13), "select app.simulator_tick()"));
    s = (await db.query("select * from public.charging_sessions where id = $1", [s.id])).rows[0];
    expect(s.status).toBe("completed");
    expect(s.stop_reason).toBe("Remote");
    expect(s.total_cost_minor).toBe(Math.round(Number(s.energy_kwh) * 1800 * 1.18));
    // Slot still reserved for the rest of the booking.
    expect((await db.query("select live_status from public.evses where id = $1", [evseId])).rows[0].live_status).toBe("reserved");
    expect(errorCode(await asUser(user, AT(14), "select * from public.stop_charging($1)", [s.id]))).toBe("EVB21");
  });

  it("stops at the end of the booking", async () => {
    const { evseId } = await connectedStation(true);
    const { user, booking } = await checkedInBooking(evseId);
    expectOk(await checkIn(user, AT(0), booking.id));
    expectOk(await asUser(user, AT(30), "select * from public.start_charging($1)", [booking.id]));
    expectOk(await asAdmin(AT(30), "select app.simulator_tick()"));
    expectOk(await asAdmin(AT(61), "select app.simulator_tick()"));
    const s = (await db.query("select status, stop_reason from public.charging_sessions where booking_id = $1", [booking.id])).rows[0];
    expect(s).toEqual({ status: "completed", stop_reason: "Local" });
  });
});
