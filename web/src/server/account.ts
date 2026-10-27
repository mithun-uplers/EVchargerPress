import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  display_name: string | null;
  phone: string | null;
  status: "active" | "suspended" | "deletion_requested";
  distance_unit: "km" | "mi";
  share_location: boolean;
  email_reminders: boolean;
  onboarded_at: string | null;
  deletion_requested_at: string | null;
  preferred_vehicle_id: string | null;
};

export type VehicleType = "car" | "motorcycle" | "scooter" | "bicycle" | "other";
export type Vehicle = {
  id: string;
  vehicle_type: VehicleType;
  make: string;
  model: string;
  model_year: number | null;
  nickname: string | null;
  registration_label: string | null;
  battery_capacity_kwh: number | null;
  max_ac_kw: number | null;
  max_dc_kw: number | null;
  created_at: string;
  vehicle_connectors: { connector_type: string; supported_power_kw: number | null }[];
};

export type BatteryReading = { id: number; recorded_at: string; soc_percent: number | null; odometer_km: number | null; source: string; notes: string | null };

export type Session = {
  id: string;
  started_at: string;
  ended_at: string | null;
  energy_kwh: number | null;
  total_cost_minor: number | null;
  currency: string;
  source: "manual" | "operator_api" | "charger_ocpp";
  status: string;
  notes: string | null;
  booking: { reference: string } | null;
  vehicle: { make: string; model: string; nickname: string | null } | null;
  station: { name: string; time_zone: string } | null;
};

const VEHICLE_COLUMNS =
  "id,vehicle_type,make,model,model_year,nickname,registration_label,battery_capacity_kwh,max_ac_kw,max_dc_kw,created_at,vehicle_connectors(connector_type,supported_power_kw)";

export const vehicleLabel = (v: Pick<Vehicle, "nickname" | "make" | "model">) => v.nickname || `${v.make} ${v.model}`;

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id,display_name,phone,status,distance_unit,share_location,email_reminders,onboarded_at,deletion_requested_at,preferred_vehicle_id")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function listVehicles(): Promise<Vehicle[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("vehicles").select(VEHICLE_COLUMNS).is("deleted_at", null).order("created_at");
  return (data ?? []) as unknown as Vehicle[];
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("vehicles").select(VEHICLE_COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as unknown as Vehicle | null) ?? null;
}

export async function listBatteryReadings(vehicleId: string, limit = 60): Promise<BatteryReading[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("battery_readings")
    .select("id,recorded_at,soc_percent,odometer_km,source,notes")
    .eq("vehicle_id", vehicleId)
    .order("recorded_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as BatteryReading[];
}

export async function listSessions(limit = 100): Promise<Session[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("charging_sessions")
    .select(
      "id,started_at,ended_at,energy_kwh,total_cost_minor,currency,source,status,notes,booking:bookings(reference),vehicle:vehicles(make,model,nickname),station:stations(name,time_zone)",
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as Session[];
}

/** Bookings a user can attach a manual session to (started or finished ones). */
export async function sessionCandidateBookings() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id,reference,period,status,station:stations(name)")
    .in("status", ["checked_in", "completed", "confirmed", "no_show"])
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as unknown as { id: string; reference: string; period: string; status: string; station: { name: string } | null }[];
}

/** Monthly totals over the sessions the user has, newest month first. */
export function monthlyTotals(sessions: Session[], months = 6, now = new Date()) {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const totals = new Map(keys.map((k) => [k, { month: k, energy_kwh: 0, cost_minor: 0, sessions: 0 }]));
  for (const s of sessions) {
    const t = totals.get(s.started_at.slice(0, 7));
    if (!t) continue;
    t.sessions += 1;
    t.energy_kwh += Number(s.energy_kwh ?? 0);
    t.cost_minor += Number(s.total_cost_minor ?? 0);
  }
  return keys.map((k) => totals.get(k)!);
}
