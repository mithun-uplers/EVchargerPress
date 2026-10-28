import Link from "next/link";
import { RouteIcon } from "@/components/nav/icons";
import type { Recommendation } from "@/lib/recommend";

/** "Recommended for you" — each card explains why it was picked. */
export function Recommendations({ items, vehicleLabel, located }: { items: Recommendation[]; vehicleLabel: string | null; located: boolean }) {
  return (
    <section aria-labelledby="rec-h" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="rec-h" className="text-lg font-semibold tracking-tight">Recommended for you</h2>
          <p className="text-sm text-zinc-500">
            {vehicleLabel ? `For your ${vehicleLabel}` : "Add a vehicle for better matches"}
            {located ? " · near you" : " · use Near me to include distance"}
          </p>
        </div>
        <Link href="/route" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-medium shadow-sm ring-1 ring-inset ring-zinc-200 hover:bg-energy-50 dark:bg-zinc-900 dark:ring-zinc-700">
          <RouteIcon className="h-4 w-4 text-energy-600" /> Plan a trip
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-transparent">
          Nothing to suggest yet. Charge a few times, or use Near me, and we’ll recommend stations that suit your car.
        </p>
      ) : (
        <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4">
          {items.map((r) => (
            <li key={r.station.id} className="w-72 shrink-0 snap-start md:w-auto">
              <Link href={`/stations/${r.station.id}`} className="flex h-full flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 transition hover:ring-energy-400 dark:bg-zinc-900 dark:ring-zinc-800">
                <p className="truncate font-semibold">{r.station.name}</p>
                <p className="truncate text-sm text-zinc-500">{[r.station.operator, r.station.city].filter(Boolean).join(" · ") || "—"}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {r.reasons.map((t) => (
                    <li key={t} className="flex items-start gap-2"><span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-energy-500" />{t}</li>
                  ))}
                  {r.warnings.map((t) => (
                    <li key={t} className="flex items-start gap-2 text-charge-600"><span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-charge-500" />{t}</li>
                  ))}
                </ul>
                <span className="mt-auto pt-3 text-sm font-medium text-energy-700 dark:text-energy-400">{r.station.is_bookable ? "View & book →" : "View station →"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
