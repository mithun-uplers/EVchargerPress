import Link from "next/link";
import { Suspense } from "react";
import { NearMeButton } from "@/components/NearMeButton";
import { HomeHero, StationCard } from "@/components/stations/StationBlocks";
import { Recommendations } from "@/components/live/Recommendations";
import { activeSession } from "@/server/live";
import { recommendationsFor } from "@/server/recommend";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getProfile } from "@/server/account";
import { CONNECTOR_TYPES, type StationSummary } from "@/lib/types";

const PAGE_SIZE = 60;

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q).replace(/[%,()*\\]/g, " ").trim().slice(0, 60);
  const connector = one(sp.connector);
  const workingOnly = one(sp.working) === "1";
  const bookableOnly = one(sp.bookable) === "1";
  const lat = Number(one(sp.lat));
  const lng = Number(one(sp.lng));
  const hasLoc = one(sp.lat) !== "" && Number.isFinite(lat) && Number.isFinite(lng);

  const supabase = await createClient();

  // "Near me": ask the database for the closest stations (PostGIS), widening the radius if nothing is close.
  let distances = new Map<string, number>();
  let radiusUsed: number | null = null;
  if (hasLoc) {
    for (const radius of [25, 100, 200]) {
      const { data } = await supabase.rpc("nearby_stations", { p_lat: lat, p_lng: lng, p_radius_km: radius, p_limit: 200 });
      if (data && data.length) {
        distances = new Map(data.map((r: { id: string; distance_km: number }) => [r.id, r.distance_km]));
        radiusUsed = radius;
        break;
      }
    }
  }

  let query = supabase.from("station_summaries").select("*", { count: "exact" });
  if (hasLoc) query = query.in("id", distances.size ? [...distances.keys()] : ["00000000-0000-0000-0000-000000000000"]);
  if (q) {
    const pin = /^\d{6}$/.test(q);
    query = pin
      ? query.eq("postal_code", q)
      : query.or(`name.ilike.%${q}%,city.ilike.%${q}%,address.ilike.%${q}%,operator.ilike.%${q}%,state.ilike.%${q}%`);
  }
  if ((CONNECTOR_TYPES as readonly string[]).includes(connector)) query = query.contains("connector_types", [connector]);
  if (workingOnly) query = query.eq("last_status", "working");
  if (bookableOnly) query = query.eq("is_bookable", true);
  query = hasLoc ? query.limit(200) : query.order("is_bookable", { ascending: false }).order("name").limit(PAGE_SIZE);
  const [{ data, error, count }, { count: bookableCount }, user] = await Promise.all([
    query,
    supabase.from("station_summaries").select("id", { count: "exact", head: true }).eq("is_bookable", true),
    getCurrentUser(),
  ]);
  const [profile, charging] = user ? await Promise.all([getProfile(user.id), activeSession()]) : [null, null];
  const recs = user && !q && !bookableOnly ? await recommendationsFor(profile, hasLoc ? { lat, lng } : null) : null;

  let stations = ((data ?? []) as StationSummary[]).map((s) => ({ ...s, distance: distances.get(s.id) ?? null }));
  if (hasLoc) stations = stations.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

  const mapHref = hasLoc ? `/map?lat=${lat}&lng=${lng}` : "/map";

  // Only known messages are shown, so a crafted link cannot put arbitrary text on the page.
  const message = ["Password updated.", "That page is for EVChargePress admins."].includes(one(sp.message)) ? one(sp.message) : "";

  return (
    <div className="space-y-6">
      {message && (
        <p role="status" className="rounded-xl bg-energy-50 px-3 py-2 text-sm text-energy-800 dark:bg-energy-500/10 dark:text-energy-300">
          {message}
        </p>
      )}
      <HomeHero name={profile?.display_name ?? null} q={q} connector={connector} bookableOnly={bookableOnly} workingOnly={workingOnly} loc={hasLoc ? { lat, lng } : null} mapHref={mapHref} />

      {charging?.booking && (
        <Link
          href={`/bookings/${charging.booking.reference}/live`}
          className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-energy-800 to-energy-600 p-4 text-white shadow-md"
        >
          <span className="flex items-center gap-3">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-charge-400 motion-safe:animate-pulse" />
            <span>
              <span className="block font-semibold">Charging at {charging.station?.name ?? "your station"}</span>
              <span className="block text-sm text-white/80">
                {charging.energy_kwh !== null ? `${Number(charging.energy_kwh).toFixed(1)} kWh` : ""}
                {charging.last_power_kw !== null ? ` · ${Number(charging.last_power_kw).toFixed(0)} kW` : ""}
                {charging.last_soc_percent !== null ? ` · ${Math.round(Number(charging.last_soc_percent))}%` : ""}
                {charging.is_simulated ? " · Simulated" : " · Live"}
              </span>
            </span>
          </span>
          <span aria-hidden="true" className="text-xl">→</span>
        </Link>
      )}

      {user && profile && !profile.onboarded_at && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-energy-50 p-4 text-sm ring-1 ring-inset ring-energy-200 dark:bg-energy-500/10 dark:ring-energy-500/30">
          <span>Finish setting up: add your vehicle so we only show chargers it can use.</span>
          <Link href="/onboarding" className="inline-flex min-h-10 items-center rounded-xl bg-energy-600 shadow-sm px-3 font-medium text-white hover:bg-energy-700">Continue setup</Link>
        </div>
      )}

      {recs && <Recommendations items={recs.items} vehicleLabel={recs.vehicleLabel} located={hasLoc} />}

      {!bookableOnly && (bookableCount ?? 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 p-4 text-sm dark:bg-zinc-900 dark:ring-zinc-800">
          <span>
            <strong>Online booking</strong> is available at {bookableCount} station{bookableCount === 1 ? "" : "s"} so far. Other stations come from
            OpenStreetMap or drivers and are information only until an operator publishes chargers and prices.
          </span>
          <Link href="/?bookable=1" className="inline-flex min-h-10 items-center rounded-xl bg-energy-600 shadow-sm px-3 font-medium text-white hover:bg-energy-700">Show bookable</Link>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="pt-2 text-sm text-zinc-500">
          {error
            ? "Couldn't load stations."
            : hasLoc
              ? radiusUsed
                ? `${stations.length} station${stations.length === 1 ? "" : "s"} within ${radiusUsed} km, nearest first`
                : "No stations within 200 km of you."
              : `Showing ${stations.length} of ${count ?? stations.length} stations${count && count > stations.length ? " — search or use Near me to narrow down" : ""}`}
        </p>
        <div className="flex items-start gap-2">
          <Link href={mapHref} className="inline-flex min-h-10 items-center rounded-xl bg-white px-3 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-inset ring-zinc-200 hover:bg-energy-50 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-energy-500/15">
            Map view
          </Link>
          <Suspense>
            <NearMeButton />
          </Suspense>
        </div>
      </div>

      {stations.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center dark:border-zinc-700 dark:bg-transparent">
          <p className="font-medium">No stations match.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Try another city or connector, or{" "}
            <Link href="/map" className="font-medium text-energy-700 hover:underline dark:text-energy-400">
              browse the map
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {stations.map((s) => (
            <li key={s.id}>
              <StationCard s={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
