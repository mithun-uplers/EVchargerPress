import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RouteForm } from "@/components/route/RouteForm";
import { RouteMap } from "@/components/route/RouteMap";
import { RoutePlanView, type RouteResult } from "@/components/route/RoutePlanView";
import { efficiencyKwhPer100Km, toHistoryItems } from "@/lib/charging-stats";
import { planRoute } from "@/lib/route-plan";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, listBatteryReadings, listSessions, listVehicles, vehicleLabel } from "@/server/account";
import { drivingRoute, geocode, stationsAlongRoute } from "@/server/routing";

export const metadata: Metadata = { title: "Plan a trip" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const num = (v: string, lo: number, hi: number) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

export default async function RoutePage({ searchParams }: PageProps<"/route">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/route");
  const sp = await searchParams;
  const [vehicles, profile] = await Promise.all([listVehicles(), getProfile(user.id)]);
  const vehicleId = one(sp.vehicle) || profile?.preferred_vehicle_id || vehicles[0]?.id || "";
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;

  // Prefill consumption from the driver's own odometer readings and sessions when there is enough data.
  const [readings, sessions] = vehicle ? await Promise.all([listBatteryReadings(vehicle.id), listSessions(500)]) : [[], []];
  const items = toHistoryItems(sessions).filter((i) => i.vehicleId === vehicle?.id);
  const odo = readings.filter((r) => r.odometer_km !== null).map((r) => ({ recorded_at: r.recorded_at, odometer_km: Number(r.odometer_km) }));
  const myEfficiency = efficiencyKwhPer100Km(odo, items);
  const lastSoc = readings.find((r) => r.soc_percent !== null)?.soc_percent;

  const submitted = one(sp.from) !== "" && one(sp.to) !== "";
  const d = {
    from: one(sp.from),
    to: one(sp.to),
    vehicleId,
    soc: one(sp.soc) || (lastSoc !== undefined && lastSoc !== null ? String(Math.round(Number(lastSoc))) : ""),
    reserve: one(sp.reserve) || "15",
    consumption: one(sp.consumption) || (myEfficiency !== null ? String(myEfficiency) : ""),
    consumptionHint: myEfficiency !== null ? `Your average from your own entries: ${myEfficiency} kWh/100 km` : "Use your car’s trip computer. We don’t guess this.",
  };

  let result: RouteResult | null = null;
  let error: string | null = null;
  let line: [number, number][] = [];
  if (submitted) {
    const soc = num(d.soc, 1, 100);
    const reserve = num(d.reserve, 0, 50) ?? 15;
    const consumption = num(d.consumption, 3, 60);
    const battery = vehicle?.battery_capacity_kwh ? Number(vehicle.battery_capacity_kwh) : null;
    if (!vehicle) error = "Add a vehicle first so we know which connectors you can use.";
    else if (!battery) error = "Add your vehicle’s battery size (My vehicles → Edit) to plan charging stops.";
    else if (soc === null) error = "Enter your current battery % (1–100).";
    else if (consumption === null) error = "Enter your consumption in kWh/100 km (3–60).";
    else if (soc <= reserve) error = "Your battery is already at or below the reserve you set.";
    else {
      const [from, to] = await Promise.all([geocode(d.from), geocode(d.to)]);
      if (!from || !to) error = `We couldn’t find ${!from ? `“${d.from}”` : `“${d.to}”`}. Try a city name or “lat, lng”.`;
      else {
        const route = await drivingRoute(from.lngLat, to.lngLat);
        line = route.coordinates;
        const stations = await stationsAlongRoute(route.coordinates, 5);
        const plan = planRoute({
          distanceKm: route.distanceKm, startSocPct: soc, reservePct: reserve, batteryKwh: battery, consumptionKwhPer100Km: consumption,
          vehicleConnectors: vehicle.vehicle_connectors.map((c) => c.connector_type),
          vehicleMaxDcKw: vehicle.max_dc_kw ? Number(vehicle.max_dc_kw) : null, vehicleMaxAcKw: vehicle.max_ac_kw ? Number(vehicle.max_ac_kw) : null,
          stations,
        });
        result = {
          fromLabel: from.label, toLabel: to.label, distanceKm: route.distanceKm, durationMin: route.durationMin, source: route.source, plan,
          inputs: { startSocPct: soc, reservePct: reserve, batteryKwh: battery, consumption, consumptionSource: one(sp.consumption) && Number(one(sp.consumption)) !== myEfficiency ? "entered" : myEfficiency !== null ? "your history" : "entered" },
          stationsConsidered: stations.length,
        };
      }
    }
  }

  return (
    <RoutePlanView
      form={
        vehicles.length === 0 ? (
          <p className="text-sm text-zinc-500">
            <Link href="/vehicles/new?back=/route" className="font-medium text-energy-700 hover:underline">Add your vehicle</Link> to plan a trip — we need its connectors and battery size.
          </p>
        ) : (
          <RouteForm vehicles={vehicles.map((v) => ({ id: v.id, label: vehicleLabel(v), batteryKwh: v.battery_capacity_kwh ? Number(v.battery_capacity_kwh) : null }))} d={d} />
        )
      }
      result={result}
      error={error}
      map={result && line.length > 1 ? (
        <RouteMap line={line} straight={result.source === "straight_line"} stops={result.plan.stops.map((s) => ({ lngLat: [s.station.lng, s.station.lat] as [number, number], label: s.station.name }))} />
      ) : null}
    />
  );
}
