import Link from "next/link";
import { adminCancelBookingAction } from "@/app/admin/actions";
import { AdminHeader, BOOKING_TONE, Chips, Empty, Flash, Pager, Pill, TableCard, one, pageOf, td, th } from "@/components/admin/AdminUI";
import { parseRange } from "@/lib/booking-types";
import { formatLocal, formatMoney } from "@/lib/format";
import { ui } from "@/lib/ui";
import { listBookings, namesFor, requireAdmin } from "@/server/admin";

export const metadata = { title: "Bookings" };
const SIZE = 25;
const LABEL: Record<string, string> = {
  pending: "Held", confirmed: "Confirmed", checked_in: "Checked in", completed: "Completed", cancelled: "Cancelled", expired: "Hold expired", no_show: "No-show",
};

export default async function AdminBookings({ searchParams }: PageProps<"/admin/bookings">) {
  await requireAdmin("/admin/bookings");
  const sp = await searchParams;
  const status = one(sp, "status");
  const q = one(sp, "q");
  const page = pageOf(sp);
  const { rows, total } = await listBookings({ status, search: q, page, size: SIZE });
  const names = await namesFor(rows.map((r) => r.user_id));
  const link = (o: { status?: string | null; page?: number }) => {
    const p = new URLSearchParams();
    const st = o.status === undefined ? status : o.status;
    if (st) p.set("status", st);
    if (q) p.set("q", q);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return `/admin/bookings${s ? `?${s}` : ""}`;
  };
  const back = link({ page });
  return (
    <div className="space-y-4">
      <AdminHeader title="Bookings" subtitle="Every booking across the network. Admin cancellations never charge a fee." />
      <Flash sp={sp} />
      <form className="flex gap-2" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="q" className="sr-only">Booking reference</label>
        <input id="q" name="q" defaultValue={q ?? ""} placeholder="Reference, e.g. EV-7KQ2…" className={`${ui.input} mt-0`} />
        <button className={ui.btnLight}>Find</button>
      </form>
      <Chips
        current={status}
        items={[
          { value: null, label: "All", href: link({ status: null }) },
          { value: "live", label: "Live (held, confirmed, checked in)", href: link({ status: "live" }) },
          ...["confirmed", "completed", "cancelled", "no_show", "expired"].map((s) => ({ value: s, label: LABEL[s], href: link({ status: s }) })),
        ]}
      />
      {rows.length === 0 ? (
        <Empty>No bookings match.</Empty>
      ) : (
        <TableCard caption="Bookings">
          <thead className="border-b border-zinc-100 dark:border-zinc-800">
            <tr><th className={th}>Booking</th><th className={th}>When (station time)</th><th className={th}>Driver</th><th className={th}>Amount</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((b) => {
              const tz = b.station?.time_zone ?? "Asia/Kolkata";
              const { start, end } = parseRange(b.period);
              const cancellable = b.status === "pending" || b.status === "confirmed";
              return (
                <tr key={b.id}>
                  <td className={td}>
                    <span className="font-mono text-xs font-semibold">{b.reference}</span>
                    <span className="block text-xs text-zinc-500">
                      {b.station ? <Link className="hover:underline" href={`/admin/stations/${b.station.id}`}>{b.station.name}</Link> : "Station"} · {b.evse?.label ?? "—"}
                    </span>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {formatLocal(start, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}–{formatLocal(end, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                  </td>
                  <td className={td}>{names.get(b.user_id) ?? "Driver"}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {formatMoney(b.estimated_total_minor, b.currency)}
                    <span className="block text-xs text-zinc-500">estimate · fee {formatMoney(b.reservation_fee_minor, b.currency)}</span>
                  </td>
                  <td className={td}>
                    <Pill tone={BOOKING_TONE[b.status] ?? "zinc"}>{LABEL[b.status] ?? b.status}</Pill>
                    {b.cancel_reason && <span className="mt-1 block max-w-[14rem] text-xs text-zinc-500">{b.cancel_reason}</span>}
                  </td>
                  <td className={`${td} text-right`}>
                    {cancellable && (
                      <details className="inline-block text-left">
                        <summary className="min-h-10 cursor-pointer list-none py-2 text-sm font-medium text-rose-600 hover:underline [&::-webkit-details-marker]:hidden">Cancel…</summary>
                        <form action={adminCancelBookingAction} className="mt-1 w-64 space-y-2 rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">
                          <input type="hidden" name="booking_id" value={b.id} />
                          <input type="hidden" name="back" value={back} />
                          <label className="block text-xs font-medium">Reason shown to the driver
                            <input name="reason" required maxLength={250} placeholder="Charger under maintenance" className={ui.input} />
                          </label>
                          <button className="min-h-10 w-full rounded-xl bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700">Cancel booking, no fee</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}
      <Pager page={page} size={SIZE} total={total} href={(p) => link({ page: p })} />
    </div>
  );
}
