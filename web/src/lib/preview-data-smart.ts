/**
 * Fictional sample data for the smart-EV design previews (/preview/live, /preview/route, /preview/analytics,
 * /preview/station, /preview/home). Only used when ENABLE_DESIGN_PREVIEW=1.
 */
import type { RouteResult } from "@/components/route/RoutePlanView";
import type { BookingRow } from "@/lib/booking-types";
import type { EvseLive, LiveSessionData, LiveSample } from "@/lib/live";
import type { Recommendation } from "@/lib/recommend";
import type { RouteStation } from "@/lib/route-plan";
import { planRoute } from "@/lib/route-plan";
import { PREVIEW_NOW } from "@/lib/preview-data";
import type { StationSummary } from "@/lib/types";

const START = Date.parse("2026-10-28T09:04:00Z");
const NOW_ISO = PREVIEW_NOW.toISOString(); // 09:30Z

// 26 minutes at a 50 kW limit on a 40.5 kWh battery, from 32 %.
const samples: LiveSample[] = [];
let wh = 0, soc = 32;
for (let t = 0; t <= 26 * 60; t += 30) {
  const kw = soc < 80 ? 49 + Math.sin(t / 200) * 1.2 : 49 * (1 - (soc - 80) / 25);
  if (t > 0) { wh += (kw * 1000 * 30) / 3600; soc += ((kw * 30) / 3600 / 40.5) * 100; }
  samples.push({ t: new Date(START + t * 1000).toISOString(), wh: Math.round(wh), w: Math.round(kw * 1000), soc: Math.round(soc * 10) / 10 });
}
const last = samples.at(-1)!;

export const previewLive: { live: LiveSessionData; start: { state: "none" } } = {
  start: { state: "none" },
  live: {
    now: NOW_ISO,
    cost_so_far_minor: Math.round(((last.wh ?? 0) / 1000) * 2000 * 1.18),
    session: {
      id: "00000000-0000-4000-8000-0000000000aa", status: "in_progress", started_at: new Date(START).toISOString(), ended_at: null,
      energy_kwh: Math.round((last.wh ?? 0)) / 1000, total_cost_minor: null, currency: "INR", last_power_kw: (last.w ?? 0) / 1000,
      last_soc_percent: last.soc, start_soc_percent: 32, last_meter_at: new Date(Date.parse(NOW_ISO) - 8000).toISOString(),
      stop_reason: null, is_simulated: true, source: "charger_ocpp",
    },
    booking: { id: "b", reference: "EV-DEMO7Q2K", status: "checked_in", start: "2026-10-28T09:00:00Z", end: "2026-10-28T10:00:00Z", currency: "INR", energy_unit_price_minor: 2000 },
    station: { id: "s", name: "Demo Hub — Ahmedabad", time_zone: "Asia/Kolkata", address: "CG Road, Ahmedabad" },
    evse: { id: "e", label: "DC fast charger 1", max_power_kw: 60, live_status: "charging", live_status_at: NOW_ISO },
    vehicle: { id: "v", label: "Daily driver", battery_capacity_kwh: 40.5 },
    pending_command: null,
    samples,
  },
};

export const previewEvses: EvseLive[] = [
  { evse_id: "e1", station_id: "s", label: "DC fast charger 1", max_power_kw: 60, is_bookable: true, is_connected: true, live_status: "charging", live_status_at: new Date(Date.parse(NOW_ISO) - 9000).toISOString(), live_error_code: null, live_source: "charger_ocpp", live_is_simulated: true, is_fresh: true },
  { evse_id: "e2", station_id: "s", label: "DC fast charger 2", max_power_kw: 60, is_bookable: true, is_connected: true, live_status: "available", live_status_at: new Date(Date.parse(NOW_ISO) - 9000).toISOString(), live_error_code: null, live_source: "charger_ocpp", live_is_simulated: true, is_fresh: true },
  { evse_id: "e3", station_id: "s", label: "AC charger 1", max_power_kw: 7.4, is_bookable: true, is_connected: true, live_status: "reserved", live_status_at: new Date(Date.parse(NOW_ISO) - 9000).toISOString(), live_error_code: null, live_source: "charger_ocpp", live_is_simulated: true, is_fresh: true },
  { evse_id: "e4", station_id: "s", label: "AC charger 2", max_power_kw: 7.4, is_bookable: false, is_connected: true, live_status: "faulted", live_status_at: new Date(Date.parse(NOW_ISO) - 120000).toISOString(), live_error_code: "GroundFailure", live_source: "charger_ocpp", live_is_simulated: true, is_fresh: true },
];

