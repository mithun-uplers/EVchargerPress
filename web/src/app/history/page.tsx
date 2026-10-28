import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SessionForm } from "@/components/account/SessionForm";
import { HistoryView } from "@/components/charging/HistoryView";
import { upcomingBriefs } from "@/lib/booking-brief";
import { parseRange } from "@/lib/booking-types";
import {
  averagePricePerKwhMinor, buildHistory, normalisePeriod, periodKeys, toHistoryItems, type HistoryMetric, type HistoryView as View,
} from "@/lib/charging-stats";
import { formatLocal } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { listFinishedBookings, listSessions, listVehicles, sessionCandidateBookings, vehicleLabel } from "@/server/account";
import { listBookings } from "@/server/bookings";

export const metadata: Metadata = { title: "Charging history" };

const TZ = "Asia/Kolkata"; // period boundaries; each item still uses its station's zone

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/history");
  const sp = await searchParams;
  const view: View = sp.view === "year" ? "year" : "month";
  const metric: HistoryMetric = sp.metric === "energy" ? "energy" : "cost";
  const now = new Date();
  const period = normalisePeriod(view, typeof sp.period === "string" ? sp.period : undefined, now, TZ);

  const [sessions, finished, vehicles, candidates, upcomingRows] = await Promise.all([
    listSessions(500), listFinishedBookings(200), listVehicles(), sessionCandidateBookings(), listBookings("upcoming"),
  ]);
  const items = toHistoryItems(sessions, finished);
  const periods = periodKeys(view, now, TZ, view === "month" ? 12 : 3);
  if (!periods.includes(period)) periods.push(period);
  const prevKey = view === "month"
    ? (() => { const [y, m] = period.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; })()
    : String(Number(period) - 1);

  return (
    <HistoryView
      summary={buildHistory(items, view, period, metric)}
      previous={buildHistory(items, view, prevKey, metric)}
      periods={periods}
      upcoming={upcomingBriefs(upcomingRows, now)}
      avgPriceMinor={averagePricePerKwhMinor(items)}
      addSession={
        <SessionForm
          vehicles={vehicles.map((v) => ({ id: v.id, label: vehicleLabel(v) }))}
          bookings={candidates.map((b) => {
            const { start } = parseRange(b.period);
            return { id: b.id, label: `${b.reference} · ${b.station?.name ?? ""} · ${formatLocal(start, TZ, { day: "numeric", month: "short" })}` };
          })}
        />
      }
    />
  );
}
