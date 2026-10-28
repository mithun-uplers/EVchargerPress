/**
 * Fictional sample data for the design preview (/preview/*), enabled only with ENABLE_DESIGN_PREVIEW=1.
 * Operators, stations and amounts are invented; nothing here is shown in the real app.
 */
import type { BookingBrief } from "@/components/charging/HistoryView";
import type { HistoryItem } from "@/lib/charging-stats";
import type { BatteryReading, Vehicle } from "@/server/account";

export const PREVIEW_NOW = new Date("2026-10-28T09:30:00Z");
const TZ = "Asia/Kolkata";

export const previewVehicles: Vehicle[] = [
  {
    id: "00000000-0000-4000-8000-000000000001", vehicle_type: "car", make: "Sample Motors", model: "City EV", model_year: 2025,
    nickname: "Daily driver", registration_label: "GJ01 •• 4821", battery_capacity_kwh: 40.5, max_ac_kw: 7.2, max_dc_kw: 50,
    created_at: "2026-03-01T00:00:00Z", vehicle_connectors: [{ connector_type: "CCS2", supported_power_kw: 50 }, { connector_type: "Type 2", supported_power_kw: 7.2 }],
  },
  {
    id: "00000000-0000-4000-8000-000000000002", vehicle_type: "scooter", make: "Sample Wheels", model: "S2", model_year: 2024,
    nickname: null, registration_label: null, battery_capacity_kwh: 3.9, max_ac_kw: 1.5, max_dc_kw: null,
    created_at: "2026-05-01T00:00:00Z", vehicle_connectors: [{ connector_type: "Type 2", supported_power_kw: 3.3 }],
  },
];

const V1 = previewVehicles[0];
const stations = [
  { op: "VoltGrid (sample)", name: "Riverfront Hub", addr: "Ashram Road, Ahmedabad", rate: 2100 },
  { op: "GreenPlug (sample)", name: "SG Highway Plaza", addr: "SG Highway, Ahmedabad", rate: 1850 },
  { op: "Demo Hub", name: "Demo Hub — Ahmedabad", addr: "CG Road, Ahmedabad", rate: 2000 },
];

// [ISO start (UTC), minutes, kWh, station index, source]
const raw: [string, number, number, number, HistoryItem["source"]][] = [
  ["2026-10-26T12:10:00Z", 52, 27.4, 0, "manual"],
  ["2026-10-22T03:45:00Z", 38, 18.9, 1, "manual"],
  ["2026-10-18T14:20:00Z", 61, 31.2, 2, "manual"],
  ["2026-10-14T17:45:00Z", 44, 22.6, 0, "operator_api"],
  ["2026-10-09T05:05:00Z", 33, 15.8, 1, "manual"],
  ["2026-10-04T11:30:00Z", 57, 29.9, 0, "manual"],
  ["2026-10-01T16:00:00Z", 25, 11.3, 2, "manual"],
  ["2026-09-27T07:15:00Z", 48, 24.1, 1, "manual"], ["2026-09-19T13:40:00Z", 55, 28.3, 0, "manual"],
  ["2026-09-12T04:20:00Z", 41, 20.2, 2, "manual"], ["2026-09-03T15:05:00Z", 36, 17.5, 1, "manual"],
  ["2026-08-29T10:00:00Z", 50, 25.8, 0, "manual"], ["2026-08-17T06:30:00Z", 46, 23.0, 1, "manual"],
  ["2026-08-06T12:45:00Z", 30, 14.1, 2, "manual"],
  ["2026-07-24T09:10:00Z", 58, 30.4, 0, "manual"], ["2026-07-11T14:55:00Z", 40, 19.6, 1, "manual"],
  ["2026-06-28T05:40:00Z", 47, 23.7, 2, "manual"], ["2026-06-09T16:25:00Z", 35, 16.2, 0, "manual"],
  ["2026-05-21T08:00:00Z", 44, 21.0, 1, "manual"],
];

export const previewItems: HistoryItem[] = [
  ...raw.map(([start, min, kwh, si, source], i): HistoryItem => {
    const st = stations[si];
    return {
      id: `s${i}`, kind: "session", start, end: new Date(Date.parse(start) + min * 60000).toISOString(), timeZone: TZ,
      costMinor: Math.round(kwh * st.rate), energyKwh: kwh, currency: "INR", title: st.op,
      subtitle: `${st.name === st.op ? "" : `${st.name} · `}${st.addr}`, source, reference: i === 2 ? "EVB-7Q2K" : null,
      vehicleId: V1.id, vehicleLabel: "Daily driver", href: null,
    };
  }),
  {
    id: "e1", kind: "estimate", start: "2026-10-20T04:30:00Z", end: "2026-10-20T05:30:00Z", timeZone: TZ, costMinor: 74718, energyKwh: 32.4,
    currency: "INR", title: "Demo Hub", subtitle: "CG Road, Ahmedabad", source: "booking_estimate", reference: "EVB-4M8T",
    vehicleId: V1.id, vehicleLabel: "Daily driver", href: null,
  },
];

export const previewUpcoming: BookingBrief[] = [
  {
    reference: "EVB-9X3P", stationName: "Demo Hub — Ahmedabad", start: "2026-10-29T03:30:00Z", end: "2026-10-29T04:30:00Z", timeZone: TZ,
    status: "confirmed", evseLabel: "DC-1", estimatedTotalMinor: 74718, currency: "INR", vehicleLabel: "Daily driver", vehicleId: V1.id,
  },
  {
    reference: "EVB-2H7D", stationName: "Demo Hub — Ahmedabad", start: "2026-11-02T12:00:00Z", end: "2026-11-02T12:45:00Z", timeZone: TZ,
    status: "pending", evseLabel: "AC-2", estimatedTotalMinor: 21600, currency: "INR", vehicleLabel: "Daily driver", vehicleId: V1.id,
  },
];

export const previewReadings: BatteryReading[] = [
  ["2026-10-28T02:15:00Z", 48, 18620], ["2026-10-26T13:05:00Z", 86, 18540], ["2026-10-26T11:55:00Z", 21, 18538],
  ["2026-10-22T04:25:00Z", 79, 18310], ["2026-10-18T15:25:00Z", 88, 18105], ["2026-10-14T18:30:00Z", 81, 17890],
  ["2026-10-09T05:40:00Z", 72, 17660], ["2026-10-04T12:30:00Z", 90, 17410], ["2026-10-01T16:30:00Z", 64, 17300],
].map(([t, soc, km], i) => ({ id: i + 1, recorded_at: t as string, soc_percent: soc as number, odometer_km: km as number, source: "manual", notes: null }));

export const previewLatest: Record<string, BatteryReading | null> = {
  [V1.id]: previewReadings[0],
  [previewVehicles[1].id]: { id: 99, recorded_at: "2026-10-27T15:00:00Z", soc_percent: 17, odometer_km: 6420, source: "manual", notes: null },
};
