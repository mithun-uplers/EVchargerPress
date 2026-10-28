import type { RouteResult } from "@/components/route/RoutePlanView";
import type { TripStationItem } from "@/components/route/TripStations";
import type { PlannedStop, RouteStation } from "@/lib/route-plan";
import type { TripRow, TripStationRow } from "@/server/trips";

export type Live = Map<string, { total: number; free: number; simulated: boolean }>;

const toRouteStation = (s: TripStationRow, live: Live): RouteStation => {
  const l = s.station_id ? live.get(s.station_id) : undefined;
  return {
    id: s.station_id ?? `trip-station-${s.id}`, name: s.name, lat: s.lat, lng: s.lng, address: null, city: s.city, operator: s.operator,
    is_bookable: s.is_bookable, max_power_kw: s.max_power_kw, connector_types: s.connector_types,
    live_evse_count: l?.total ?? null, live_available_count: l?.free ?? null, live_is_simulated: l?.simulated ?? null,
    along_km: Number(s.along_km), detour_km: Number(s.detour_km),
  };
};

/** Rebuilds the planner's result from what was saved, so the trip reads exactly as planned. */
export function resultFromTrip(t: TripRow, stations: TripStationRow[], live: Live): RouteResult {
  const stopRows = stations.filter((s) => s.stop_order).sort((a, b) => a.stop_order! - b.stop_order!);
  let prev = 0;
  const stops: PlannedStop[] = stopRows.map((s) => {
    const st = toRouteStation(s, live);
    const leg = st.along_km - prev + st.detour_km;
    prev = st.along_km;
    return {
      station: st, arriveSocPct: Number(s.arrive_soc_percent), departSocPct: Number(s.depart_soc_percent), energyKwh: Number(s.energy_kwh),
      powerKw: s.power_kw !== null ? Number(s.power_kw) : null, chargeMinutes: s.charge_minutes, legKm: Math.round(leg * 10) / 10,
    };
  });
  const compatible = stations.filter((s) => s.is_compatible).length;
  return {
    fromLabel: t.from_label, toLabel: t.to_label, distanceKm: Number(t.distance_km), durationMin: t.duration_min, source: t.route_source,
    plan: t.feasible
      ? { ok: true, stops, arriveSocPct: Number(t.arrive_soc_percent), energyKwh: Number(t.energy_kwh ?? 0), chargeMinutes: t.charge_minutes, compatibleStations: compatible }
      : { ok: false, reason: "gap", stops, gapFromKm: Number(t.gap_from_km ?? 0), gapToKm: Number(t.gap_to_km ?? 0), compatibleStations: compatible },
    inputs: { startSocPct: Number(t.start_soc_percent), reservePct: Number(t.reserve_percent), batteryKwh: Number(t.battery_kwh), consumption: Number(t.consumption_kwh_per_100km), consumptionSource: "entered" },
    stationsConsidered: stations.length,
  };
}

export function stationItems(stations: TripStationRow[], live: Live): TripStationItem[] {
  return stations.map((s) => ({
    key: String(s.id), stationId: s.station_id, name: s.name, city: s.city, operator: s.operator, connectorTypes: s.connector_types,
    maxPowerKw: s.max_power_kw, isBookable: s.is_bookable, isCompatible: s.is_compatible, alongKm: Number(s.along_km), detourKm: Number(s.detour_km),
    stopOrder: s.stop_order, live: s.station_id ? live.get(s.station_id) ?? null : null,
  }));
}

