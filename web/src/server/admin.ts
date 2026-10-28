import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { rpc, toBookingError } from "@/server/bookings";

/**
 * Admin data access. Every read and write runs as the signed-in user, so Postgres
 * (RLS + public.is_admin()) decides what an admin may see or change; these helpers
 * only shape the data for the admin pages.
 */

/** Whether the signed-in user is an active admin (cached per request). */
export const isAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
});

/** Use at the top of every admin page and action. */
export async function requireAdmin(next = "/admin") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!(await isAdmin())) redirect("/?message=" + encodeURIComponent("That page is for EVChargePress admins."));
  return user;
}

async function q<T>(p: PromiseLike<{ data: unknown; error: { code?: string; message?: string; details?: string | null } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw toBookingError(error);
  return data as T;
}

export type Dashboard = {
  users: number; admins: number; suspended: number; stations: number; stations_by_source: Record<string, number>;
  verified_stations: number; bookable_stations: number; evses: number; bookings_upcoming: number; bookings_today: number;
  bookings_by_status_30d: Record<string, number>; sessions_active: number; sessions_30d: number; kwh_30d: number;
  charge_points: number; charge_points_online: number; charge_points_simulated: number; broken_reports_7d: number;
  checkins_7d: number; reviews: number; generated_at: string;
};
export const dashboard = () => rpc<Dashboard>("admin_dashboard", {});

export type AdminUser = {
  id: string; email: string; display_name: string | null; status: "active" | "suspended" | "deletion_requested"; is_admin: boolean;
  created_at: string; last_sign_in_at: string | null; email_confirmed: boolean; bookings: number; vehicles: number; sessions: number; total: number;
};
export const listUsers = (search: string | null, page: number, size = 25) =>
  rpc<AdminUser[]>("admin_list_users", { p_search: search, p_limit: size, p_offset: (page - 1) * size });

export type AdminStation = {
  id: string; name: string; address: string | null; city: string | null; data_source: string; is_verified: boolean; is_demo: boolean;
  is_bookable: boolean; max_power_kw: number; connector_types: string[]; live_evse_count: number | null; created_at: string;
};
export async function listStations(opts: { search?: string | null; source?: string | null; page: number; size?: number }) {
  const size = opts.size ?? 25;
  const supabase = await createClient();
  let query = supabase
    .from("station_summaries")
    .select("id,name,address,city,data_source,is_verified,is_demo,is_bookable,max_power_kw,connector_types,live_evse_count,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((opts.page - 1) * size, opts.page * size - 1);
  const s = opts.search?.replace(/[%,()]/g, " ").trim();
  if (s) query = query.or(`name.ilike.%${s}%,city.ilike.%${s}%,address.ilike.%${s}%`);
  if (opts.source && ["community", "demo", "openstreetmap"].includes(opts.source)) query = query.eq("data_source", opts.source);
  if (opts.source === "verified") query = query.eq("is_verified", true);
  if (opts.source === "bookable") query = query.eq("is_bookable", true);
  const { data, error, count } = await query;
  if (error) throw toBookingError(error);
  return { rows: (data ?? []) as AdminStation[], total: count ?? 0 };
}

export type StationDetail = {
  station: {
    id: string; name: string; address: string | null; city: string | null; state: string | null; postal_code: string | null; lat: number; lng: number;
    operator: string | null; access: "public" | "restricted"; hours: string | null; price_info: string | null; time_zone: string;
    data_source: string; is_demo: boolean; is_verified: boolean; verified_at: string | null; created_at: string; updated_at: string | null;
  };
  connectors: { id: string; type: string; power_kw: number | null; quantity: number; evse_id: string | null }[];
  evses: {
    id: string; evse_uid: string; label: string; max_power_kw: number | null; is_bookable: boolean; is_active: boolean;
    charge_point_id: string | null; ocpp_connector_id: number | null; live_status: string | null; live_status_at: string | null; live_is_simulated: boolean;
  }[];
  hours: { id: number; weekday: number; opens_at: string; closes_at: string }[];
  rules: Record<string, number> | null;
  tariff: { id: string; name: string; currency: string; tax_mode: "inclusive" | "exclusive"; tax_rate_bp: number; valid_from: string; components: { type: string; price_minor: number }[] } | null;
  chargePoints: { id: string; identity: string }[];
};

export async function getStation(id: string): Promise<StationDetail | null> {
  const supabase = await createClient();
  const { data: station } = await supabase
    .from("stations")
    .select("id,name,address,city,state,postal_code,lat,lng,operator,access,hours,price_info,time_zone,data_source,is_demo,is_verified,verified_at,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!station) return null;
  const [connectors, evses, hours, rules, tariffs, cps] = await Promise.all([
    q<StationDetail["connectors"]>(supabase.from("connectors").select("id,type,power_kw,quantity,evse_id").eq("station_id", id).order("type")),
    q<StationDetail["evses"]>(
      supabase.from("evses")
        .select("id,evse_uid,label,max_power_kw,is_bookable,is_active,charge_point_id,ocpp_connector_id,live_status,live_status_at,live_is_simulated")
        .eq("station_id", id).order("evse_uid"),
    ),
    q<StationDetail["hours"]>(supabase.from("operating_hours").select("id,weekday,opens_at,closes_at").eq("station_id", id).order("weekday").order("opens_at")),
    q<Record<string, number> | null>(supabase.from("booking_rules").select("*").eq("station_id", id).maybeSingle()),
    q<(Omit<NonNullable<StationDetail["tariff"]>, "components"> & { tariff_components: { type: string; price_minor: number }[] })[]>(
      supabase.from("tariffs").select("id,name,currency,tax_mode,tax_rate_bp,valid_from,tariff_components(type,price_minor)")
        .eq("station_id", id).is("evse_id", null).eq("is_active", true).order("valid_from", { ascending: false }).limit(1),
    ),
    rpc<{ id: string; identity: string; station_id: string }[]>("admin_charge_points", {}),
  ]);
  const t = tariffs[0];
  return {
    station: station as StationDetail["station"],
    connectors, evses, hours, rules,
    tariff: t ? { id: t.id, name: t.name, currency: t.currency, tax_mode: t.tax_mode, tax_rate_bp: t.tax_rate_bp, valid_from: t.valid_from, components: t.tariff_components } : null,
    chargePoints: cps.filter((c) => c.station_id === id).map(({ id, identity }) => ({ id, identity })),
  };
}

export type AdminBooking = {
  id: string; reference: string; status: string; period: string; created_at: string; cancel_reason: string | null; currency: string;
  estimated_total_minor: number; reservation_fee_minor: number; cancellation_fee_minor: number | null; user_id: string;
  station: { id: string; name: string; city: string | null; time_zone: string } | null; evse: { label: string } | null;
};
export async function listBookings(opts: { status?: string | null; search?: string | null; page: number; size?: number }) {
  const size = opts.size ?? 25;
  const supabase = await createClient();
  let query = supabase
    .from("bookings")
    .select("id,reference,status,period,created_at,cancel_reason,currency,estimated_total_minor,reservation_fee_minor,cancellation_fee_minor,user_id," +
      "station:stations(id,name,city,time_zone),evse:evses(label)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((opts.page - 1) * size, opts.page * size - 1);
  if (opts.status === "live") query = query.in("status", ["pending", "confirmed", "checked_in"]);
  else if (opts.status) query = query.eq("status", opts.status);
  const ref = opts.search?.trim().toUpperCase();
  if (ref) query = query.ilike("reference", `%${ref.replace(/[%_]/g, "")}%`);
  const { data, error, count } = await query;
  if (error) throw toBookingError(error);
  return { rows: (data ?? []) as unknown as AdminBooking[], total: count ?? 0 };
}

/** Display names for a set of user ids (profiles are readable by everyone). */
export async function namesFor(ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id,display_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? "Driver"]));
}

export type AdminSession = {
  id: string; status: string; source: string; started_at: string; ended_at: string | null; energy_kwh: number | null; total_cost_minor: number | null; last_power_kw: number | null;
  currency: string | null; is_simulated: boolean; user_id: string; last_soc_percent: number | null;
  station: { name: string; time_zone: string } | null; booking: { reference: string } | null;
};
export async function listSessions(opts: { status?: string | null; page: number; size?: number }) {
  const size = opts.size ?? 25;
  const supabase = await createClient();
  let query = supabase
    .from("charging_sessions")
    .select("id,status,source,started_at,ended_at,energy_kwh,total_cost_minor,currency,is_simulated,user_id,last_soc_percent,last_power_kw," +
      "station:stations(name,time_zone),booking:bookings(reference)", { count: "exact" })
    .order("started_at", { ascending: false })
    .range((opts.page - 1) * size, opts.page * size - 1);
  if (opts.status && ["in_progress", "completed", "failed"].includes(opts.status)) query = query.eq("status", opts.status);
  const { data, error, count } = await query;
  if (error) throw toBookingError(error);
  return { rows: (data ?? []) as unknown as AdminSession[], total: count ?? 0 };
}

export type AdminChargePoint = {
  id: string; identity: string; station_id: string; station_name: string; network_name: string; is_simulated: boolean;
  vendor: string | null; model: string | null; firmware_version: string | null; last_boot_at: string | null; last_heartbeat_at: string | null;
  is_active: boolean; is_online: boolean; evse_count: number; charging_count: number; created_at: string;
};
export const chargePoints = () => rpc<AdminChargePoint[]>("admin_charge_points", {});

export type Report = { id: string; kind: "checkin" | "review"; station_id: string; station_name: string; user_id: string; created_at: string; status?: string; rating?: number; comment: string | null };
export async function listReports(kind: "all" | "broken" | "reviews", limit = 60): Promise<Report[]> {
  const supabase = await createClient();
  const checkins = kind === "reviews" ? [] : await q<{ id: string; station_id: string; user_id: string; status: string; comment: string | null; created_at: string; station: { name: string } | null }[]>(
    (() => {
      let c = supabase.from("checkins").select("id,station_id,user_id,status,comment,created_at,station:stations(name)").order("created_at", { ascending: false }).limit(limit);
      if (kind === "broken") c = c.eq("status", "broken");
      return c;
    })(),
  );
  const reviews = kind === "broken" ? [] : await q<{ id: string; station_id: string; user_id: string; rating: number; comment: string | null; created_at: string; station: { name: string } | null }[]>(
    supabase.from("reviews").select("id,station_id,user_id,rating,comment,created_at,station:stations(name)").order("created_at", { ascending: false }).limit(limit),
  );
  return [
    ...checkins.map((c) => ({ id: c.id, kind: "checkin" as const, station_id: c.station_id, station_name: c.station?.name ?? "Station", user_id: c.user_id, created_at: c.created_at, status: c.status, comment: c.comment })),
    ...reviews.map((r) => ({ id: r.id, kind: "review" as const, station_id: r.station_id, station_name: r.station?.name ?? "Station", user_id: r.user_id, created_at: r.created_at, rating: r.rating, comment: r.comment })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

export type AuditEntry = { id: number; actor_id: string | null; action: string; target_table: string; target_id: string | null; detail: Record<string, unknown>; created_at: string };
export async function listAudit(opts: { table?: string | null; page: number; size?: number }) {
  const size = opts.size ?? 40;
  const supabase = await createClient();
  let query = supabase.from("admin_audit").select("*", { count: "exact" }).order("id", { ascending: false }).range((opts.page - 1) * size, opts.page * size - 1);
  if (opts.table) query = query.eq("target_table", opts.table);
  const { data, error, count } = await query;
  if (error) throw toBookingError(error);
  return { rows: (data ?? []) as AuditEntry[], total: count ?? 0 };
}

export type AdminUserDetail = {
  id: string; email: string; display_name: string | null; phone: string | null; status: "active" | "suspended" | "deletion_requested";
  is_admin: boolean; created_at: string; last_sign_in_at: string | null; email_confirmed: boolean; onboarded_at: string | null;
  deletion_requested_at: string | null; password_change_required: boolean; bookings: number; bookings_upcoming: number;
  vehicles: number; sessions: number; checkins: number; reviews: number;
};
export const getUser = (id: string) => rpc<AdminUserDetail>("admin_get_user", { p_user_id: id });

/** Latest admin audit entries about one user (account, profile, role and status changes). */
export async function userAudit(id: string, limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("admin_audit").select("*").eq("target_id", id).order("id", { ascending: false }).limit(limit);
  if (error) throw toBookingError(error);
  return (data ?? []) as AuditEntry[];
}
