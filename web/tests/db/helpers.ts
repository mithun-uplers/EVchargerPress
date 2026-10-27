import { Pool, type PoolClient } from "pg";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const DB_NAME = process.env.TEST_DATABASE_NAME ?? "evcp_test";
const url = new URL(ADMIN_URL);
url.pathname = `/${DB_NAME}`;

/** Superuser pool: used to arrange fixtures and inspect results. */
export const db = new Pool({ connectionString: url.toString(), max: 40 });

export type DbError = { code: string; message: string; detail?: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: DbError };

/**
 * Runs `sql` in its own transaction as the Supabase `authenticated` role,
 * signed in as `userId` (or as nobody when null), with the clock pinned to `now`.
 */
export async function asUser<T = Record<string, unknown>>(
  userId: string | null,
  now: string,
  sql: string,
  params: unknown[] = [],
  role: "authenticated" | "anon" = "authenticated",
): Promise<Result<T[]>> {
  const client: PoolClient = await db.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.sub', $1, true), set_config('app.now', $2, true)", [
      userId ?? "",
      now,
    ]);
    await client.query(`set local role ${role}`);
    const res = await client.query(sql, params);
    await client.query("commit");
    return { ok: true, value: res.rows as T[] };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    const err = e as DbError;
    return { ok: false, error: { code: err.code, message: err.message, detail: err.detail } };
  } finally {
    client.release();
  }
}

/** Runs `sql` as the superuser with the clock pinned (for the sweeper and direct-update tests). */
export async function asAdmin<T = Record<string, unknown>>(now: string, sql: string, params: unknown[] = []): Promise<Result<T[]>> {
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.now', $1, true)", [now]);
    const res = await client.query(sql, params);
    await client.query("commit");
    return { ok: true, value: res.rows as T[] };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    const err = e as DbError;
    return { ok: false, error: { code: err.code, message: err.message, detail: err.detail } };
  } finally {
    client.release();
  }
}

export async function createUser(name = "Test driver"): Promise<string> {
  const { rows } = await db.query(
    "insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('display_name', $2::text)) returning id",
    [`${crypto.randomUUID()}@test.local`, name],
  );
  return rows[0].id as string;
}

export type Hours = { weekday: number; opens: string; closes: string }[];
export const EVERY_DAY = (opens: string, closes: string): Hours =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens, closes }));

export type StationOptions = {
  timeZone?: string;
  hours?: Hours;
  rules?: Partial<{
    slot_step_min: number;
    min_duration_min: number;
    max_duration_min: number;
    buffer_min: number;
    lead_time_min: number;
    max_advance_days: number;
    hold_minutes: number;
    free_cancel_until_min: number;
    check_in_early_min: number;
    no_show_grace_min: number;
    max_active_per_user: number;
  }> | null;
  tariff?: {
    currency?: string;
    tax_mode?: "inclusive" | "exclusive";
    tax_rate_bp?: number;
    components: { type: string; price_minor: number }[];
  } | null;
  evses?: { label: string; max_power_kw?: number; is_bookable?: boolean; connectors?: { type: string; power_kw?: number | null }[] }[];
};

export const DEFAULT_TARIFF = {
  currency: "INR",
  tax_mode: "exclusive" as const,
  tax_rate_bp: 1800,
  components: [
    { type: "energy_kwh", price_minor: 1800 },
    { type: "reservation_fixed", price_minor: 5000 },
  ],
};

/** Creates a station with hours, rules, a tariff and charging points. Returns ids. */
export async function createStation(opts: StationOptions = {}) {
  const tz = opts.timeZone ?? "Asia/Kolkata";
  const { rows } = await db.query(
    `insert into public.stations (name, address, city, lat, lng, data_source, time_zone)
     values ($1, 'Test road', 'Testville', 12.97, 77.59, 'demo', $2) returning id`,
    [`Test station ${crypto.randomUUID().slice(0, 8)}`, tz],
  );
  const stationId = rows[0].id as string;
  for (const h of opts.hours ?? EVERY_DAY("00:00", "24:00")) {
    await db.query("insert into public.operating_hours (station_id, weekday, opens_at, closes_at) values ($1,$2,$3,$4)", [
      stationId,
      h.weekday,
      h.opens,
      h.closes,
    ]);
  }
  if (opts.rules !== null) {
    const r = { lead_time_min: 15, ...(opts.rules ?? {}) };
    const cols = Object.keys(r);
    await db.query(
      `insert into public.booking_rules (station_id, ${cols.join(",")}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(",")})`,
      [stationId, ...Object.values(r)],
    );
  }
  const evseIds: string[] = [];
  for (const [i, e] of (opts.evses ?? [{ label: "DC-1", max_power_kw: 60 }]).entries()) {
    const res = await db.query(
      "insert into public.evses (station_id, evse_uid, label, max_power_kw, is_bookable) values ($1,$2,$3,$4,$5) returning id",
      [stationId, `E${i + 1}`, e.label, e.max_power_kw ?? 60, e.is_bookable ?? true],
    );
    evseIds.push(res.rows[0].id);
    for (const c of e.connectors ?? [{ type: "CCS2", power_kw: e.max_power_kw ?? 60 }]) {
      await db.query("insert into public.connectors (station_id, evse_id, type, power_kw) values ($1,$2,$3,$4)", [
        stationId,
        res.rows[0].id,
        c.type,
        c.power_kw ?? null,
      ]);
    }
  }
  if (opts.tariff !== null) {
    const t = { ...DEFAULT_TARIFF, ...(opts.tariff ?? {}) };
    const tr = await db.query(
      `insert into public.tariffs (station_id, name, currency, tax_mode, tax_rate_bp, valid_from, source)
       values ($1, 'Test tariff', $2, $3, $4, '2020-01-01', 'demo') returning id`,
      [stationId, t.currency, t.tax_mode, t.tax_rate_bp],
    );
    for (const c of t.components) {
      await db.query("insert into public.tariff_components (tariff_id, type, price_minor) values ($1,$2,$3)", [
        tr.rows[0].id,
        c.type,
        c.price_minor,
      ]);
    }
  }
  return { stationId, evseIds, evseId: evseIds[0] };
}

