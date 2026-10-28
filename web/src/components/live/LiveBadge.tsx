import { provenance } from "@/lib/live";
import type { StationSummary } from "@/lib/types";

/**
 * "2 of 3 free · Live" for stations whose chargers report status; nothing otherwise.
 * station_summaries only counts status reported in the last 15 minutes, so stale data never shows.
 */
export function StationLiveBadge({ s }: { s: Pick<StationSummary, "live_evse_count" | "live_available_count" | "live_is_simulated"> }) {
  if (!s.live_evse_count) return null;
  const free = s.live_available_count ?? 0;
  return (
    <span
      title={`${provenance(s.live_is_simulated)} status reported by the charger${s.live_is_simulated ? " (simulated for testing)" : ""}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        free ? "bg-energy-50 text-energy-800 ring-energy-600/20 dark:bg-energy-500/10 dark:text-energy-300" : "bg-charge-50 text-charge-600 ring-charge-300/50"
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${free ? "bg-energy-500" : "bg-charge-500"} motion-safe:animate-pulse`} />
      {free} of {s.live_evse_count} free · {provenance(s.live_is_simulated)}
    </span>
  );
}