const rs = (along: number, o: Partial<RouteStation>): RouteStation => ({
  id: `r${along}`, name: "Sample station", lat: 0, lng: 0, address: null, city: null, operator: null, is_bookable: false, max_power_kw: 60,
  connector_types: ["CCS2"], live_evse_count: null, live_available_count: null, live_is_simulated: null, along_km: along, detour_km: 0.6, ...o,
});
const routeStations = [
  rs(38, { name: "GreenPlug Nadiad (sample)", city: "Nadiad", operator: "GreenPlug", max_power_kw: 30 }),
  rs(102, { name: "VoltGrid Vadodara Expressway (sample)", city: "Vadodara", operator: "VoltGrid", max_power_kw: 120, is_bookable: true, live_evse_count: 4, live_available_count: 2, live_is_simulated: true }),
  rs(161, { name: "Highway Café Chargers (sample)", city: "Bharuch", operator: "HighwayCharge", max_power_kw: 60, detour_km: 1.4 }),
  rs(214, { name: "Ankleshwar AC point (sample)", city: "Ankleshwar", max_power_kw: 7.4, connector_types: ["Type 2"] }),
  rs(300, { name: "Navsari Fast Hub (sample)", city: "Navsari", operator: "VoltGrid", max_power_kw: 60, is_bookable: true }),
];
const plan = planRoute({ distanceKm: 268, startSocPct: 72, reservePct: 15, batteryKwh: 40.5, consumptionKwhPer100Km: 14.8, vehicleConnectors: ["CCS2", "Type 2"], vehicleMaxDcKw: 50, vehicleMaxAcKw: 7.2, stations: routeStations });
export const previewRoute: RouteResult = {
  fromLabel: "Ahmedabad, Gujarat", toLabel: "Surat, Gujarat", distanceKm: 268, durationMin: 262, source: "osrm", plan,
  inputs: { startSocPct: 72, reservePct: 15, batteryKwh: 40.5, consumption: 14.8, consumptionSource: "your history" },
  stationsConsidered: 47,
};

export const previewRecs: Recommendation[] = [
  { station: { id: "a", name: "Demo Hub — Ahmedabad", city: "Ahmedabad", operator: "Demo Hub", is_bookable: true, max_power_kw: 60, connector_types: ["CCS2"], last_status: "working", live_evse_count: 4, live_available_count: 2, live_is_simulated: true, distance_km: 2.4, energy_price_minor: 2000, visits: 3 }, score: 80, reasons: ["2.4 km away", "2 of 4 free now (simulated)", "You’ve charged here 3 times"], warnings: [] },
  { station: { id: "b", name: "GreenPlug SG Highway (sample)", city: "Ahmedabad", operator: "GreenPlug", is_bookable: false, max_power_kw: 50, connector_types: ["CCS2"], last_status: null, live_evse_count: null, live_available_count: null, live_is_simulated: null, distance_km: 5.1, energy_price_minor: 1700, visits: 2 }, score: 61, reasons: ["5.1 km away", "₹17/kWh — below your average ₹20", "You’ve charged here 2 times"], warnings: [] },
  { station: { id: "c", name: "VoltGrid Riverfront (sample)", city: "Ahmedabad", operator: "VoltGrid", is_bookable: true, max_power_kw: 120, connector_types: ["CCS2"], last_status: null, live_evse_count: 2, live_available_count: 0, live_is_simulated: true, distance_km: 3.2, energy_price_minor: null, visits: 0 }, score: 40, reasons: ["3.2 km away", "Book a slot ahead", "Fits your car (CCS2)"], warnings: ["All 2 busy right now (simulated)"] },
];

