import type { BookingBrief } from "@/components/charging/HistoryView";
import { effectiveStatus, parseRange, type BookingRow } from "@/lib/booking-types";

/** Upcoming bookings (not lapsed, not ended), soonest first, in a compact shape for cards. */
export function upcomingBriefs(rows: BookingRow[], now = new Date(), limit = 4): BookingBrief[] {
  return rows
    .filter((b) => effectiveStatus(b, now) !== "expired" && parseRange(b.period).end > now)
    .map((b) => {
      const { start, end } = parseRange(b.period);
      return {
        reference: b.reference,
        stationName: b.station?.name ?? "Charging station",
        start: start.toISOString(),
        end: end.toISOString(),
        timeZone: b.station?.time_zone ?? "Asia/Kolkata",
        status: effectiveStatus(b, now),
        evseLabel: b.evse?.label ?? null,
        estimatedTotalMinor: b.estimated_total_minor,
        currency: b.currency,
        vehicleLabel: b.vehicle ? b.vehicle.nickname || `${b.vehicle.make} ${b.vehicle.model}` : null,
        vehicleId: b.vehicle?.id ?? null,
      };
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, limit);
}
