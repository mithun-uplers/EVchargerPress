"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CONNECTOR_TYPES } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/admin";
import { BookingError, rpc, toBookingError } from "@/server/bookings";

/**
 * Admin server actions. Each one re-checks the admin role here and again in Postgres
 * (RLS policies and admin_* functions), so a forged form post from a driver does nothing.
 */

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const num = (f: FormData, k: string) => {
  const s = str(f, k);
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";

/** Only same-site admin paths are allowed as a return address. */
function safeBack(f: FormData, fallback: string) {
  const b = str(f, "back");
  return b.startsWith("/admin") && !b.startsWith("//") ? b : fallback;
}
function withMsg(path: string, key: "ok" | "error", msg: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("ok");
  params.delete("error");
  params.set(key, msg);
  return `${base}?${params.toString()}`;
}
function messageOf(e: unknown) {
  if (e instanceof BookingError) return e.message;
  console.error("Admin action failed", e);
  return "Something went wrong. Please try again.";
}
async function db<T>(p: PromiseLike<{ data: T; error: { code?: string; message?: string; details?: string | null } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw toBookingError(error);
  return data;
}
class Invalid extends BookingError {
  constructor(message: string) {
    super("invalid_request", 400, message);
  }
}

/** Runs `op`, then redirects back with a success or error message. */
async function act(back: string, okMsg: string, op: () => Promise<string | void>) {
  let target: string;
  try {
    const next = await op();
    target = withMsg(next || back, "ok", okMsg);
  } catch (e) {
    target = withMsg(back, "error", messageOf(e));
  }
  revalidatePath("/", "layout");
  redirect(target);
}

/* ---------- Stations ---------- */

function stationFields(f: FormData) {
  const name = str(f, "name");
  const lat = num(f, "lat");
  const lng = num(f, "lng");
  if (name.length < 2 || name.length > 120) throw new Invalid("Enter a station name (2–120 characters).");
  if (!str(f, "address") || !str(f, "city")) throw new Invalid("Address and city are required.");
  if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
    throw new Invalid("Enter a valid latitude and longitude.");
  return {
    name,
    address: str(f, "address"),
    city: str(f, "city"),
    state: str(f, "state") || null,
    postal_code: str(f, "postal_code") || null,
    lat,
    lng,
    operator: str(f, "operator") || null,
    access: str(f, "access") === "restricted" ? "restricted" : "public",
    hours: str(f, "hours") || null,
    price_info: str(f, "price_info") || null,
    time_zone: str(f, "time_zone") || "Asia/Kolkata",
    is_verified: bool(f, "is_verified"),
  };
}

export async function createStationAction(f: FormData) {
  const admin = await requireAdmin("/admin/stations/new");
  await act("/admin/stations/new", "Station created. Next: add charging points, hours, rules and a tariff to take bookings.", async () => {
    const fields = stationFields(f);
    const connectors: { type: string; power_kw: number; quantity: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const type = str(f, `c${i}_type`);
      if (!type) continue;
      const kw = num(f, `c${i}_kw`);
      const qty = num(f, `c${i}_qty`) ?? 1;
      if (!(CONNECTOR_TYPES as readonly string[]).includes(type)) throw new Invalid("Unknown connector type.");
      if (!kw || kw <= 0 || !(qty > 0)) throw new Invalid("Each connector needs a power (kW) and quantity.");
      connectors.push({ type, power_kw: kw, quantity: Math.floor(qty) });
    }
    if (!connectors.length) throw new Invalid("Add at least one connector.");
    const supabase = await createClient();
    const station = await db(supabase.from("stations").insert({ ...fields, created_by: admin.id, data_source: "community", is_demo: false }).select("id").single());
    if (!station) throw new Invalid("Could not create the station.");
    await db(supabase.from("connectors").insert(connectors.map((c) => ({ ...c, station_id: station.id }))));
    return `/admin/stations/${station.id}`;
  });
}

export async function updateStationAction(f: FormData) {
  const id = str(f, "station_id");
  await requireAdmin(`/admin/stations/${id}`);
  await act(`/admin/stations/${id}`, "Station details saved.", async () => {
    const supabase = await createClient();
    const rows = await db(supabase.from("stations").update(stationFields(f)).eq("id", id).select("id"));
    if (!rows?.length) throw new Invalid("Station not found.");
  });
}

export async function setVerifiedAction(f: FormData) {
  const id = str(f, "station_id");
  await requireAdmin();
  const on = bool(f, "verified");
  await act(safeBack(f, "/admin/stations"), on ? "Station marked as verified." : "Verification removed.", async () => {
    const supabase = await createClient();
    await db(supabase.from("stations").update({ is_verified: on }).eq("id", id).select("id"));
  });
}

export async function deleteStationAction(f: FormData) {
  const id = str(f, "station_id");
  await requireAdmin();
  await act(`/admin/stations/${id}`, "Station deleted.", async () => {
    if (str(f, "confirm") !== "DELETE") throw new Invalid("Type DELETE to confirm.");
    const supabase = await createClient();
    const rows = await db(supabase.from("stations").delete().eq("id", id).select("id"));
    if (!rows?.length) throw new Invalid("Station not found.");
    return "/admin/stations";
  });
}

/* ---------- Connectors ---------- */

export async function addConnectorAction(f: FormData) {
  const stationId = str(f, "station_id");
  await requireAdmin();
  await act(`/admin/stations/${stationId}#connectors`, "Connector added.", async () => {
    const type = str(f, "type");
    const kw = num(f, "power_kw");
    const qty = num(f, "quantity") ?? 1;
    if (!(CONNECTOR_TYPES as readonly string[]).includes(type)) throw new Invalid("Pick a connector type.");
    if (kw !== null && (Number.isNaN(kw) || kw <= 0)) throw new Invalid("Power must be a positive number of kW.");
    if (!(qty > 0)) throw new Invalid("Quantity must be at least 1.");
    const supabase = await createClient();
    await db(supabase.from("connectors").insert({ station_id: stationId, type, power_kw: kw, quantity: Math.floor(qty), evse_id: str(f, "evse_id") || null }));
  });
}

export async function removeConnectorAction(f: FormData) {
  const stationId = str(f, "station_id");
  await requireAdmin();
  await act(`/admin/stations/${stationId}#connectors`, "Connector removed.", async () => {
    const supabase = await createClient();
    await db(supabase.from("connectors").delete().eq("id", str(f, "connector_id")).eq("station_id", stationId).select("id"));
  });
}

/* ---------- Charging points (EVSEs) ---------- */

export async function saveEvseAction(f: FormData) {
  const stationId = str(f, "station_id");
  const evseId = str(f, "evse_id");
  await requireAdmin();
  await act(`/admin/stations/${stationId}#evses`, evseId ? "Charging point saved." : "Charging point added.", async () => {
    const label = str(f, "label");
    const uid = str(f, "evse_uid");
    const kw = num(f, "max_power_kw");
    const ocpp = num(f, "ocpp_connector_id");
    if (!label || label.length > 60) throw new Invalid("Give the charging point a label (up to 60 characters).");
    if (!uid || uid.length > 64) throw new Invalid("Give the charging point an ID (up to 64 characters).");
    if (kw !== null && (Number.isNaN(kw) || kw <= 0)) throw new Invalid("Max power must be a positive number of kW.");
    const chargePoint = str(f, "charge_point_id") || null;
    if (chargePoint && (ocpp === null || Number.isNaN(ocpp) || ocpp < 1 || ocpp > 32)) throw new Invalid("Enter the OCPP connector number (1–32) for the linked charger.");
    const row = {
      station_id: stationId,
      label,
      evse_uid: uid,
      max_power_kw: kw,
      is_bookable: bool(f, "is_bookable"),
      is_active: evseId ? bool(f, "is_active") : true,
      charge_point_id: chargePoint,
      ocpp_connector_id: chargePoint ? ocpp : null,
    };
    const supabase = await createClient();
    if (evseId) await db(supabase.from("evses").update(row).eq("id", evseId).eq("station_id", stationId).select("id"));
    else await db(supabase.from("evses").insert(row).select("id"));
  });
}

/* ---------- Hours, rules, tariff ---------- */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export async function saveHoursAction(f: FormData) {
  const stationId = str(f, "station_id");
  await requireAdmin();
  await act(`/admin/stations/${stationId}#hours`, "Opening hours saved.", async () => {
    const rows: { station_id: string; weekday: number; opens_at: string; closes_at: string }[] = [];
    for (let d = 0; d < 7; d++) {
      if (!bool(f, `d${d}_open`)) continue;
      const opens = str(f, `d${d}_from`) || "00:00";
      const closes = str(f, `d${d}_to`) || "24:00";
      if (!TIME.test(opens) || !TIME.test(closes) || opens >= closes) throw new Invalid("Each open day needs an opening time before its closing time (use 24:00 for midnight).");
      rows.push({ station_id: stationId, weekday: d, opens_at: opens, closes_at: closes });
    }
    const supabase = await createClient();
    await db(supabase.from("operating_hours").delete().eq("station_id", stationId).select("id"));
    if (rows.length) await db(supabase.from("operating_hours").insert(rows).select("id"));
  });
}

const RULE_FIELDS = {
  slot_step_min: [5, 60],
  min_duration_min: [5, 720],
  max_duration_min: [5, 720],
  buffer_min: [0, 120],
  lead_time_min: [0, 1440],
  max_advance_days: [1, 90],
  hold_minutes: [1, 60],
  free_cancel_until_min: [0, 2880],
  check_in_early_min: [0, 120],
  no_show_grace_min: [0, 120],
  max_active_per_user: [1, 20],
} as const;

export async function saveRulesAction(f: FormData) {
  const stationId = str(f, "station_id");
  await requireAdmin();
  await act(`/admin/stations/${stationId}#rules`, "Booking rules saved.", async () => {
    const row: Record<string, string | number> = { station_id: stationId };
    for (const [k, [lo, hi]] of Object.entries(RULE_FIELDS)) {
      const v = num(f, k);
      if (v === null) continue;
      if (Number.isNaN(v) || !Number.isInteger(v) || v < lo || v > hi) throw new Invalid(`${k.replaceAll("_", " ")} must be a whole number from ${lo} to ${hi}.`);
      row[k] = v;
    }
    if (Number(row.min_duration_min ?? 0) > Number(row.max_duration_min ?? Infinity)) throw new Invalid("Minimum duration can’t be longer than the maximum.");
    const supabase = await createClient();
    await db(supabase.from("booking_rules").upsert(row, { onConflict: "station_id" }).select("station_id"));
  });
}

const PRICE_FIELDS = ["energy_kwh", "time_min", "session_fixed", "reservation_fixed", "idle_min"] as const;

export async function saveTariffAction(f: FormData) {
  const stationId = str(f, "station_id");
  await requireAdmin();
  await act(`/admin/stations/${stationId}#tariff`, "New tariff published. Existing bookings keep the price they were quoted.", async () => {
    const components: Record<string, number> = {};
    for (const k of PRICE_FIELDS) {
      const v = num(f, k);
      if (v === null) continue;
      if (Number.isNaN(v) || v < 0 || v > 100000) throw new Invalid("Prices must be amounts between 0 and 1,00,000.");
      components[k] = Math.round(v * 100);
    }
    const tax = num(f, "tax_rate");
    if (tax === null || Number.isNaN(tax) || tax < 0 || tax > 50) throw new Invalid("Tax rate must be between 0 and 50%.");
    const name = str(f, "name") || "Standard";
    await rpc("admin_set_tariff", {
      p_station_id: stationId,
      p_name: name.slice(0, 80),
      p_currency: (str(f, "currency") || "INR").toUpperCase(),
      p_tax_mode: str(f, "tax_mode") === "inclusive" ? "inclusive" : "exclusive",
      p_tax_rate_bp: Math.round(tax * 100),
      p_components: components,
    });
  });
}

/* ---------- Bookings ---------- */

export async function adminCancelBookingAction(f: FormData) {
  await requireAdmin();
  await act(safeBack(f, "/admin/bookings"), "Booking cancelled with no fee. The driver sees your reason.", async () => {
    await rpc("admin_cancel_booking", { p_booking_id: str(f, "booking_id"), p_reason: str(f, "reason") });
  });
}

/* ---------- Users ---------- */

export async function setAdminAction(f: FormData) {
  await requireAdmin();
  const make = bool(f, "admin");
  await act(safeBack(f, "/admin/users"), make ? "Admin access granted." : "Admin access removed.", async () => {
    await rpc("admin_set_admin", { p_user_id: str(f, "user_id"), p_admin: make });
  });
}

export async function setUserStatusAction(f: FormData) {
  await requireAdmin();
  const status = str(f, "status") === "suspended" ? "suspended" : "active";
  await act(safeBack(f, "/admin/users"), status === "suspended" ? "Account suspended. Their upcoming bookings were cancelled without a fee." : "Account reactivated.", async () => {
    await rpc("admin_set_user_status", { p_user_id: str(f, "user_id"), p_status: status, p_reason: str(f, "reason") || null });
  });
}

/* ---------- Moderation ---------- */

export async function removeReportAction(f: FormData) {
  await requireAdmin();
  const kind = str(f, "kind") === "review" ? "reviews" : "checkins";
  await act(safeBack(f, "/admin/reports"), kind === "reviews" ? "Review removed." : "Report removed.", async () => {
    const supabase = await createClient();
    const rows = await db(supabase.from(kind).delete().eq("id", str(f, "id")).select("id"));
    if (!rows?.length) throw new Invalid("It was already removed.");
  });
}

/* ---------- Chargers ---------- */

export async function setChargePointActiveAction(f: FormData) {
  await requireAdmin();
  const on = bool(f, "active");
  await act(safeBack(f, "/admin/chargers"), on ? "Charger enabled." : "Charger disabled. It can no longer connect.", async () => {
    await rpc("admin_set_charge_point_active", { p_charge_point_id: str(f, "charge_point_id"), p_active: on });
  });
}

export type RegisterState = { error?: string; identity?: string; secret?: string } | null;

/** Returns the new secret in the action result (never in a URL); it is shown once and only its hash is stored. */
export async function registerChargePointAction(_prev: RegisterState, f: FormData): Promise<RegisterState> {
  await requireAdmin();
  const identity = str(f, "identity");
  if (!/^[A-Za-z0-9._-]{3,48}$/.test(identity)) return { error: "Charger ID: 3–48 letters, numbers, dots, dashes or underscores." };
  const stationId = str(f, "station_id");
  if (!stationId) return { error: "Pick a station." };
  try {
    const secret = await rpc<string>("admin_register_charge_point", {
      p_station_id: stationId,
      p_identity: identity,
      p_network_slug: "evcp-ocpp",
      p_simulated: false,
    });
    revalidatePath("/admin/chargers");
    return { identity, secret };
  } catch (e) {
    return { error: messageOf(e) };
  }
}