// ---- Redesign previews: station list, station header, bookings ----

const baseStation: StationSummary = {
  id: "00000000-0000-4000-8000-0000000000s1", name: "Demo Hub — Ahmedabad", address: "CG Road", city: "Ahmedabad", city_is_approx: false,
  state: "Gujarat", postal_code: "380009", data_source: "demo", time_zone: "Asia/Kolkata", is_bookable: true, external_id: null,
  source_updated_at: null, lat: 23.03, lng: 72.56, operator: "Demo Hub", access: "public", hours: "24 hours", price_info: "₹20/kWh (demo)",
  is_demo: true, created_by: null, created_at: "2026-10-01T00:00:00Z", last_status: "working", last_checkin_at: "2026-10-28T08:40:00Z",
  max_power_kw: 60, connector_types: ["CCS2", "Type 2"], live_evse_count: 4, live_available_count: 2, live_is_simulated: true,
  live_updated_at: "2026-10-28T09:29:50Z",
};
export const previewStations: (StationSummary & { distance: number | null })[] = [
  { ...baseStation, distance: 2.4 },
  { ...baseStation, id: "s2", name: "GreenPlug SG Highway (sample)", address: "SG Highway", operator: "GreenPlug", is_bookable: false, is_demo: false,
    data_source: "community", max_power_kw: 50, connector_types: ["CCS2"], live_evse_count: null, live_available_count: null, live_is_simulated: null,
    last_status: "busy", price_info: null, distance: 5.1 },
  { ...baseStation, id: "s3", name: "Ather Grid Navrangpura", address: null, operator: "Ather", is_bookable: false, is_demo: false,
    data_source: "openstreetmap", max_power_kw: 3.3, connector_types: ["Other"], live_evse_count: null, live_available_count: null, live_is_simulated: null,
    last_status: null, last_checkin_at: null, price_info: null, distance: 6.8 },
  { ...baseStation, id: "s4", name: "VoltGrid Riverfront (sample)", address: "Ashram Road", operator: "VoltGrid", max_power_kw: 120, connector_types: ["CCS2"],
    live_evse_count: 2, live_available_count: 0, last_status: "working", is_demo: false, data_source: "community", distance: 3.2 },
];
export const previewStation = baseStation;

const snap = { policy: { hold_minutes: 10, buffer_min: 10, free_cancel_until_min: 60, check_in_early_min: 15, no_show_grace_min: 15, time_zone: "Asia/Kolkata" } } as unknown as BookingRow["price_snapshot"];
const bk = (o: Partial<BookingRow>): BookingRow => ({
  id: crypto.randomUUID(), reference: "EV-DEMO7Q2K", status: "confirmed", period: '["2026-10-29 03:30:00+00","2026-10-29 04:30:00+00")',
  hold_expires_at: null, price_snapshot: snap, currency: "INR", reservation_fee_minor: 5900, estimated_total_minor: 80618, cancellation_fee_minor: null,
  confirmed_at: null, checked_in_at: null, cancelled_at: null, cancel_reason: null, created_at: "2026-10-27T10:00:00Z",
  station: { id: "s", name: "Demo Hub — Ahmedabad", address: "CG Road", city: "Ahmedabad", city_is_approx: false, time_zone: "Asia/Kolkata" },
  evse: { id: "e", label: "DC fast charger 1", max_power_kw: 60, charge_point_id: "cp" },
  vehicle: { id: "v", make: "Sample Motors", model: "City EV", nickname: "Daily driver" }, ...o,
});
export const previewBookings: BookingRow[] = [
  bk({ status: "checked_in", reference: "EV-DEMO7Q2K", period: '["2026-10-28 09:00:00+00","2026-10-28 10:00:00+00")' }),
  bk({ reference: "EV-9X3PK2MD" }),
  bk({ status: "pending", reference: "EV-2H7DQ8RT", hold_expires_at: "2026-10-28T09:38:00Z", period: '["2026-11-02 12:00:00+00","2026-11-02 12:45:00+00")',
    evse: { id: "e2", label: "AC charger 1", max_power_kw: 7.4, charge_point_id: null }, estimated_total_minor: 27100 }),
];
