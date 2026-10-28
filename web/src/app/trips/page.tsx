import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TripIcon } from "@/components/nav/icons";
import { formatDuration } from "@/lib/charging-stats";
import { getCurrentUser } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import { listTrips } from "@/server/trips";

export const metadata: Metadata = { title: "Saved trips" };

export default async function TripsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/trips");
  const trips = await listTrips();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saved trips</h1>
          <p className="mt-1 text-sm text-zinc-500">Each trip keeps its route, charging stops and every station along the way.</p>
        </div>
        <Link href="/route" className={ui.btn}>Plan a new trip</Link>
      </div>
      {trips.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center dark:border-zinc-700 dark:bg-transparent">
          <TripIcon className="mx-auto h-8 w-8 text-energy-600" />
          <p className="mt-2 font-medium">No saved trips yet.</p>
          <p className="mt-1 text-sm text-zinc-500">Plan a route and tap <strong>Save trip</strong> to keep it here.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link href={`/trips/${t.id}`} className={`${ui.cardFlat} block h-full p-4 transition hover:ring-energy-400`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate font-semibold">{t.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${t.feasible ? "bg-energy-100 text-energy-800 dark:bg-energy-500/15 dark:text-energy-300" : "bg-rose-100 text-rose-800"}`}>
                    {t.feasible ? `${t.counts.stops} stop${t.counts.stops === 1 ? "" : "s"}` : "Gap on route"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-zinc-500">{t.from_label.split(",")[0]} → {t.to_label.split(",")[0]}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-[11px] text-zinc-500">Distance</dt><dd className="font-semibold tabular-nums">{Math.round(Number(t.distance_km))} km</dd></div>
                  <div><dt className="text-[11px] text-zinc-500">Driving</dt><dd className="font-semibold tabular-nums">{t.duration_min !== null ? formatDuration(t.duration_min) : "—"}</dd></div>
                  <div><dt className="text-[11px] text-zinc-500">Stations</dt><dd className="font-semibold tabular-nums">{t.counts.stations} <span className="text-xs font-normal text-zinc-500">({t.counts.compatible} fit)</span></dd></div>
                </dl>
                <p className="mt-3 text-xs text-zinc-500">
                  Saved {new Date(t.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  {t.vehicle ? ` · ${t.vehicle.nickname || `${t.vehicle.make} ${t.vehicle.model}`}` : ""}
                  {t.route_source === "straight_line" ? " · straight-line estimate" : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
