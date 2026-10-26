import Link from "next/link";
import { Suspense } from "react";
import { NearMeButton } from "@/components/NearMeButton";
import { StatusBadge } from "@/components/StatusBadge";
import { distanceKm, timeAgo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { CONNECTOR_TYPES, type StationSummary } from "@/lib/types";

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
  let query = supabase.from("station_summaries").select("*").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,address.ilike.%${q}%`);
  if ((CONNECTOR_TYPES as readonly string[]).includes(connector)) query = query.contains("connector_types", [connector]);
  if (workingOnly) query = query.eq("last_status", "working");
  const { data, error } = await query;

  let stations = ((data ?? []) as StationSummary[]).map((s) => ({
    ...s,
    distance: hasLoc ? distanceKm(lat, lng, s.lat, s.lng) : null,
  }));
  if (hasLoc) stations = stations.sort((a, b) => a.distance! - b.distance!);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 px-6 py-8 text-white">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Find a charger that actually works.</h1>
        <p className="mt-2 max-w-xl text-emerald-50/90">
          Search stations by city or name, filter by connector, and see what other drivers reported recently.
        </p>
        <form className="mt-5 flex flex-col gap-2 sm:flex-row" action="/">
          <input
            name="q"
            defaultValue={q}
            placeholder="City, area or station name"
            className="flex-1 rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
          />
          <select name="connector" defaultValue={connector} className="rounded-lg bg-white px-3 py-2 text-sm text-zinc-900">
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {error ? "Couldn't load stations." : `${stations.length} station${stations.length === 1 ? "" : "s"}`}
        </p>
        <Suspense>
          <NearMeButton />
        </Suspense>
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
                    <p className="truncate text-sm text-zinc-500">
                      {s.address}, {s.city}
                    </p>
                  </div>
                  <StatusBadge status={s.last_status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.connector_types.map((c) => (
                    <span key={c} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {c}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                  <span>Up to {Number(s.max_power_kw)} kW</span>
                  {s.price_info && <span>{s.price_info}</span>}
                  {s.access === "restricted" && <span>Restricted access</span>}
                  {s.distance !== null && <span>{s.distance.toFixed(1)} km away</span>}
                  {s.last_checkin_at && <span>Reported {timeAgo(s.last_checkin_at)}</span>}
                  {s.is_demo && <span className="text-amber-600">Demo data</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
