import "server-only";
import { parseRange } from "@/lib/booking-types";
import type { FinishedBookingInput } from "@/lib/charging-stats";
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
  booking: { id: string; reference: string } | null;
  vehicle: { id: string; make: string; model: string; nickname: string | null } | null;
  station: { name: string; time_zone: string; address: string | null; city: string | null; operator: string | null } | null;
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
      "id,started_at,ended_at,energy_kwh,total_cost_minor,currency,source,status,notes,booking:bookings(id,reference),vehicle:vehicles(id,make,model,nickname),station:stations(name,time_zone,address,city,operator)",
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


/** Completed bookings (newest first) — those without a recorded session show as estimates in history. */
export async function listFinishedBookings(limit = 100): Promise<FinishedBookingInput[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id,reference,period,currency,estimated_total_minor,price_snapshot,station:stations(name,time_zone,address,city,operator),vehicle:vehicles(id,make,model,nickname)")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(limit);
  type Row = {
    id: string; reference: string; period: string; currency: string; estimated_total_minor: number;
    price_snapshot: { assumptions?: { estimated_kwh?: number } } | null;
    station: FinishedBookingInput["station"]; vehicle: FinishedBookingInput["vehicle"];
  };
  return ((data ?? []) as unknown as Row[]).map((b) => {
    const { start, end } = parseRange(b.period);
    const kwh = b.price_snapshot?.assumptions?.estimated_kwh;
    return {
      id: b.id, reference: b.reference, start: start.toISOString(), end: end.toISOString(), currency: b.currency,
      estimatedTotalMinor: b.estimated_total_minor, estimatedKwh: typeof kwh === "number" ? kwh : null,
      station: b.station, vehicle: b.vehicle,
    };
  });
}

/** Most recent manual reading per vehicle (for the vehicles list). */
export async function latestReadings(vehicleIds: string[]): Promise<Record<string, BatteryReading>> {
  if (vehicleIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("battery_readings")
    .select("id,vehicle_id,recorded_at,soc_percent,odometer_km,source,notes")
    .in("vehicle_id", vehicleIds)
    .order("recorded_at", { ascending: false })
    .limit(200);
  const out: Record<string, BatteryReading> = {};
  for (const r of (data ?? []) as (BatteryReading & { vehicle_id: string })[]) if (!out[r.vehicle_id]) out[r.vehicle_id] = r;
  return out;
}
