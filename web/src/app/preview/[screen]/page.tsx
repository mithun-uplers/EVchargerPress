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
import { previewBookings, previewConnection, previewEvses, previewLive, previewRecs, previewRoute, previewStation, previewStations, previewTelemetry, previewTrip, previewTripList, previewTripStations } from "@/lib/preview-data-smart";
import { BookingCard } from "@/components/booking/BookingCard";
import { TripStations } from "@/components/route/TripStations";
import { AccountMenuView } from "@/components/UserMenu";
import { VehicleConnectPanel } from "@/components/vehicles/VehicleConnectPanel";
import { resultFromTrip, stationItems } from "@/lib/trip-view";
import { formatDuration } from "@/lib/charging-stats";
import { HomeHero, StationCard, StationHero } from "@/components/stations/StationBlocks";
import { AnalyticsView } from "@/components/charging/AnalyticsView";
import { EvseLivePanel } from "@/components/live/EvseLivePanel";
import { LiveCharging } from "@/components/live/LiveCharging";
import { Recommendations } from "@/components/live/Recommendations";
import { RouteForm } from "@/components/route/RouteForm";
import { RoutePlanView } from "@/components/route/RoutePlanView";
import { chargingAnalytics } from "@/lib/analytics";
import { AdminNav } from "@/components/admin/AdminNav";
import { DashboardView } from "@/components/admin/DashboardView";
import { StationManageView } from "@/components/admin/StationManageView";
import { UsersView } from "@/components/admin/UsersView";
import { UserDetailView } from "@/components/admin/UserDetailView";
import { CreateUserForm } from "@/components/admin/UserForms";
import { AdminHeader } from "@/components/admin/AdminUI";
import { previewAdminStation, previewDashboard, previewUserAudit, previewUserDetail, previewUsers } from "@/lib/preview-data-admin";

export const metadata: Metadata = { title: "Design preview", robots: { index: false, follow: false } };

