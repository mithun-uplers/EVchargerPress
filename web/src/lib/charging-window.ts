import { effectiveStatus, parseRange, type BookingRow } from "@/lib/booking-types";

/** Whether the driver can start charging now: connected charger + checked in, or confirmed within the check-in window. */
export function chargingWindow(b: Pick<BookingRow, "status" | "hold_expires_at" | "period" | "price_snapshot" | "evse">, now = new Date()) {
  const status = effectiveStatus(b, now);
  const { start, end } = parseRange(b.period);
  const early = b.price_snapshot.policy?.check_in_early_min ?? 15;
  const grace = b.price_snapshot.policy?.no_show_grace_min ?? 15;
  const connected = !!b.evse?.charge_point_id;
  const inWindow =
    (status === "checked_in" && now < end) ||
    (status === "confirmed" && now >= new Date(start.getTime() - early * 60_000) && now <= new Date(start.getTime() + grace * 60_000));
  return { connected, canStart: connected && inWindow, status };
}
