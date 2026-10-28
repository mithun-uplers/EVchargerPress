import Link from "next/link";
import { setVerifiedAction } from "@/app/admin/actions";
import { AdminHeader, Chips, Empty, Flash, Pager, Pill, TableCard, one, pageOf, td, th } from "@/components/admin/AdminUI";
import { ui } from "@/lib/ui";
import { listStations, requireAdmin } from "@/server/admin";

export const metadata = { title: "Stations" };
const SIZE = 25;
const SOURCE: Record<string, string> = { community: "EVChargePress", demo: "Demo", openstreetmap: "OpenStreetMap" };

export default async function AdminStations({ searchParams }: PageProps<"/admin/stations">) {
  await requireAdmin("/admin/stations");
  const sp = await searchParams;
  const q = one(sp, "q");
  const source = one(sp, "source");
  const page = pageOf(sp);
  const { rows, total } = await listStations({ search: q, source, page, size: SIZE });
  const link = (o: { source?: string | null; page?: number }) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    const src = o.source === undefined ? source : o.source;
    if (src) p.set("source", src);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return `/admin/stations${s ? `?${s}` : ""}`;
  };
  const back = link({ page });
  return (
    <div className="space-y-4">
      <AdminHeader title="Stations" subtitle="Add, edit, verify and make stations bookable." actions={<Link href="/admin/stations/new" className={ui.btn}>Add a station</Link>} />
      <Flash sp={sp} />
      <form className="flex gap-2" role="search">
        {source && <input type="hidden" name="source" value={source} />}
        <label className="sr-only" htmlFor="q">Search stations</label>
        <input id="q" name="q" defaultValue={q ?? ""} placeholder="Name, city or address" className={`${ui.input} mt-0`} />
        <button className={ui.btnLight}>Search</button>
      </form>
      <Chips
        current={source}
        items={[
          { value: null, label: "All", href: link({ source: null }) },
          { value: "bookable", label: "Bookable", href: link({ source: "bookable" }) },
          { value: "verified", label: "Verified", href: link({ source: "verified" }) },
          { value: "community", label: "EVChargePress", href: link({ source: "community" }) },
          { value: "demo", label: "Demo", href: link({ source: "demo" }) },
          { value: "openstreetmap", label: "OpenStreetMap", href: link({ source: "openstreetmap" }) },
        ]}
      />
      {rows.length === 0 ? (
        <Empty>No stations match.</Empty>
      ) : (
        <TableCard caption="Stations">
          <thead className="border-b border-zinc-100 dark:border-zinc-800">
            <tr><th className={th}>Station</th><th className={th}>Source</th><th className={th}>Connectors</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((s) => (
              <tr key={s.id}>
                <td className={td}>
                  <Link href={`/admin/stations/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                  <span className="block text-xs text-zinc-500">{[s.address, s.city].filter(Boolean).join(", ") || "No address"}</span>
                </td>
                <td className={td}>{SOURCE[s.data_source] ?? s.data_source}</td>
                <td className={td}>
                  <span className="text-xs">{s.connector_types.join(", ") || "—"}</span>
                  {s.max_power_kw > 0 && <span className="block text-xs text-zinc-500">up to {Number(s.max_power_kw)} kW</span>}
                </td>
                <td className={`${td} space-x-1 space-y-1`}>
                  {s.is_bookable ? <Pill tone="green">Bookable</Pill> : <Pill>Not bookable</Pill>}
                  {s.is_verified && <Pill tone="blue">Verified</Pill>}
                  {s.live_evse_count ? <Pill tone="amber">Live</Pill> : null}
                </td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  <form action={setVerifiedAction} className="inline">
                    <input type="hidden" name="station_id" value={s.id} />
                    <input type="hidden" name="verified" value={s.is_verified ? "false" : "true"} />
                    <input type="hidden" name="back" value={back} />
                    <button className="min-h-10 px-2 text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-300">{s.is_verified ? "Unverify" : "Verify"}</button>
                  </form>
                  <Link href={`/admin/stations/${s.id}`} className={`${ui.link} ml-2 text-sm`}>Manage</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
      <Pager page={page} size={SIZE} total={total} href={(p) => link({ page: p })} />
    </div>
  );
}