const SCREENS = ["home", "station", "bookings", "live", "route", "trips", "trip", "connect", "account", "history", "analytics", "vehicle", "vehicles", "admin", "admin-station", "admin-users", "admin-user", "admin-new-user"] as const;
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

  if (screen === "trips") {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <Banner />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Saved trips</h1>
            <p className="mt-1 text-sm text-zinc-500">Each trip keeps its route, charging stops and every station along the way.</p>
          </div>
          <span className="inline-flex min-h-11 items-center rounded-xl bg-energy-600 px-5 text-sm font-semibold text-white shadow-sm">Plan a new trip</span>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {previewTripList.map((t) => (
            <li key={t.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate font-semibold">{t.name}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${t.feasible ? "bg-energy-100 text-energy-800" : "bg-rose-100 text-rose-800"}`}>{t.feasible ? `${t.counts.stops} stop${t.counts.stops === 1 ? "" : "s"}` : "Gap on route"}</span>
              </div>
              <p className="mt-0.5 truncate text-sm text-zinc-500">{t.from_label.split(",")[0]} → {t.to_label.split(",")[0]}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-[11px] text-zinc-500">Distance</dt><dd className="font-semibold">{Math.round(t.distance_km)} km</dd></div>
                <div><dt className="text-[11px] text-zinc-500">Driving</dt><dd className="font-semibold">{formatDuration(t.duration_min)}</dd></div>
                <div><dt className="text-[11px] text-zinc-500">Stations</dt><dd className="font-semibold">{t.counts.stations} <span className="text-xs font-normal text-zinc-500">({t.counts.compatible} fit)</span></dd></div>
              </dl>
              <p className="mt-3 text-xs text-zinc-500">Saved {new Date(t.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · Daily driver{t.route_source === "straight_line" ? " · straight-line estimate" : ""}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (screen === "trip") {
    const live = new Map([["x", { total: 4, free: 2, simulated: true }]]);
    const items = stationItems(previewTripStations, live).map((s) => (s.stopOrder === 1 ? { ...s, live: { total: 4, free: 2, simulated: true } } : s));
    return (
      <RoutePlanView
        title={previewTrip.name}
        subtitle="Saved 27 Oct 2026 · Daily driver · battery levels and times are the estimates from when you planned it."
        banner={<><Banner /><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-zinc-500">← Saved trips</span>
          <div className="flex flex-wrap gap-2"><span className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-medium shadow-sm ring-1 ring-inset ring-zinc-200">Plan again with today’s battery</span>
          <span className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">Delete</span></div>
          <p className="basis-full text-sm text-zinc-600">{previewTrip.notes}</p></div></>}
        result={resultFromTrip(previewTrip, previewTripStations, new Map())}
        extra={<TripStations items={items} filter={sp.stations === "compatible" ? "compatible" : sp.stations === "stops" ? "stops" : "all"} baseHref="/preview/trip" />}
      />
    );
  }

  if (screen === "connect") {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Banner />
        <VehicleConnectPanel vehicleId="v" connection={previewConnection} telemetry={previewTelemetry} smartcarAvailable smartcarTestMode notice={{ kind: "ok", text: "Simulated car connected. It reports a reading every 5 minutes." }} now={PREVIEW_NOW.getTime()} demo />
        <VehicleConnectPanel vehicleId="v" connection={null} telemetry={[]} smartcarAvailable={false} smartcarTestMode notice={null} now={PREVIEW_NOW.getTime()} demo />
      </div>
    );
  }

  if (screen.startsWith("admin")) {
    return (
      <div className="space-y-5">
        <Banner />
        <AdminNav />
        {screen === "admin" && <DashboardView d={previewDashboard} />}
        {screen === "admin-station" && <StationManageView d={previewAdminStation} sp={{}} />}
        {screen === "admin-users" && <UsersView rows={previewUsers} q={null} page={1} size={25} meId="u1" sp={{ ok: "Admin access granted." }} />}
        {screen === "admin-user" && <UserDetailView u={previewUserDetail} audit={previewUserAudit} isSelf={false} canManageAccounts sp={{}} />}
        {screen === "admin-new-user" && (
          <div className="mx-auto max-w-2xl space-y-5">
            <AdminHeader title="Add a user" subtitle="Create a confirmed account for a driver or another admin." />
            <CreateUserForm disabled={false} />
          </div>
        )}
      </div>
    );
  }

  if (screen === "account") {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <Banner />
        <h1 className="text-xl font-semibold">Account menu</h1>
        <p className="text-sm text-zinc-500">Desktop: bottom of the sidebar (now always visible). Phone: tap your initials in the top bar.</p>
        <div className="w-60"><AccountMenuView name="Mithun" email="mithun.r@example.com" initials="M" demo admin /></div>
        <div className="relative flex justify-end rounded-2xl bg-white p-3 pb-96 shadow-sm ring-1 ring-zinc-200/70">
          <div className="[&_details]:open"><AccountMenuView name="Mithun" email="mithun.r@example.com" initials="M" compact demo admin /></div>
        </div>
      </div>
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
        <LiveCharging reference="EV-DEMO7Q2K" initial={previewLive} canStart serverNow={PREVIEW_NOW.getTime()} demo />
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
            <EvseLivePanel stationId="preview" initial={previewEvses} serverNow={PREVIEW_NOW.getTime()} demoNow={PREVIEW_NOW.getTime()} />
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
        save={
          <div className="relative mt-4 flex flex-col gap-2 sm:flex-row">
            <input aria-label="Trip name" placeholder="Ahmedabad → Surat" className="min-h-11 flex-1 rounded-xl bg-white/95 px-3 text-sm text-zinc-900 placeholder:text-zinc-500" />
            <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-charge-400 px-5 text-sm font-semibold text-zinc-900 shadow-sm">Save trip</button>
          </div>
        }
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
          preferredSlot={<><span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-white/30">Preferred</span>
            <span className="inline-flex min-h-9 items-center rounded-full bg-charge-400 px-3 text-sm font-semibold text-zinc-900">Connect car</span></>}
          connectSlot={<VehicleConnectPanel vehicleId={v.id} connection={null} telemetry={[]} smartcarAvailable={false} smartcarTestMode notice={null} now={PREVIEW_NOW.getTime()} demo />}
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
        <p className="mt-1 text-sm text-zinc-500">Connector types decide which chargers you can book. Tap <strong>Connect car</strong> to read battery, range and location from the car itself.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {previewVehicles.map((v, i) => (
          <VehicleCard key={v.id} vehicle={v} latest={previewLatest[v.id]} preferred={i === 0}
            action={<span className="flex flex-wrap items-center gap-1">{i ? <span className="px-3 text-sm font-medium text-energy-700">Make preferred</span> : null}
              <Link href="/preview/connect" className="inline-flex min-h-9 items-center rounded-lg bg-charge-400 px-3 text-sm font-semibold text-zinc-900">Connect car</Link></span>} />
        ))}
      </ul>
    </div>
  );
}
