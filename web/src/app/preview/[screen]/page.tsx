import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionForm } from "@/components/account/SessionForm";
import { HistoryView } from "@/components/charging/HistoryView";
import { VehicleCard } from "@/components/charging/VehicleCard";
import { VehicleDashboard } from "@/components/charging/VehicleDashboard";
import { BatteryReadingForm } from "@/components/vehicles/VehicleExtras";
import { averagePricePerKwhMinor, buildHistory, normalisePeriod, periodKeys, type HistoryMetric, type HistoryView as View } from "@/lib/charging-stats";
import { PREVIEW_NOW, previewItems, previewLatest, previewReadings, previewUpcoming, previewVehicles } from "@/lib/preview-data";

export const metadata: Metadata = { title: "Design preview", robots: { index: false, follow: false } };

const SCREENS = ["history", "vehicle", "vehicles"] as const;
const TZ = "Asia/Kolkata";

function Banner() {
  return (
    <div role="note" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-charge-50 px-3 py-2 text-xs text-charge-600 ring-1 ring-inset ring-charge-200">
      <span><strong>Design preview · sample data.</strong> Fictional operators and amounts — not your account.</span>
      <span className="flex gap-3">
        {SCREENS.map((s) => <Link key={s} href={`/preview/${s}`} className="font-medium underline-offset-2 hover:underline">{s}</Link>)}
      </span>
    </div>
  );
}

/** Sample-data screens for design review. Off unless ENABLE_DESIGN_PREVIEW=1 (never set it in production). */
export default async function PreviewPage({ params, searchParams }: PageProps<"/preview/[screen]">) {
  if (process.env.ENABLE_DESIGN_PREVIEW !== "1") notFound();
  const { screen } = await params;
  if (!(SCREENS as readonly string[]).includes(screen)) notFound();
  const sp = await searchParams;

  if (screen === "history") {
    const view: View = sp.view === "year" ? "year" : "month";
    const metric: HistoryMetric = sp.metric === "energy" ? "energy" : "cost";
    const period = normalisePeriod(view, typeof sp.period === "string" ? sp.period : undefined, PREVIEW_NOW, TZ);
    const prev = view === "month" ? (period === "2026-10" ? "2026-09" : "2026-08") : String(Number(period) - 1);
    return (
      <HistoryView
        banner={<Banner />}
        basePath="/preview/history"
        summary={buildHistory(previewItems, view, period, metric)}
        previous={buildHistory(previewItems, view, prev, metric)}
        periods={periodKeys(view, PREVIEW_NOW, TZ, view === "month" ? 12 : 3)}
        upcoming={previewUpcoming}
        avgPriceMinor={averagePricePerKwhMinor(previewItems)}
        addSession={<SessionForm vehicles={previewVehicles.map((v) => ({ id: v.id, label: v.nickname || `${v.make} ${v.model}` }))} bookings={[]} />}
      />
    );
  }

  if (screen === "vehicle") {
    const v = previewVehicles[0];
    return (
      <div className="space-y-4">
        <Banner />
        <VehicleDashboard
          vehicle={v}
          readings={previewReadings}
          items={previewItems.filter((i) => i.vehicleId === v.id)}
          upcoming={previewUpcoming}
          pricePerKwhMinor={averagePricePerKwhMinor(previewItems)}
          priceBasis="your average for this vehicle"
          now={PREVIEW_NOW}
          preferredSlot={<span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-white/30">Preferred</span>}
          readingForm={<BatteryReadingForm vehicleId={v.id} />}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Banner />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My vehicles</h1>
        <p className="mt-1 text-sm text-zinc-500">Connector types decide which chargers you can book. Battery levels are from your manual readings.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {previewVehicles.map((v, i) => (
          <VehicleCard key={v.id} vehicle={v} latest={previewLatest[v.id]} preferred={i === 0}
            action={i ? <span className="text-sm font-medium text-energy-700">Make preferred</span> : undefined} />
        ))}
      </ul>
    </div>
  );
}
