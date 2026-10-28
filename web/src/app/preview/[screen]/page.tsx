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
import { previewBookings, previewEvses, previewLive, previewRecs, previewRoute, previewStation, previewStations } from "@/lib/preview-data-smart";
import { BookingCard } from "@/components/booking/BookingCard";
import { HomeHero, StationCard, StationHero } from "@/components/stations/StationBlocks";
import { AnalyticsView } from "@/components/charging/AnalyticsView";
import { EvseLivePanel } from "@/components/live/EvseLivePanel";
import { LiveCharging } from "@/components/live/LiveCharging";
import { Recommendations } from "@/components/live/Recommendations";
import { RouteForm } from "@/components/route/RouteForm";
import { RoutePlanView } from "@/components/route/RoutePlanView";
import { chargingAnalytics } from "@/lib/analytics";

export const metadata: Metadata = { title: "Design preview", robots: { index: false, follow: false } };

const SCREENS = ["home", "station", "bookings", "live", "route", "history", "analytics", "vehicle", "vehicles"] as const;
const TZ = "Asia/Kolkata";

function Banner() {
  return (
    <div role="note" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-charge-50 px-3 py-2 text-xs text-charge-600 ring-1 ring-inset ring-charge-200">
      <span><strong>Design preview · sample data.</strong> Fictional operators and amounts — not your account.</span>
      <span className="flex flex-wrap gap-x-3 gap-y-1">
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

  if (screen === "bookings") {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Banner />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
            <p className="mt-1 text-sm text-zinc-500">Times are shown in each station’s local time.</p>
          </div>
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-sm ring-1 ring-zinc-200/70">
          {["Upcoming", "Completed", "Cancelled", "Expired", "No-show"].map((t, i) => (
            <span key={t} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium ${i === 0 ? "bg-energy-600 text-white shadow-sm" : "text-zinc-500"}`}>{t}</span>
          ))}
        </nav>
        <ul className="space-y-3">{previewBookings.map((b) => <li key={b.id}><BookingCard b={b} now={PREVIEW_NOW} /></li>)}</ul>
      </div>
    );
  }

  if (screen === "live") {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Banner />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Demo Hub — Ahmedabad</h1>
          <p className="text-sm text-zinc-500">DC fast charger 1 · up to 60 kW · Daily driver</p>
        </div>
        <LiveCharging reference="EV-DEMO7Q2K" initial={previewLive} canStart demo />
      </div>
    );
  }

  if (screen === "station") {
    return (
      <div className="space-y-6">
        <Banner />
        <StationHero station={previewStation} canBook />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <div className="grid h-64 place-items-center rounded-2xl bg-energy-50 text-sm text-energy-800 ring-1 ring-energy-200">Map (OpenStreetMap) appears here</div>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <EvseLivePanel stationId="preview" initial={previewEvses} demoNow={PREVIEW_NOW.getTime()} />
          </div>
        </div>
      </div>
    );
  }

  if (screen === "route") {
    return (
      <RoutePlanView
        banner={<Banner />}
        result={previewRoute}
        form={<RouteForm action="/preview/route" vehicles={[{ id: "v1", label: "Daily driver", batteryKwh: 40.5 }]}
          d={{ from: "Ahmedabad", to: "Surat", vehicleId: "v1", soc: "72", reserve: "15", consumption: "14.8", consumptionHint: "Your average from your own entries: 14.8 kWh/100 km" }} />}
      />
    );
  }

  if (screen === "analytics") {
    const items = previewItems.map((i, n) => ({ ...i, chargerKw: i.title.startsWith("GreenPlug") ? 7.4 : 60, source: n % 4 === 1 ? ("charger_ocpp" as const) : i.source, isSimulated: n % 4 === 1 }));
    return <AnalyticsView banner={<Banner />} a={chargingAnalytics(items, PREVIEW_NOW, TZ)} />;
  }

  if (screen === "home") {
    return (
      <div className="space-y-6">
        <Banner />
        <HomeHero name="Mithun" q="" connector="" bookableOnly={false} workingOnly={false} loc={{ lat: 23.03, lng: 72.56 }} mapHref="/map" />
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-energy-800 to-energy-600 p-4 text-white shadow-md">
          <span className="flex items-center gap-3">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-charge-400 motion-safe:animate-pulse" />
            <span>
              <span className="block font-semibold">Charging at Demo Hub — Ahmedabad</span>
              <span className="block text-sm text-white/80">20.9 kWh · 49 kW · 83% · Simulated</span>
            </span>
          </span>
          <span aria-hidden="true" className="text-xl">→</span>
        </div>
        <Recommendations items={previewRecs} vehicleLabel="Daily driver" located />
        <p className="pt-2 text-sm text-zinc-500">4 stations within 25 km, nearest first</p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {previewStations.map((st) => <li key={st.id}><StationCard s={st} /></li>)}
        </ul>
      </div>
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
