import type { Bar } from "@/lib/charging-stats";

/**
 * Accessible bar chart. Actual values are solid amber; estimates are stacked on top in a pale,
 * striped amber so they are never mistaken for recorded data.
 */
export function BarChart({
  bars,
  format,
  label,
  height = 160,
  labelEvery = 1,
  highlightIndex,
}: {
  bars: Bar[];
  format: (v: number) => string;
  label: string;
  height?: number;
  labelEvery?: number;
  highlightIndex?: number;
}) {
  const max = Math.max(...bars.map((b) => b.actual + b.estimate), 0);
  const ticks = max > 0 ? [max, max / 2] : [];
  const hasEstimate = bars.some((b) => b.estimate > 0);
  return (
    <figure>
      <div className="relative" style={{ height }}>
        {ticks.map((t, i) => (
          <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-zinc-200 dark:border-zinc-800" style={{ bottom: `${(t / max) * 100}%` }}>
            <span className="absolute -top-2.5 right-0 bg-white pl-1 text-[10px] tabular-nums text-zinc-400 dark:bg-zinc-900">{format(t)}</span>
          </div>
        ))}
        <ul role="list" aria-label={label} className="absolute inset-0 flex items-end gap-[3px] pr-10 sm:gap-1">
          {bars.map((b, i) => {
            const total = b.actual + b.estimate;
            const pct = max ? (total / max) * 100 : 0;
            const estPct = total ? (b.estimate / total) * 100 : 0;
            return (
              <li key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={total ? `${b.label}: ${format(b.actual)}${b.estimate ? ` + ~${format(b.estimate)} estimated` : ""}` : undefined}>
                <span className="sr-only">{`${b.label}: ${total ? format(b.actual) : "none"}${b.estimate ? `, plus about ${format(b.estimate)} estimated` : ""}`}</span>
                <div
                  aria-hidden="true"
                  className={`flex w-full flex-col overflow-hidden rounded-t-[4px] ${i === highlightIndex ? "ring-2 ring-energy-600 ring-offset-1" : ""}`}
                  style={{ height: total ? `max(3px, ${pct}%)` : "2px" }}
                >
                  {total ? (
                    <>
                      <div className="bar-estimate w-full bg-charge-100" style={{ height: `${estPct}%` }} />
                      <div className="w-full flex-1 bg-charge-400" />
                    </>
                  ) : (
                    <div className="h-full w-full bg-zinc-200 dark:bg-zinc-800" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div aria-hidden="true" className="mt-1.5 flex gap-[3px] pr-10 sm:gap-1">
        {bars.map((b, i) => (
          <span key={i} className="min-w-0 flex-1 text-center text-[10px] tabular-nums text-zinc-500">
            {i % labelEvery === 0 ? b.label : ""}
          </span>
        ))}
      </div>
      {hasEstimate && (
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-charge-400" />Recorded sessions</span>
          <span className="inline-flex items-center gap-1.5"><span className="bar-estimate h-2.5 w-2.5 rounded-sm bg-charge-100 ring-1 ring-charge-300" />Estimate (booking, no session)</span>
        </figcaption>
      )}
    </figure>
  );
}
