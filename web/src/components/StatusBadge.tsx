import type { CheckinStatus } from "@/lib/types";

const STYLES: Record<CheckinStatus | "unknown", { label: string; cls: string }> = {
  working: { label: "Working", cls: "bg-energy-100 text-energy-800 ring-energy-600/20 dark:bg-energy-500/15 dark:text-energy-300" },
  busy: { label: "Busy", cls: "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300" },
  broken: { label: "Broken", cls: "bg-rose-100 text-rose-800 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300" },
  unknown: { label: "No reports", cls: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-400" },
};

export function StatusBadge({ status }: { status: CheckinStatus | null }) {
  const s = STYLES[status ?? "unknown"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
