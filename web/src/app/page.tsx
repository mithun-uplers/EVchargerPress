import Link from "next/link";
import { Suspense } from "react";
import { NearMeButton } from "@/components/NearMeButton";
import { StatusBadge } from "@/components/StatusBadge";
import { timeAgo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { CONNECTOR_TYPES, SOURCE_LABEL, formatPlace, type StationSummary } from "@/lib/types";

const PAGE_SIZE = 60;

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q).replace(/[%,()*\\]/g, " ").trim().slice(0, 60);
  const connector = one(sp.connector);
  const workingOnly = one(sp.working) === "1";
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
  query = hasLoc ? query.limit(200) : query.order("is_demo", { ascending: true }).order("name").limit(PAGE_SIZE);
  const { data, error, count } = await query;

  let stations = ((data ?? []) as StationSummary[]).map((s) => ({ ...s, distance: distances.get(s.id) ?? null }));
  if (hasLoc) stations = stations.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

  const mapHref = hasLoc ? `/map?lat=${lat}&lng=${lng}` : "/map";

  // Only known messages are shown, so a crafted link cannot put arbitrary text on the page.
  const message = ["Password updated."].includes(one(sp.message)) ? one(sp.message) : "";

  return (
    <div className="space-y-6">
      {message && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          {message}
        </p>
      )}
      <section className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 px-6 py-8 text-white">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Find a charger that actually works.</h1>
        <p className="mt-2 max-w-xl text-emerald-50/90">
          Search stations by city, PIN code or name, filter by connector, and see what other drivers reported recently.
        </p>
        <form className="mt-5 flex flex-col gap-2 sm:flex-row" action="/">
          <label className="sr-only" htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="City, PIN code, operator or station name"
            className="flex-1 rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
          />
          <select name="connector" defaultValue={connector} aria-label="Connector" className="rounded-lg bg-white px-3 py-2 text-sm text-zinc-900">
            <option value="">Any connector</option>
            {CONNECTOR_TYPES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm">
            <input type="checkbox" name="working" value="1" defaultChecked={workingOnly} /> Working only
          </label>
          {hasLoc && (
            <>
              <input type="hidden" name="lat" value={lat} />
              <input type="hidden" name="lng" value={lng} />
            </>
          )}
          <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Search</button>
        </form>
      </section>

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
          <Link href={mapHref} className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700">
            Map view
          </Link>
          <Suspense>
            <NearMeButton />
          </Suspense>
        </div>
      </div>

      {stations.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="font-medium">No stations match.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Know one nearby?{" "}
            <Link href="/stations/new" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Add it
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {stations.map((s) => (
            <li key={s.id}>
              <Link
                href={`/stations/${s.id}`}
                className="block h-full rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-emerald-500 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium">{s.name}</h2>
                    <p className="truncate text-sm text-zinc-500">{formatPlace(s)}</p>
                  </div>
                  <StatusBadge status={s.last_status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.connector_types.length ? (
                    s.connector_types.map((c) => (
                      <span key={c} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {c}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-400">Connectors not listed</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                  <span>{Number(s.max_power_kw) > 0 ? `Up to ${Number(s.max_power_kw)} kW` : "Power not listed"}</span>
                  {s.price_info && <span>{s.price_info}</span>}
                  {s.access === "restricted" && <span>Restricted access</span>}
                  {s.distance !== null && <span>{s.distance.toFixed(1)} km away</span>}
                  {s.last_checkin_at && <span>Reported {timeAgo(s.last_checkin_at)}</span>}
                  <span className={s.is_demo ? "text-amber-600" : ""}>{SOURCE_LABEL[s.data_source]}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
