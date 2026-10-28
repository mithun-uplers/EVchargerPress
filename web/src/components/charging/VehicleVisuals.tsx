import type { VehicleType } from "@/server/account";
import { formatLocal } from "@/lib/format";

/** Original, generic line-art silhouettes per vehicle type (no real make or model is depicted). */
export function VehicleArt({ type, className = "h-24 w-auto" }: { type: VehicleType; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (type === "car" || type === "other")
    return (
      <svg viewBox="0 0 240 100" aria-hidden="true" className={className}>
        <path d="M18 70h-6v-14c0-6 4-10 10-11l34-6 26-20c4-3 9-5 14-5h48c6 0 11 2 15 6l20 19 30 5c7 1 13 7 13 14v12h-8" {...common} fill="currentColor" fillOpacity="0.12" />
        <path d="M88 36h98M128 18v18" {...common} strokeOpacity="0.6" />
        <circle cx="58" cy="72" r="15" {...common} fill="currentColor" fillOpacity="0.25" />
        <circle cx="182" cy="72" r="15" {...common} fill="currentColor" fillOpacity="0.25" />
        <path d="M73 72h94" {...common} />
        <path d="m120 50-8 12h8l-4 10 12-14h-8l4-8Z" fill="currentColor" stroke="none" />
      </svg>
    );
  if (type === "scooter")
    return (
      <svg viewBox="0 0 200 110" aria-hidden="true" className={className}>
        <circle cx="40" cy="82" r="16" {...common} fill="currentColor" fillOpacity="0.25" />
        <circle cx="160" cy="82" r="16" {...common} fill="currentColor" fillOpacity="0.25" />
        <path d="M56 82h70c6-18 4-32-6-40h-40c-12 0-22 8-26 20l-6 20" {...common} fill="currentColor" fillOpacity="0.12" />
        <path d="M140 82 128 22h14M120 22h28" {...common} />
        <path d="M84 40h30" {...common} strokeWidth={6} />
      </svg>
    );
  if (type === "motorcycle")
    return (
      <svg viewBox="0 0 220 110" aria-hidden="true" className={className}>
        <circle cx="44" cy="78" r="22" {...common} fill="currentColor" fillOpacity="0.25" />
        <circle cx="176" cy="78" r="22" {...common} fill="currentColor" fillOpacity="0.25" />
        <path d="M44 78 78 46h60l20 32M98 46l-8-14h-18M150 28l14 22 12 28" {...common} />
        <path d="M84 46c10 14 34 14 46 0" {...common} fill="currentColor" fillOpacity="0.15" />
      </svg>
    );
  return (
    <svg viewBox="0 0 200 110" aria-hidden="true" className={className}>
      <circle cx="44" cy="76" r="24" {...common} />
      <circle cx="156" cy="76" r="24" {...common} />
      <path d="M44 76 78 36h56l22 40M78 36l22 40h34M100 76l30-54h16M70 26h18" {...common} />
      <rect x="84" y="40" width="34" height="12" rx="4" fill="currentColor" fillOpacity="0.3" stroke="none" />
    </svg>
  );
}

/** Battery gauge from a manual reading. Never labelled as live data. */
export function BatteryBar({
  percent,
  recordedAt,
  timeZone,
  tone = "light",
  size = "md",
}: {
  percent: number | null;
  recordedAt?: string | null;
  timeZone: string;
  tone?: "light" | "dark";
  size?: "sm" | "md";
}) {
  const known = percent !== null && percent !== undefined;
  const p = known ? Math.max(0, Math.min(100, percent)) : 0;
  const fill = p <= 20 ? "bg-rose-500" : p < 50 ? "bg-charge-400" : "bg-energy-400";
  const track = tone === "dark" ? "bg-white/20" : "bg-zinc-200 dark:bg-zinc-800";
  const sub = tone === "dark" ? "text-white/75" : "text-zinc-500";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${size === "md" ? "text-3xl" : "text-lg"} font-semibold tabular-nums`}>{known ? `${Math.round(p)}%` : "—"}</span>
        <span className={`text-[11px] ${sub}`}>
          {known && recordedAt ? `Manual · as of ${formatLocal(recordedAt, timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}` : "No battery reading yet"}
        </span>
      </div>
      <div
        role="meter"
        aria-label="Battery level from your last manual reading"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? Math.round(p) : undefined}
        className={`mt-2 ${size === "md" ? "h-3" : "h-2"} overflow-hidden rounded-full ${track}`}
      >
        {known && <div className={`h-full rounded-full ${fill}`} style={{ width: `${p}%` }} />}
      </div>
    </div>
  );
}

/** Minimal line chart (SVG) for manual readings over time. */
export function LineChart({
  points,
  label,
  format,
  min,
  max,
  caption,
  stroke = "stroke-energy-600",
  dot = "fill-energy-600",
}: {
  points: { t: string; v: number }[];
  label: string;
  format: (v: number) => string;
  min?: number;
  max?: number;
  caption?: string;
  stroke?: string;
  dot?: string;
}) {
  const pts = [...points].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (pts.length < 2) return <p className="py-6 text-center text-sm text-zinc-500">Add at least two readings to see a trend.</p>;
  const W = 600, H = 150, pl = 52, pr = 10, pt = 10, pb = 22;
  const lo = min ?? Math.min(...pts.map((p) => p.v));
  const hi = max ?? Math.max(...pts.map((p) => p.v));
  const span = hi - lo || 1;
  const t0 = Date.parse(pts[0].t), t1 = Date.parse(pts.at(-1)!.t);
  const x = (t: string) => pl + ((Date.parse(t) - t0) / Math.max(1, t1 - t0)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - (v - lo) / span) * (H - pt - pb);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(pts.at(-1)!.t).toFixed(1)} ${H - pb} L${pl} ${H - pb} Z`;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
        {[hi, lo + span / 2, lo].map((v) => (
          <g key={v}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeDasharray="3 4" />
            <text x={pl - 6} y={y(v) + 4} textAnchor="end" className="fill-zinc-400 text-[13px] tabular-nums">{format(v)}</text>
          </g>
        ))}
        <path d={area} className="fill-energy-500/10" />
        <path d={d} fill="none" className={stroke} strokeWidth={2.5} strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.v)} r={3.5} className={`${dot} stroke-white dark:stroke-zinc-900`} strokeWidth={1.5} />)}
        <text x={pl} y={H - 4} className="fill-zinc-400 text-[13px]">{new Date(pts[0].t).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</text>
        <text x={W - pr} y={H - 4} textAnchor="end" className="fill-zinc-400 text-[13px]">{new Date(pts.at(-1)!.t).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</text>
      </svg>
      {caption && <figcaption className="mt-1 text-xs text-zinc-500">{caption}</figcaption>}
    </figure>
  );
}
