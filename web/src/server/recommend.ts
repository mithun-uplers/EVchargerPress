import "server-only";
import { averagePricePerKwhMinor, toHistoryItems } from "@/lib/charging-stats";
import { recommend, type RecCandidate, type Recommendation } from "@/lib/recommend";
import { createClient } from "@/lib/supabase/server";
import type { StationSummary } from "@/lib/types";
import { listSessions, listVehicles, type Profile } from "@/server/account";

/** Recommendations for the signed-in driver: nearby (if we know where they are), familiar and bookable stations. */
export async function recommendationsFor(profile: Profile | null, loc: { lat: number; lng: number } | null): Promise<{ items: Recommendation[]; vehicleLabel: string | null }> {
  const supabase = await createClient();
  const [vehicles, sessions, nearby, bookable] = await Promise.all([
    listVehicles(),
    listSessions(300),
    loc ? supabase.rpc("nearby_stations", { p_lat: loc.lat, p_lng: loc.lng, p_radius_km: 30, p_limit: 60 }) : Promise.resolve({ data: [] }),
    supabase.from("station_summaries").select("id").eq("is_bookable", true).limit(20),
  ]);
  const vehicle = vehicles.find((v) => v.id === profile?.preferred_vehicle_id) ?? vehicles[0] ?? null;
  const distance = new Map<string, number>(((nearby.data ?? []) as { id: string; distance_km: number }[]).map((r) => [r.id, r.distance_km]));
  const visits = new Map<string, number>();
  const { data: mine } = await supabase.from("charging_sessions").select("station_id").not("station_id", "is", null).limit(500);
  for (const r of (mine ?? []) as { station_id: string }[]) visits.set(r.station_id, (visits.get(r.station_id) ?? 0) + 1);

  const ids = [...new Set([...distance.keys(), ...visits.keys(), ...((bookable.data ?? []) as { id: string }[]).map((r) => r.id)])].slice(0, 150);
  if (ids.length === 0) return { items: [], vehicleLabel: null };
  const [{ data: rows }, { data: tariffs }] = await Promise.all([
    supabase.from("station_summaries").select("id,name,city,operator,is_bookable,max_power_kw,connector_types,last_status,live_evse_count,live_available_count,live_is_simulated").in("id", ids),
    supabase.from("tariffs").select("station_id,evse_id,tariff_components(type,price_minor)").in("station_id", ids),
  ]);
  const price = new Map<string, number>();
  for (const t of (tariffs ?? []) as { station_id: string; evse_id: string | null; tariff_components: { type: string; price_minor: number }[] }[]) {
    const e = t.tariff_components.find((c) => c.type === "energy_kwh");
    if (e && !t.evse_id && e.price_minor > 0) price.set(t.station_id, e.price_minor);
  }
  const cands: RecCandidate[] = ((rows ?? []) as StationSummary[]).map((s) => ({
    id: s.id, name: s.name, city: s.city, operator: s.operator, is_bookable: s.is_bookable, max_power_kw: s.max_power_kw,
    connector_types: s.connector_types ?? [], last_status: s.last_status,
    live_evse_count: s.live_evse_count ?? null, live_available_count: s.live_available_count ?? null, live_is_simulated: s.live_is_simulated ?? null,
    distance_km: distance.get(s.id) ?? null, energy_price_minor: price.get(s.id) ?? null, visits: visits.get(s.id) ?? 0,
  }));
  const items = recommend(cands, {
    vehicleConnectors: vehicle ? vehicle.vehicle_connectors.map((c) => c.connector_type) : null,
    vehicleMaxDcKw: vehicle?.max_dc_kw ? Number(vehicle.max_dc_kw) : null,
    avgPricePaidMinor: averagePricePerKwhMinor(toHistoryItems(sessions)),
  });
  return { items, vehicleLabel: vehicle ? vehicle.nickname || `${vehicle.make} ${vehicle.model}` : null };
}
