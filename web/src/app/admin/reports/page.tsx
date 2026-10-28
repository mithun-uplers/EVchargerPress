import Link from "next/link";
import { removeReportAction } from "@/app/admin/actions";
import { AdminHeader, Chips, Empty, Flash, Pill, one } from "@/components/admin/AdminUI";
import { formatLocal } from "@/lib/format";
import { ui } from "@/lib/ui";
import { listReports, namesFor, requireAdmin } from "@/server/admin";

export const metadata = { title: "Reports" };
const STATUS: Record<string, { label: string; tone: "green" | "red" | "amber" }> = {
  working: { label: "Working", tone: "green" }, broken: { label: "Broken", tone: "red" }, busy: { label: "Busy", tone: "amber" },
};

export default async function AdminReports({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdmin("/admin/reports");
  const sp = await searchParams;
  const raw = one(sp, "kind");
  const kind = raw === "broken" || raw === "reviews" ? raw : "all";
  const rows = await listReports(kind);
  const names = await namesFor(rows.map((r) => r.user_id));
  const back = `/admin/reports${kind === "all" ? "" : `?kind=${kind}`}`;
  return (
    <div className="space-y-4">
      <AdminHeader title="Driver reports" subtitle="Check-ins and reviews from drivers. Remove spam, abuse or reports that are clearly wrong; removals are recorded in the audit log." />
      <Flash sp={sp} />
      <Chips
        current={kind}
        items={[
          { value: "all", label: "Everything", href: "/admin/reports" },
          { value: "broken", label: "Broken reports", href: "/admin/reports?kind=broken" },
          { value: "reviews", label: "Reviews", href: "/admin/reports?kind=reviews" },
        ]}
      />
      {rows.length === 0 ? (
        <Empty>Nothing to review.</Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className={`${ui.card} flex flex-wrap items-start justify-between gap-3`}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {r.kind === "checkin" ? (
                    <Pill tone={STATUS[r.status ?? ""]?.tone ?? "amber"}>{STATUS[r.status ?? ""]?.label ?? r.status}</Pill>
                  ) : (
                    <Pill tone="blue">{"★".repeat(r.rating ?? 0)}<span className="sr-only">{r.rating} out of 5</span></Pill>
                  )}
                  <Link href={`/admin/stations/${r.station_id}`} className="font-medium hover:underline">{r.station_name}</Link>
                </div>
                {r.comment ? <p className="break-words text-sm text-zinc-700 dark:text-zinc-200">{r.comment}</p> : <p className="text-sm text-zinc-500">No comment.</p>}
                <p className="text-xs text-zinc-500">
                  {r.kind === "checkin" ? "Check-in" : "Review"} by {names.get(r.user_id) ?? "Driver"} · {formatLocal(r.created_at, "Asia/Kolkata", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} IST
                </p>
              </div>
              <form action={removeReportAction}>
                <input type="hidden" name="kind" value={r.kind} />
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="back" value={back} />
                <button className="min-h-10 text-sm font-medium text-rose-600 hover:underline">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
