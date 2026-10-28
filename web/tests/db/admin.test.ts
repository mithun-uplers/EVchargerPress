import { afterAll, describe, expect, it } from "vitest";
import { asUser, book, createStation, createUser, db, errorCode, expectOk } from "./helpers";

const NOW = "2027-03-01T03:00:00Z"; // 08:30 IST
const START = "2027-03-01T06:00:00Z";
afterAll(() => db.end());

async function makeAdmin() {
  const id = await createUser("Admin");
  await db.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [id]);
  return id;
}

const newStation = (uid: string) =>
  asUser<{ id: string }>(uid, NOW, `insert into public.stations (name, address, city, lat, lng, created_by)
    values ('Admin Hub', '1 Main Rd', 'Pune', 18.5, 73.8, $1) returning id`, [uid]);

describe("admin role", () => {
  it("drivers can no longer add, edit or delete stations and connectors", async () => {
    const driver = await createUser();
    expect(errorCode(await newStation(driver))).toBe("42501");
    const { stationId } = await createStation();
    await db.query("update public.stations set created_by = $1 where id = $2", [driver, stationId]);
    const edit = await asUser(driver, NOW, "update public.stations set name = 'Mine now' where id = $1 returning id", [stationId]);
    expect(edit.ok && edit.value).toEqual([]);
    const del = await asUser(driver, NOW, "delete from public.stations where id = $1 returning id", [stationId]);
    expect(del.ok && del.value).toEqual([]);
    expect(errorCode(await asUser(driver, NOW, "insert into public.connectors (station_id, type, power_kw) values ($1, 'CCS2', 60)", [stationId]))).toBe("42501");
    const conn = await asUser(driver, NOW, "delete from public.connectors where station_id = $1 returning id", [stationId]);
    expect(conn.ok && conn.value).toEqual([]);
    expect(expectOk(await asUser<{ is_admin: boolean }>(driver, NOW, "select public.is_admin() as is_admin")).is_admin).toBe(false);
    expect(expectOk(await asUser<{ is_admin: boolean }>(null, NOW, "select public.is_admin() as is_admin", [], "anon")).is_admin).toBe(false);
  });

  it("admins manage stations, charging points, rules and tariffs, and every change is audited", async () => {
    const admin = await makeAdmin();
    const s = expectOk(await newStation(admin));
    expectOk(await asUser(admin, NOW, "update public.stations set is_verified = true where id = $1 returning id", [s.id]));
    const v = (await db.query("select is_verified, verified_at from public.stations where id = $1", [s.id])).rows[0];
    expect(v.is_verified).toBe(true);
    expect(v.verified_at).not.toBeNull();
    const e = expectOk(await asUser<{ id: string }>(admin, NOW,
      "insert into public.evses (station_id, evse_uid, label, max_power_kw, is_bookable) values ($1, 'E1', 'DC-1', 60, true) returning id", [s.id]));
    expectOk(await asUser(admin, NOW, "insert into public.connectors (station_id, evse_id, type, power_kw) values ($1, $2, 'CCS2', 60) returning id", [s.id, e.id]));
    expectOk(await asUser(admin, NOW, "insert into public.booking_rules (station_id) values ($1) returning station_id", [s.id]));
    expectOk(await asUser(admin, NOW,
      "insert into public.operating_hours (station_id, weekday, opens_at, closes_at) select $1, d, '00:00', '24:00' from generate_series(0,6) d returning id", [s.id]));
    const t1 = expectOk(await asUser<{ id: string }>(admin, NOW, "select * from public.admin_set_tariff($1, 'Standard', 'INR', 'exclusive', 1800, $2::jsonb)",
      [s.id, JSON.stringify({ energy_kwh: 1800, reservation_fixed: 5000 })]));
    const t2 = expectOk(await asUser<{ id: string }>(admin, NOW, "select * from public.admin_set_tariff($1, 'Standard v2', 'INR', 'exclusive', 1800, $2::jsonb)",
      [s.id, JSON.stringify({ energy_kwh: 2000 })]));
    const tariffs = (await db.query("select id, is_active from public.tariffs where station_id = $1 order by created_at, name", [s.id])).rows;
    expect(tariffs).toEqual([{ id: t1.id, is_active: false }, { id: t2.id, is_active: true }]);
    const sum = (await db.query("select is_bookable, is_verified from public.station_summaries where id = $1", [s.id])).rows[0];
    expect(sum).toEqual({ is_bookable: true, is_verified: true });

    // A driver can book it.
    const driver = await createUser();
    expectOk(await book(driver, NOW, e.id, START));

    const audit = (await db.query("select action, target_table, actor_id from public.admin_audit where actor_id = $1 order by id", [admin])).rows;
    expect(audit.map((a) => `${a.action}:${a.target_table}`)).toEqual(expect.arrayContaining([
      "insert:stations", "update:stations", "insert:evses", "insert:connectors", "insert:booking_rules", "insert:operating_hours", "insert:tariffs", "update:tariffs",
    ]));
    const upd = (await db.query("select detail from public.admin_audit where actor_id = $1 and action = 'update' and target_table = 'stations'", [admin])).rows[0];
    expect(upd.detail.is_verified).toEqual({ from: false, to: true });
    // Drivers cannot read the audit log; admins can.
    expect((await asUser(driver, NOW, "select * from public.admin_audit")).ok && (await asUser(driver, NOW, "select * from public.admin_audit"))).toMatchObject({ value: [] });
    expect(expectOk(await asUser<{ n: number }>(admin, NOW, "select count(*)::int as n from public.admin_audit")).n).toBeGreaterThan(5);
    const tamper = await asUser(admin, NOW, "update public.admin_audit set action = 'x' returning id");
    expect(tamper.ok && tamper.value).toEqual([]); // no update policy: nothing is visible to change
    await expect(db.query("update public.admin_audit set action = 'x'")).rejects.toThrow(/append-only/);

    // Deleting a station with bookings is refused by the foreign key.
    expect(errorCode(await asUser(admin, NOW, "delete from public.stations where id = $1", [s.id]))).toBe("23503");
  });

  it("admin RPCs refuse drivers and anonymous callers", async () => {
    const driver = await createUser();
    for (const sql of [
      "select public.admin_dashboard()",
      "select * from public.admin_list_users()",
      "select * from public.admin_charge_points()",
      `select public.admin_set_admin('${driver}', true)`,
      `select * from public.admin_set_user_status('${driver}', 'suspended', 'x')`,
    ]) {
      expect(errorCode(await asUser(driver, NOW, sql))).toBe("42501");
      expect(errorCode(await asUser(null, NOW, sql, [], "anon"))).toMatch(/EVB01|42501/);
    }
    expect(errorCode(await asUser(driver, NOW, "insert into public.user_roles (user_id, role) values ($1, 'admin')", [driver]))).toBe("42501");
  });

  it("lists users, grants admin and protects the last admin", async () => {
    const admin = await makeAdmin();
    const other = await createUser("Second person");
    const list = await asUser<{ id: string; is_admin: boolean; email: string }>(admin, NOW, "select * from public.admin_list_users('Second person')");
    expect(list.ok && list.value.map((u) => u.id)).toContain(other);
    expect(expectOk(await asUser<{ r: boolean }>(admin, NOW, "select public.admin_set_admin($1, true) as r", [other])).r).toBe(true);
    expect(expectOk(await asUser<{ r: string[] }>(other, NOW, "select public.my_roles() as r")).r).toEqual(["admin"]);
    expect(expectOk(await asUser<{ r: boolean }>(other, NOW, "select public.admin_set_admin($1, false) as r", [admin])).r).toBe(false);
    expect(expectOk(await asUser<{ r: boolean }>(admin, NOW, "select public.is_admin() as r")).r).toBe(false);
    // Remove every other admin, then the last one cannot remove themselves.
    const others = (await db.query("select user_id from public.user_roles where revoked_at is null and user_id <> $1", [other])).rows;
    await db.query("update public.user_roles set revoked_at = now() where user_id = any($1)", [others.map((r) => r.user_id)]);
    expect(errorCode(await asUser(other, NOW, "select public.admin_set_admin($1, false)", [other]))).toBe("EVB24");
    const d = expectOk(await asUser<{ d: Record<string, number> }>(other, NOW, "select public.admin_dashboard() as d")).d;
    expect(d.admins).toBe(1);
    expect(d).toHaveProperty("bookings_upcoming");
  });

  it("suspends a driver: upcoming bookings are cancelled free and new bookings, check-ins and reviews are refused", async () => {
    const admin = await makeAdmin();
    const driver = await createUser();
    const { stationId, evseId } = await createStation();
    const b = expectOk(await book(driver, NOW, evseId, START));
    expect(errorCode(await asUser(admin, NOW, "select * from public.admin_set_user_status($1, 'suspended', '')", [driver]))).toBe("EVB24");
    expect(errorCode(await asUser(admin, NOW, "select * from public.admin_set_user_status($1, 'suspended', 'x')", [admin]))).toBe("EVB24");
    expectOk(await asUser(admin, NOW, "select * from public.admin_set_user_status($1, 'suspended', 'Repeated no-shows')", [driver]));
    const after = (await db.query("select status, cancellation_fee_minor, cancel_reason from public.bookings where id = $1", [b.id])).rows[0];
    expect(after).toEqual({ status: "cancelled", cancellation_fee_minor: 0, cancel_reason: "Cancelled by EVChargePress: account suspended" });
    expect(errorCode(await book(driver, NOW, evseId, START))).toBe("EVB23");
    expect(errorCode(await asUser(driver, NOW, "insert into public.checkins (station_id, user_id, status) values ($1, $2, 'working')", [stationId, driver]))).toBe("42501");
    expect(errorCode(await asUser(driver, NOW, "insert into public.reviews (station_id, user_id, rating) values ($1, $2, 4)", [stationId, driver]))).toBe("42501");
    // The driver cannot lift it themselves.
    expect(errorCode(await asUser(driver, NOW, "update public.profiles set status = 'active' where id = $1", [driver]))).toBe("42501");
    expectOk(await asUser(admin, NOW, "select * from public.admin_set_user_status($1, 'active')", [driver]));
    expectOk(await book(driver, NOW, evseId, START));
    const log = (await db.query("select action, detail from public.admin_audit where target_id = $1 order by id", [driver])).rows;
    expect(log.map((l) => l.action)).toEqual(["suspend_user", "reactivate_user"]);
    expect(log[0].detail).toMatchObject({ reason: "Repeated no-shows", bookings_cancelled: 1 });
  });

  it("cancels any booking without a fee, reads all bookings, moderates reports", async () => {
    const admin = await makeAdmin();
    const driver = await createUser();
    const { stationId, evseId } = await createStation();
    const b = expectOk(await book(driver, NOW, evseId, START));
    const seen = await asUser<{ id: string }>(admin, NOW, "select id from public.bookings where id = $1", [b.id]);
    expect(seen.ok && seen.value).toHaveLength(1);
    expect(errorCode(await asUser(admin, NOW, "select * from public.admin_cancel_booking($1, ' ')", [b.id]))).toBe("EVB24");
    const c = expectOk(await asUser<{ status: string; cancellation_fee_minor: number }>(admin, NOW,
      "select * from public.admin_cancel_booking($1, 'Charger under maintenance')", [b.id]));
    expect(c).toMatchObject({ status: "cancelled", cancellation_fee_minor: 0 });
    const ev = (await db.query("select actor_id, reason from public.booking_events where booking_id = $1 order by id desc limit 1", [b.id])).rows[0];
    expect(ev).toEqual({ actor_id: admin, reason: "Cancelled by admin: Charger under maintenance" });

    const ck = expectOk(await asUser<{ id: string }>(driver, NOW,
      "insert into public.checkins (station_id, user_id, status, comment) values ($1, $2, 'broken', 'spam') returning id", [stationId, driver]));
    const other = await createUser();
    const nope = await asUser(other, NOW, "delete from public.checkins where id = $1 returning id", [ck.id]);
    expect(nope.ok && nope.value).toEqual([]);
    const gone = await asUser(admin, NOW, "delete from public.checkins where id = $1 returning id", [ck.id]);
    expect(gone.ok && gone.value).toHaveLength(1);
    const a = (await db.query("select action, detail from public.admin_audit where target_table = 'checkins' and target_id = $1", [ck.id])).rows[0];
    expect(a).toMatchObject({ action: "delete", detail: { comment: "spam" } });
  });

  it("registers a charger and returns its secret once, never exposing the hash", async () => {
    const admin = await makeAdmin();
    const { stationId } = await createStation();
    const ident = `CP-${crypto.randomUUID().slice(0, 8)}`;
    const secret = expectOk(await asUser<{ s: string }>(admin, NOW, "select public.admin_register_charge_point($1, $2) as s", [stationId, ident])).s;
    expect(secret).toMatch(/^[0-9a-f]{48}$/);
    const list = await asUser<Record<string, unknown>>(admin, NOW, "select * from public.admin_charge_points() where identity = $1", [ident]);
    const row = list.ok ? list.value[0] : {};
    expect(row).toMatchObject({ identity: ident, network_name: "EVChargePress OCPP", is_online: false });
    expect(row).not.toHaveProperty("secret_hash");
    const { stationId: elsewhere } = await createStation();
    expect(errorCode(await asUser(admin, NOW, "select public.admin_register_charge_point($1, $2)", [elsewhere, ident]))).toBe("EVB24");
    const audit = (await db.query("select detail from public.admin_audit where target_id = $1", [ident])).rows;
    expect(JSON.stringify(audit)).not.toContain(secret);
  });
});
