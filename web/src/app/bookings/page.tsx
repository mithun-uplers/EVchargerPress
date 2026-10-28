import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingCard } from "@/components/booking/BookingCard";
import { BOOKING_TABS, effectiveStatus, parseRange, type BookingTab } from "@/lib/booking-types";
import { getCurrentUser } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
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
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
          <p className="mt-1 text-sm text-zinc-500">Times are shown in each station’s local time.</p>
        </div>
        <Link href="/?bookable=1" className={ui.btn}>Book a charger</Link>
      </div>
      <nav aria-label="Booking status" className="-mx-1 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
        {BOOKING_TABS.map((t) => (
          <Link
            key={t}
            href={`/bookings?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition ${
              t === tab ? "bg-energy-600 text-white shadow-sm" : "text-zinc-500 hover:bg-energy-50 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
            }`}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center dark:border-zinc-700 dark:bg-transparent">
          <p className="font-medium">No {TAB_LABEL[tab].toLowerCase()} bookings.</p>
          {tab === "upcoming" && (
            <p className="mt-1 text-sm text-zinc-500">
              Find a bookable station on the <Link href="/map" className={ui.link}>map</Link> or in the{" "}
              <Link href="/?bookable=1" className={ui.link}>list</Link>.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => {
            return <li key={b.id}><BookingCard b={b} now={now} /></li>;
          })}
        </ul>
      )}
    </div>
  );
}
