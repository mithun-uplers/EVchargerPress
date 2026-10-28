import Link from "next/link";
import { AdminHeader, Stat } from "@/components/admin/AdminUI";
import { formatLocal } from "@/lib/format";
import { ui } from "@/lib/ui";
import type { Dashboard } from "@/server/admin";


const STATUS_LABEL: Record<string, string> = {
  pending: "Held", confirmed: "Confirmed", checked_in: "Checked in", completed: "Completed", cancelled: "Cancelled", expired: "Hold expired", no_show: "No-show",
};
const SOURCE_LABEL: Record<string, string> = { community: "Added by EVChargePress", demo: "Demo", openstreetmap: "OpenStreetMap" };
const n = (v: number) => Number(v ?? 0).toLocaleString("en-IN");

export function DashboardView({ d }: { d: Dashboard }) {
  const statuses = Object.entries(d.bookings_by_status_30d).sort((a, b) => b[1] - a[1]);
  const totalBookings = statuses.reduce((a, [, v]) => a + v, 0);
  return (
    <div className="space-y-6">
      <AdminHeader
        title="Dashboard"
        subtitle={<>Counts as of {formatLocal(d.generated_at, "Asia/Kolkata", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} IST.</>}
        actions={<Link href="/admin/stations/new" className={ui.btn}>Add a station</Link>}
      />

      <section aria-labelledby="ops">
        <h2 id="ops" className="mb-2 text-sm font-semibold text-zinc-500">Operations</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Bookings today" value={n(d.bookings_today)} note={`${n(d.bookings_upcoming)} upcoming`} href="/admin/bookings?status=live" />
          <Stat label="Charging now" value={n(d.sessions_active)} note={`${n(d.sessions_30d)} sessions · ${d.kwh_30d} kWh in 30 days`} href="/admin/sessions?status=in_progress" />
          <Stat label="Chargers online" value={`${n(d.charge_points_online)} / ${n(d.charge_points)}`} note={d.charge_points_simulated ? `${n(d.charge_points_simulated)} simulated` : "heartbeat in the last 5 min"} href="/admin/chargers" />
          <Stat label="Broken reports" value={n(d.broken_reports_7d)} note={`${n(d.checkins_7d)} check-ins in 7 days`} href="/admin/reports?kind=broken" />
        </dl>
      </section>

      <section aria-labelledby="net">
        <h2 id="net" className="mb-2 text-sm font-semibold text-zinc-500">Network and people</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Stations" value={n(d.stations)} note={`${n(d.verified_stations)} verified`} href="/admin/stations" />
          <Stat label="Bookable stations" value={n(d.bookable_stations)} note={`${n(d.evses)} active charging points`} href="/admin/stations?source=bookable" />
          <Stat label="Users" value={n(d.users)} note={`${n(d.admins)} admin${d.admins === 1 ? "" : "s"}${d.suspended ? ` · ${n(d.suspended)} suspended` : ""}`} href="/admin/users" />
          <Stat label="Reviews" value={n(d.reviews)} href="/admin/reports?kind=reviews" />
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={ui.card}>
          <h2 className="font-semibold">Bookings in the last 30 days</h2>
          {totalBookings === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No bookings yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {statuses.map(([status, count]) => (
                <li key={status} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-300">{STATUS_LABEL[status] ?? status}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <span className="block h-full rounded-full bg-energy-500" style={{ width: `${(count / totalBookings) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{n(count)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={ui.card}>
          <h2 className="font-semibold">Stations by source</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {Object.entries(d.stations_by_source).map(([src, count]) => (
              <li key={src} className="flex justify-between gap-3">
                <Link className={ui.link} href={`/admin/stations?source=${src}`}>{SOURCE_LABEL[src] ?? src}</Link>
                <span className="tabular-nums">{n(count)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">
            OpenStreetMap stations are listed for discovery only. To take bookings, a station needs charging points, opening hours, booking rules and a tariff.
          </p>
        </section>
      </div>
    </div>
  );
}
