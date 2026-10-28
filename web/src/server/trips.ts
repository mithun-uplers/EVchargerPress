import "server-only";
import { createClient } from "@/lib/supabase/server";
import { rpc } from "@/server/bookings";

export type TripRow = {
  id: string; name: string; vehicle_id: string | null;
  from_label: string; from_lat: number; from_lng: number; to_label: string; to_lat: number; to_lng: number;
  distance_km: number; duration_min: number | null; route_source: "osrm" | "straight_line"; route_geometry: { type: "LineString"; coordinates: [number, number][] };
  start_soc_percent: number; reserve_percent: number; consumption_kwh_per_100km: number; battery_kwh: number;
  feasible: boolean; arrive_soc_percent: number | null; charge_minutes: number | null; energy_kwh: number | null;
  gap_from_km: number | null; gap_to_km: number | null; notes: string | null; created_at: string;
  vehicle?: { make: string; model: string; nickname: string | null } | null;
};
export type TripStationRow = {
  id: number; station_id: string | null; name: string; city: string | null; operator: string | null; lat: number; lng: number;
  connector_types: string[]; max_power_kw: number | null; is_bookable: boolean; is_compatible: boolean; along_km: number; detour_km: number;
  stop_order: number | null; arrive_soc_percent: number | null; depart_soc_percent: number | null; energy_kwh: number | null;
  power_kw: number | null; charge_minutes: number | null;
};

const LIST = "id,name,vehicle_id,from_label,to_label,distance_km,duration_min,feasible,arrive_soc_percent,charge_minutes,created_at,route_source,vehicle:vehicles(make,model,nickname)";

export async function listTrips() {
  const supabase = await createClient();
  const [{ data: trips }, { data: stops }] = await Promise.all([
    supabase.from("trips").select(LIST).order("created_at", { ascending: false }).limit(100),
    supabase.from("trip_stations").select("trip_id,stop_order,is_compatible").limit(5000),
  ]);
  const counts = new Map<string, { stops: number; stations: number; compatible: number }>();
  for (const s of (stops ?? []) as { trip_id: string; stop_order: number | null; is_compatible: boolean }[]) {
    const c = counts.get(s.trip_id) ?? { stops: 0, stations: 0, compatible: 0 };
    c.stations++;
    if (s.stop_order) c.stops++;
    if (s.is_compatible) c.compatible++;
    counts.set(s.trip_id, c);
  }
  return ((trips ?? []) as unknown as TripRow[]).map((t) => ({ ...t, counts: counts.get(t.id) ?? { stops: 0, stations: 0, compatible: 0 } }));
}

export async function getTrip(id: string) {
  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select("*,vehicle:vehicles(make,model,nickname)").eq("id", id).maybeSingle();
  if (!trip) return null;
  const { data: stations } = await supabase.from("trip_stations").select("*").eq("trip_id", id).order("along_km");
  return { trip: trip as unknown as TripRow, stations: (stations ?? []) as TripStationRow[] };
}

export const saveTrip = (trip: unknown, stations: unknown) => rpc<{ id: string }>("save_trip", { p_trip: trip, p_stations: stations });

export async function deleteTrip(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
