import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { deleteTripAction } from "@/app/trips/actions";
import { RouteMap } from "@/components/route/RouteMap";
import { RoutePlanView } from "@/components/route/RoutePlanView";
import { TripStations } from "@/components/route/TripStations";
import { resultFromTrip, stationItems, type Live } from "@/lib/trip-view";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import { getTrip } from "@/server/trips";

export const metadata: Metadata = { title: "Saved trip" };
const UUID = /^[0-9a-f-]{36}$/i;
export default async function TripPage({ params, searchParams }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/trips/${id}`);
  const sp = await searchParams;
  const found = await getTrip(id);
  if (!found) notFound();
  const { trip: t, stations } = found;

  // Today's live availability for the saved stations (only fresh values are counted by the view).
  const ids = stations.map((s) => s.station_id).filter(Boolean) as string[];
  const live: Live = new Map();
  if (ids.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("station_summaries").select("id,live_evse_count,live_available_count,live_is_simulated").in("id", ids.slice(0, 300));
    for (const r of (data ?? []) as { id: string; live_evse_count: number | null; live_available_count: number | null; live_is_simulated: boolean | null }[]) {
      if (r.live_evse_count) live.set(r.id, { total: r.live_evse_count, free: r.live_available_count ?? 0, simulated: !!r.live_is_simulated });
    }
  }
  const result = resultFromTrip(t, stations, live);
  const filter = sp.stations === "compatible" ? "compatible" : sp.stations === "stops" ? "stops" : "all";
  const replan = `/route?${new URLSearchParams({ from: `${t.from_lat}, ${t.from_lng}`, to: `${t.to_lat}, ${t.to_lng}`, ...(t.vehicle_id ? { vehicle: t.vehicle_id } : {}), reserve: String(Number(t.reserve_percent)), consumption: String(Number(t.consumption_kwh_per_100km)) })}`;
  const vehicle = t.vehicle ? t.vehicle.nickname || `${t.vehicle.make} ${t.vehicle.model}` : null;

  return (
    <RoutePlanView
      title={t.name}
      subtitle={<>Saved {new Date(t.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{vehicle ? ` · ${vehicle}` : ""} · battery levels and times are the estimates from when you planned it.</>}
      banner={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/trips" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">← Saved trips</Link>
          <div className="flex flex-wrap gap-2">
            <Link href={replan} className={ui.btnLight}>Plan again with today’s battery</Link>
            <form action={deleteTripAction}>
              <input type="hidden" name="id" value={t.id} />
              <button className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:ring-rose-500/30">Delete</button>
            </form>
          </div>
          {sp.saved === "1" && <p role="status" className={`basis-full ${ui.ok}`}>Trip saved with {stations.length} charging station{stations.length === 1 ? "" : "s"} along the route.</p>}
          {t.notes && <p className="basis-full text-sm text-zinc-600 dark:text-zinc-300">{t.notes}</p>}
        </div>
      }
      result={result}
      map={t.route_geometry?.coordinates?.length > 1 ? (
        <RouteMap line={t.route_geometry.coordinates} straight={t.route_source === "straight_line"} stops={result.plan.stops.map((s) => ({ lngLat: [s.station.lng, s.station.lat] as [number, number], label: s.station.name }))} />
      ) : null}
      extra={<TripStations items={stationItems(stations, live)} filter={filter} baseHref={`/trips/${t.id}`} />}
    />
  );
}
