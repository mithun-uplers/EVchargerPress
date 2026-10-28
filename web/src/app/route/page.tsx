import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RouteForm } from "@/components/route/RouteForm";
import { RouteMap } from "@/components/route/RouteMap";
import { RoutePlanView, type RouteResult } from "@/components/route/RoutePlanView";
import { efficiencyKwhPer100Km, toHistoryItems } from "@/lib/charging-stats";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, listBatteryReadings, listSessions, listVehicles, vehicleLabel } from "@/server/account";
import { planTrip } from "@/server/trip-planner";
import { saveTripAction } from "@/app/trips/actions";

export const metadata: Metadata = { title: "Plan a trip" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

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
    const res = await planTrip({ from: d.from, to: d.to, soc: d.soc, reserve: d.reserve, consumption: d.consumption }, vehicle, myEfficiency);
    if (res.ok) ({ result, line } = res.planned);
    else error = res.error;
  }
  const saveError = one(sp.save_error).slice(0, 200);

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
      save={result ? (
        <form action={saveTripAction} className="relative mt-4 flex flex-col gap-2 sm:flex-row">
          {(["from", "to", "soc", "reserve", "consumption"] as const).map((k) => <input key={k} type="hidden" name={k} value={d[k]} />)}
          <input type="hidden" name="vehicle" value={vehicleId} />
          <label className="sr-only" htmlFor="trip-name">Trip name</label>
          <input id="trip-name" name="name" maxLength={80} placeholder={`${result.fromLabel.split(",")[0]} → ${result.toLabel.split(",")[0]}`}
            className="min-h-11 flex-1 rounded-xl bg-white/95 px-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:ring-4 focus:ring-charge-400/40" />
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-charge-400 px-5 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-charge-300">Save trip</button>
          {saveError && <p role="alert" className="text-sm text-charge-100 sm:basis-full">{saveError}</p>}
        </form>
      ) : null}
      map={result && line.length > 1 ? (
        <RouteMap line={line} straight={result.source === "straight_line"} stops={result.plan.stops.map((s) => ({ lngLat: [s.station.lng, s.station.lat] as [number, number], label: s.station.name }))} />
      ) : null}
    />
  );
}