export type Booking = {
  id: string;
  reference: string;
  status: string;
  period: string;
  hold_expires_at: string;
  price_snapshot: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  reservation_fee_minor: number;
  estimated_total_minor: number;
  cancellation_fee_minor: number | null;
};

export function book(userId: string, now: string, evseId: string, start: string, minutes = 60, key = newKey()) {
  return asUser<Booking>(userId, now, "select * from public.create_booking($1, $2, $3, $4)", [evseId, start, minutes, key]);
}
export const confirm = (userId: string, now: string, bookingId: string) =>
  asUser<Booking>(userId, now, "select * from public.confirm_booking($1)", [bookingId]);
export const cancel = (userId: string, now: string, bookingId: string, reason?: string) =>
  asUser<Booking>(userId, now, "select * from public.cancel_booking($1, $2)", [bookingId, reason ?? null]);
export const checkIn = (userId: string, now: string, bookingId: string) =>
  asUser<Booking>(userId, now, "select * from public.check_in_booking($1)", [bookingId]);

export function newKey() {
  return crypto.randomUUID();
}

export function expectOk<T>(r: Result<T[]>): T {
  if (!r.ok) throw new Error(`Expected success, got ${r.error.code} ${r.error.message}: ${r.error.detail ?? ""}`);
  return r.value[0];
}
export function errorCode<T>(r: Result<T[]>): string {
  if (r.ok) throw new Error(`Expected an error, got success: ${JSON.stringify(r.value[0]).slice(0, 200)}`);
  return r.error.code;
}

export async function liveBookings(evseId: string) {
  const { rows } = await db.query(
    "select id, user_id, period, buffered_period, status from public.bookings where evse_id = $1 and status in ('pending','confirmed','checked_in') order by lower(period)",
    [evseId],
  );
  return rows;
}

export async function events(bookingId: string) {
  const { rows } = await db.query(
    "select from_status, to_status, reason from public.booking_events where booking_id = $1 order by id",
    [bookingId],
  );
  return rows as { from_status: string | null; to_status: string; reason: string | null }[];
}

export type VehicleOptions = {
  vehicle_type?: string;
  make?: string;
  model?: string;
  battery_capacity_kwh?: number | null;
  max_ac_kw?: number | null;
  max_dc_kw?: number | null;
  connectors?: { type: string; supported_power_kw?: number | null }[];
};

/** Adds a vehicle as its owner (through RLS), with connector types. */
export async function createVehicle(userId: string, opts: VehicleOptions = {}): Promise<string> {
  const r = await asUser<{ id: string }>(
    userId,
    new Date().toISOString(),
    `insert into public.vehicles (user_id, vehicle_type, make, model, battery_capacity_kwh, max_ac_kw, max_dc_kw)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [userId, opts.vehicle_type ?? "car", opts.make ?? "Tata", opts.model ?? "Nexon EV", opts.battery_capacity_kwh ?? null,
     opts.max_ac_kw ?? null, opts.max_dc_kw ?? null],
  );
  const id = expectOk(r).id;
  for (const c of opts.connectors ?? [{ type: "CCS2" }]) {
    expectOk(await asUser(userId, new Date().toISOString(),
      "insert into public.vehicle_connectors (vehicle_id, connector_type, supported_power_kw) values ($1,$2,$3) returning vehicle_id",
      [id, c.type, c.supported_power_kw ?? null]));
  }
  return id;
}

export function bookWithVehicle(userId: string, now: string, evseId: string, vehicleId: string | null, start: string, minutes = 60, key = newKey()) {
  return asUser<Booking>(userId, now, "select * from public.book_slot($1, $2, $3, $4, $5)", [evseId, vehicleId, start, minutes, key]);
}
