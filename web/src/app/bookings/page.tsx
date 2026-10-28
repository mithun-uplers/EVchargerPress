import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingStatusBadge } from "@/components/booking/BookingStatusBadge";
import { BOOKING_TABS, effectiveStatus, parseRange, type BookingTab } from "@/lib/booking-types";
import { formatLocal, formatMoney, formatTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { listBookings } from "@/server/bookings";

export const metadata: Metadata = { title: "My bookings" };

const TAB_LABEL: Record<BookingTab, string> = {
  upcoming: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  no_show: "No-show",
};

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/bookings");
  const sp = await searchParams;
  const tab = (BOOKING_TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as BookingTab) : "upcoming";

  const now = new Date();
  let rows = await listBookings(tab);
  // A lapsed hold the sweeper hasn't processed yet belongs under "Expired", not "Upcoming".
  if (tab === "upcoming") rows = rows.filter((b) => effectiveStatus(b, now) !== "expired" && parseRange(b.period).end > now);
  if (tab === "expired") {
    const lapsed = (await listBookings("upcoming")).filter((b) => effectiveStatus(b, now) === "expired");
    rows = [...lapsed, ...rows];
  }
  rows.sort((a, b) =>
    tab === "upcoming"
      ? parseRange(a.period).start.getTime() - parseRange(b.period).start.getTime()
      : parseRange(b.period).start.getTime() - parseRange(a.period).start.getTime(),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
      <nav aria-label="Booking status" className="-mx-1 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {BOOKING_TABS.map((t) => (
          <Link
            key={t}
            href={`/bookings?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
              t === tab ? "border-energy-600 text-energy-700 dark:text-energy-400" : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="font-medium">No {TAB_LABEL[tab].toLowerCase()} bookings.</p>
          {tab === "upcoming" && (
            <p className="mt-1 text-sm text-zinc-500">
              Find a bookable station on the <Link href="/map" className="font-medium text-energy-700 hover:underline">map</Link> or in the{" "}
              <Link href="/" className="font-medium text-energy-700 hover:underline">list</Link>.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => {
            const tz = b.station?.time_zone ?? "Asia/Kolkata";
            const { start, end } = parseRange(b.period);
            return (
              <li key={b.id}>
                <Link href={`/bookings/${b.reference}`} className="block rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-energy-500 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.station?.name ?? "Charging station"}</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300">
                        {formatLocal(start, tz, { weekday: "short", day: "numeric", month: "short" })}, {formatTime(start, tz)}–{formatTime(end, tz)} · {b.evse?.label}
                      </p>
                      <p className="mt-1 font-mono text-xs text-zinc-500">{b.reference}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <BookingStatusBadge status={effectiveStatus(b, now)} />
                      <span className="text-xs text-zinc-500">est. {formatMoney(b.estimated_total_minor, b.currency)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
