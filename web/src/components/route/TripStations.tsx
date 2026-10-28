import Link from "next/link";
import { provenance } from "@/lib/live";

export type TripStationItem = {
  key: string;
  stationId: string | null;
  name: string;
  city: string | null;
  operator: string | null;
  connectorTypes: string[];
  maxPowerKw: number | null;
  isBookable: boolean;
  isCompatible: boolean;
  alongKm: number;
  detourKm: number;
  stopOrder: number | null;
  live: { total: number; free: number; simulated: boolean } | null;
};

/** Every charging station saved with a trip, in order along the route. */
export function TripStations({ items, filter, baseHref }: { items: TripStationItem[]; filter: "all" | "compatible" | "stops"; baseHref: string }) {
  const shown = items.filter((s) => (filter === "stops" ? s.stopOrder : filter === "compatible" ? s.isCompatible : true));
  const counts = { all: items.length, compatible: items.filter((s) => s.isCompatible).length, stops: items.filter((s) => s.stopOrder).length };
  const tab = (f: typeof filter, label: string) => (
    <Link
      href={`${baseHref}?stations=${f}#stations`}
      scroll={false}
      aria-current={filter === f ? "true" : undefined}
      className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium transition ${filter === f ? "bg-energy-600 text-white shadow-sm" : "text-zinc-600 hover:bg-energy-50 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
    >
      {label} <span className="opacity-70">{counts[f]}</span>
    </Link>
  );
  return (
    <section id="stations" aria-labelledby="stations-h" className="scroll-mt-20 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="stations-h" className="font-semibold">Charging stations on this route</h2>
          <p className="text-sm text-zinc-500">Within 5 km of the route when you saved it. “Free now” is today’s live status where chargers report it.</p>
        </div>
        <nav aria-label="Filter stations" className="-mx-1 flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1 dark:bg-zinc-950">
          {tab("all", "All")}
          {tab("compatible", "Fits my car")}
          {tab("stops", "Planned stops")}
        </nav>
      </div>
      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No stations in this view.</p>
      ) : (
        <ol className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {shown.map((s) => (
            <li key={s.key} className="flex gap-3 py-3">
              <span className="w-14 shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">{Math.round(s.alongKm)}</span>
                <span className="block text-[11px] text-zinc-500">km</span>
              </span>
              <span aria-hidden="true" className={`mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${s.stopOrder ? "bg-charge-400 text-zinc-900" : s.isCompatible ? "bg-energy-100 text-energy-800 dark:bg-energy-500/15 dark:text-energy-300" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"}`}>
                {s.stopOrder ?? "•"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {s.stationId ? (
                    <Link href={`/stations/${s.stationId}`} className="truncate font-medium hover:underline">{s.name}</Link>
                  ) : (
                    <span className="truncate font-medium">{s.name}</span>
                  )}
                  {s.stopOrder && <span className="rounded-full bg-charge-400 px-2 py-0.5 text-[11px] font-semibold text-zinc-900">Stop {s.stopOrder}</span>}
                  {s.isBookable && <span className="rounded-full bg-energy-600 px-2 py-0.5 text-[11px] font-medium text-white">Bookable</span>}
                  {!s.isCompatible && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Doesn’t fit your car</span>}
                </span>
                <span className="block truncate text-sm text-zinc-500">
                  {[s.operator, s.city].filter(Boolean).join(" · ") || "—"}
                  {s.detourKm >= 0.5 ? ` · ${s.detourKm.toFixed(1)} km off route` : ""}
                </span>
                <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {s.connectorTypes.length ? s.connectorTypes.map((c) => <span key={c} className="rounded-md bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{c}</span>) : <span className="text-zinc-400">Connectors not listed</span>}
                  <span className="text-zinc-500">{s.maxPowerKw ? `up to ${Number(s.maxPowerKw)} kW` : "power not listed"}</span>
                  {s.live && <span className="font-medium text-energy-700 dark:text-energy-400">{s.live.free} of {s.live.total} free · {provenance(s.live.simulated)}</span>}
                </span>
              </span>
              {s.isBookable && s.stationId && (
                <Link href={`/stations/${s.stationId}/book`} className="hidden h-fit shrink-0 rounded-xl bg-energy-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-energy-700 sm:inline-flex">Book</Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
