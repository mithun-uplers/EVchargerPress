import "server-only";
import type { RouteResult } from "@/components/route/RoutePlanView";
import { isCompatible, planRoute, thin, type RouteStation } from "@/lib/route-plan";
import type { Vehicle } from "@/server/account";
import { drivingRoute, geocode, stationsAlongRoute, type Place } from "@/server/routing";

export type TripParams = { from: string; to: string; soc: string; reserve: string; consumption: string };
export type Planned = {
  result: RouteResult;
  line: [number, number][];
  stations: RouteStation[];
  from: Place;
  to: Place;
  vehicle: Vehicle;
};

const num = (v: string, lo: number, hi: number) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/** Validates the inputs, geocodes, routes and plans. Used by the planner page and by "Save trip" (which never trusts client data). */
export async function planTrip(p: TripParams, vehicle: Vehicle | null, myEfficiency: number | null): Promise<{ ok: true; planned: Planned } | { ok: false; error: string }> {
  const soc = num(p.soc, 1, 100);
  const reserve = num(p.reserve, 0, 50) ?? 15;
  const consumption = num(p.consumption, 3, 60);
  const battery = vehicle?.battery_capacity_kwh ? Number(vehicle.battery_capacity_kwh) : null;
  if (!vehicle) return { ok: false, error: "Add a vehicle first so we know which connectors you can use." };
  if (!battery) return { ok: false, error: "Add your vehicle’s battery size (My vehicles → Edit) to plan charging stops." };
  if (soc === null) return { ok: false, error: "Enter your current battery % (1–100)." };
  if (consumption === null) return { ok: false, error: "Enter your consumption in kWh/100 km (3–60)." };
  if (soc <= reserve) return { ok: false, error: "Your battery is already at or below the reserve you set." };
  const [from, to] = await Promise.all([geocode(p.from), geocode(p.to)]);
  if (!from || !to) return { ok: false, error: `We couldn’t find ${!from ? `“${p.from}”` : `“${p.to}”`}. Try a city name or “lat, lng”.` };
  const route = await drivingRoute(from.lngLat, to.lngLat);
  const stations = await stationsAlongRoute(route.coordinates, 5);
  const plan = planRoute({
    distanceKm: route.distanceKm, startSocPct: soc, reservePct: reserve, batteryKwh: battery, consumptionKwhPer100Km: consumption,
    vehicleConnectors: vehicle.vehicle_connectors.map((c) => c.connector_type),
    vehicleMaxDcKw: vehicle.max_dc_kw ? Number(vehicle.max_dc_kw) : null, vehicleMaxAcKw: vehicle.max_ac_kw ? Number(vehicle.max_ac_kw) : null,
    stations,
  });
  return {
    ok: true,
    planned: {
      result: {
        fromLabel: from.label, toLabel: to.label, distanceKm: route.distanceKm, durationMin: route.durationMin, source: route.source, plan,
        inputs: {
          startSocPct: soc, reservePct: reserve, batteryKwh: battery, consumption,
          consumptionSource: myEfficiency !== null && consumption === myEfficiency ? "your history" : "entered",
        },
        stationsConsidered: stations.length,
      },
      line: route.coordinates,
      stations,
      from,
      to,
      vehicle,
    },
  };
}

/** Shapes a plan for public.save_trip: the trip row plus every station along the route (stops flagged). */
export function tripPayload(pl: Planned, name: string, notes: string) {
  const r = pl.result;
  const stops = new Map(r.plan.stops.map((s, i) => [s.station.id, { ...s, order: i + 1 }]));
  const connectors = pl.vehicle.vehicle_connectors.map((c) => c.connector_type);
  const trip = {
    name, notes, vehicle_id: pl.vehicle.id,
    from_label: r.fromLabel, from_lat: pl.from.lngLat[1], from_lng: pl.from.lngLat[0],
    to_label: r.toLabel, to_lat: pl.to.lngLat[1], to_lng: pl.to.lngLat[0],
    distance_km: Math.round(r.distanceKm * 10) / 10, duration_min: r.durationMin, route_source: r.source,
    route_geometry: { type: "LineString", coordinates: thin(pl.line, 400) },
    start_soc_percent: r.inputs.startSocPct, reserve_percent: r.inputs.reservePct,
    consumption_kwh_per_100km: r.inputs.consumption, battery_kwh: r.inputs.batteryKwh,
    feasible: r.plan.ok,
    arrive_soc_percent: r.plan.ok ? r.plan.arriveSocPct : null,
    charge_minutes: r.plan.ok ? r.plan.chargeMinutes : null,
    energy_kwh: r.plan.ok ? r.plan.energyKwh : null,
    gap_from_km: r.plan.ok ? null : r.plan.gapFromKm,
    gap_to_km: r.plan.ok ? null : r.plan.gapToKm,
  };
  const stations = pl.stations.map((s) => {
    const stop = stops.get(s.id);
    return {
      station_id: s.id, name: s.name, city: s.city, operator: s.operator, lat: s.lat, lng: s.lng, connector_types: s.connector_types,
      max_power_kw: s.max_power_kw, is_bookable: s.is_bookable, is_compatible: isCompatible(s, connectors),
      along_km: Math.round(s.along_km * 10) / 10, detour_km: Math.round(s.detour_km * 10) / 10,
      stop_order: stop?.order ?? null, arrive_soc_percent: stop?.arriveSocPct ?? null, depart_soc_percent: stop?.departSocPct ?? null,
      energy_kwh: stop?.energyKwh ?? null, power_kw: stop?.powerKw ?? null, charge_minutes: stop?.chargeMinutes ?? null,
    };
  });
  return { trip, stations };
}
