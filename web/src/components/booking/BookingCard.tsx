import Link from "next/link";
import { BookingStatusBadge } from "@/components/booking/BookingStatusBadge";
import { effectiveStatus, parseRange, type BookingRow } from "@/lib/booking-types";
import { formatLocal, formatMoney, formatTime } from "@/lib/format";
import { ui } from "@/lib/ui";

/** Booking row with a date tile, time in the station's zone, status and estimate. */
export function BookingCard({ b, now }: { b: BookingRow; now: Date }) {
  const tz = b.station?.time_zone ?? "Asia/Kolkata";
  const { start, end } = parseRange(b.period);
  const st = effectiveStatus(b, now);
  const live = b.evse?.charge_point_id && (st === "checked_in" || st === "confirmed");
  return (
      <Link href={`/bookings/${b.reference}`} className={`${ui.cardFlat} flex items-center gap-4 p-4 transition hover:ring-energy-400`}>
        <span className={`grid w-14 shrink-0 place-items-center rounded-xl py-2 ${st === "confirmed" || st === "checked_in" || st === "pending" ? "bg-energy-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
          <span className="text-[10px] font-medium uppercase leading-none tracking-wide">{formatLocal(start, tz, { month: "short" })}</span>
          <span className="text-xl font-semibold leading-tight">{formatLocal(start, tz, { day: "numeric" })}</span>
          <span className="text-[10px] leading-none opacity-80">{formatLocal(start, tz, { weekday: "short" })}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{b.station?.name ?? "Charging station"}</span>
          <span className="block truncate text-sm text-zinc-600 dark:text-zinc-300">
            {formatTime(start, tz)}–{formatTime(end, tz)} · {b.evse?.label}
            {b.vehicle ? ` · ${b.vehicle.nickname || `${b.vehicle.make} ${b.vehicle.model}`}` : ""}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={st} />
            {live && <span className="rounded-full bg-charge-50 px-2 py-0.5 text-xs font-medium text-charge-600 ring-1 ring-inset ring-charge-200">Charger connected</span>}
            <span className="font-mono text-xs text-zinc-400">{b.reference}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">~{formatMoney(b.estimated_total_minor, b.currency).replace(/\.00$/, "")}</span>
          <span className="block text-[11px] text-zinc-500">estimate</span>
        </span>
      </Link>
  );
}
