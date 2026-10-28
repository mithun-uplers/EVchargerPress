import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookingStatusBadge } from "@/components/booking/BookingStatusBadge";
import { CancelForm, CheckInButton, ConfirmButton, HoldCountdown } from "@/components/booking/BookingActions";
import { PriceBreakdown } from "@/components/booking/PriceBreakdown";
import { effectiveStatus, parseRange, STATUS_LABEL, type BookingStatus } from "@/lib/booking-types";
import { formatLocal, formatMoney, formatTime, zoneLabel } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { chargingWindow } from "@/lib/charging-window";
import { getBooking } from "@/server/bookings";

export const metadata: Metadata = { title: "Booking" };

export default async function BookingPage({ params }: PageProps<"/bookings/[ref]">) {
  const { ref } = await params;
  if (!/^EV-[A-Z0-9]{8}$/.test(ref)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/bookings/${ref}`)}`);

  const found = await getBooking(ref);
  if (!found) notFound();
  const { booking: b, events } = found;
  const tz = b.station?.time_zone ?? b.price_snapshot.policy?.time_zone ?? "Asia/Kolkata";
  const { start, end } = parseRange(b.period);
  const now = new Date();
  const status = effectiveStatus(b, now);
  const policy = b.price_snapshot.policy;

  const freeUntil = new Date(start.getTime() - (policy?.free_cancel_until_min ?? 0) * 60_000);
  const canCancel = status === "pending" || (status === "confirmed" && now < start);
  const feeNote =
    status === "pending"
      ? "Releasing a hold is free."
      : now < freeUntil
        ? `Free cancellation until ${formatLocal(freeUntil, tz)}.`
        : `It’s less than ${policy?.free_cancel_until_min ?? 0} minutes before the start, so the reservation fee of ${formatMoney(b.reservation_fee_minor, b.currency)} will be charged as a late-cancellation fee.`;
  const checkInOpens = new Date(start.getTime() - (policy?.check_in_early_min ?? 15) * 60_000);
  const checkInCloses = new Date(start.getTime() + (policy?.no_show_grace_min ?? 15) * 60_000);
  const canCheckIn = status === "confirmed" && now >= checkInOpens && now <= checkInCloses;
  const charging = chargingWindow(b, now);
  const showLive = charging.connected && (charging.canStart || status === "checked_in" || status === "completed");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/bookings" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">← My bookings</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-zinc-500">{b.reference}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{b.station?.name ?? "Charging station"}</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">
            {formatLocal(start, tz, { weekday: "long", day: "numeric", month: "long" })}, {formatTime(start, tz)}–{formatTime(end, tz)}{" "}
            <span className="text-zinc-500">({zoneLabel(tz, start)})</span>
          </p>
          <p className="text-sm text-zinc-500">
            {b.evse?.label}{b.evse?.max_power_kw ? ` · ${Number(b.evse.max_power_kw)} kW` : ""}
            {b.price_snapshot.vehicle ? ` · ${b.price_snapshot.vehicle.label}` : ""}
          </p>
        </div>
        <BookingStatusBadge status={status} />
      </div>

      {status === "pending" && b.hold_expires_at && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          This slot is held for you for <strong><HoldCountdown expiresAt={b.hold_expires_at} /></strong>. Review the price and rules, then confirm.
        </div>
      )}
      {status === "expired" && (
        <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          This hold expired before it was confirmed, so the slot was released.{" "}
          {b.station && <Link href={`/stations/${b.station.id}/book`} className="font-medium text-energy-700 hover:underline">Choose a new slot</Link>}
        </div>
      )}
      {status === "cancelled" && (
        <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          Cancelled {b.cancelled_at ? formatLocal(b.cancelled_at, tz) : ""}.{" "}
          {b.cancellation_fee_minor ? `Late-cancellation fee: ${formatMoney(b.cancellation_fee_minor, b.currency)}.` : "No fee."}
        </div>
      )}

      {showLive && (
        <Link
          href={`/bookings/${b.reference}/live`}
          className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-energy-700 via-energy-600 to-energy-800 p-4 text-white shadow-md hover:from-energy-800"
        >
          <span>
            <span className="block font-semibold">{status === "completed" ? "Charging summary" : charging.canStart ? "Start charging from your phone" : "Live charging"}</span>
            <span className="block text-sm text-white/80">
              {status === "completed" ? "Energy, power curve and cost reported by the charger." : "See live power, energy, battery % and cost so far."}
            </span>
          </span>
          <span aria-hidden="true" className="text-2xl">→</span>
        </Link>
      )}

      <div className="grid gap-6 md:grid-cols-5">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 md:col-span-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-medium">Price (frozen when you booked)</h2>
          <PriceBreakdown snap={b.price_snapshot} />
        </section>

        <div className="space-y-4 md:col-span-2">
          {(status === "pending" || canCheckIn || canCancel) && (
            <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              {status === "pending" && <ConfirmButton reference={b.reference} />}
              {canCheckIn && <CheckInButton reference={b.reference} />}
              {status === "confirmed" && !canCheckIn && now < checkInOpens && (
                <p className="text-xs text-zinc-500">Check-in opens {formatLocal(checkInOpens, tz)}.</p>
              )}
              {canCancel && <CancelForm reference={b.reference} feeNote={feeNote} />}
            </section>
          )}

          {policy && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="font-medium">Rules for this booking</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-300">
                <li>Free cancellation until {policy.free_cancel_until_min} min before the start; later, the reservation fee is charged.</li>
                <li>No cancellations after the start time.</li>
                <li>Check in from {policy.check_in_early_min} min before to {policy.no_show_grace_min} min after the start, or the booking becomes a no-show.</li>
                <li>Holds last {policy.hold_minutes} min.</li>
              </ul>
            </section>
          )}

          <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-medium">History</h2>
            <ol className="mt-2 space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span>
                    {STATUS_LABEL[e.to_status as BookingStatus] ?? e.to_status}
                    {e.reason && <span className="block text-xs text-zinc-500">{e.reason}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{formatLocal(e.created_at, tz)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
