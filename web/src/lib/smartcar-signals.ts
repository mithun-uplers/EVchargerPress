/**
 * Maps Smartcar Vehicles API v3 signals to our telemetry reading (pure, unit-tested).
 * Signal codes from https://smartcar.com/docs/api-reference/signals/schema — only values Smartcar
 * reports with status SUCCESS are used; anything missing stays null (we never fill gaps).
 */

export type TelemetryReading = {
  recorded_at: string | null;
  soc_percent: number | null;
  range_km: number | null;
  odometer_km: number | null;
  is_charging: boolean | null;
  is_plugged_in: boolean | null;
  charge_power_kw: number | null;
  charge_limit_percent: number | null;
  latitude: number | null;
  longitude: number | null;
};

type SignalBody = Record<string, unknown> & { value?: unknown; unit?: string };
type Signal = { code: string; body: SignalBody; at: string | null };

const MI_TO_KM = 1.609344;
const toKm = (v: unknown, unit?: string) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round((/^mi|miles?$/i.test(unit ?? "") ? n * MI_TO_KM : n) * 10) / 10;
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

/** Accepts the list-signals response (`data: [...]`) or an array of single-signal responses. */
export function extractSignals(json: unknown): Signal[] {
  const items: unknown[] = Array.isArray(json) ? json.flatMap((x) => (x && typeof x === "object" && "data" in x ? [(x as { data: unknown }).data] : [x]))
    : json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data) ? (json as { data: unknown[] }).data
    : json && typeof json === "object" && (json as { data?: unknown }).data ? [(json as { data: unknown }).data] : [];
  const out: Signal[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const a = (it as { attributes?: Record<string, unknown> }).attributes ?? {};
    const code = (a.code ?? (it as { id?: unknown }).id) as string | undefined;
    const status = (a.status as { value?: string } | undefined)?.value;
    const body = a.body as SignalBody | undefined;
    if (!code || !body || (status && status !== "SUCCESS")) continue;
    const meta = (it as { meta?: { oemUpdatedAt?: string; retrievedAt?: string } }).meta;
    out.push({ code, body, at: meta?.oemUpdatedAt ?? meta?.retrievedAt ?? null });
  }
  return out;
}

export function toReading(signals: Signal[]): TelemetryReading {
  const by = new Map(signals.map((s) => [s.code, s]));
  const b = (code: string) => by.get(code)?.body;
  const soc = num(b("tractionbattery-stateofcharge")?.value);
  const watts = num(b("charge-wattage")?.value);
  const loc = b("location-preciselocation");
  const lat = num(loc?.latitude), lng = num(loc?.longitude);
  const times = signals.map((s) => s.at).filter(Boolean) as string[];
  return {
    recorded_at: by.get("tractionbattery-stateofcharge")?.at ?? (times.length ? times.sort().at(-1)! : null),
    soc_percent: soc !== null && soc >= 0 && soc <= 100 ? soc : null,
    range_km: b("tractionbattery-range") ? toKm(b("tractionbattery-range")!.value, b("tractionbattery-range")!.unit) : null,
    odometer_km: b("odometer-traveleddistance") ? toKm(b("odometer-traveleddistance")!.value, b("odometer-traveleddistance")!.unit) : null,
    is_charging: bool(b("charge-ischarging")?.value),
    is_plugged_in: bool(b("charge-ischargingcableconnected")?.value),
    charge_power_kw: watts !== null ? Math.round((/kw/i.test(b("charge-wattage")?.unit ?? "") ? watts : watts / 1000) * 100) / 100 : null,
    charge_limit_percent: num(b("charge-chargelimits")?.activeLimit),
    latitude: lat !== null && Math.abs(lat) <= 90 ? lat : null,
    longitude: lng !== null && Math.abs(lng) <= 180 ? lng : null,
  };
}

export const hasAnyValue = (r: TelemetryReading) =>
  r.soc_percent !== null || r.range_km !== null || r.odometer_km !== null || r.is_charging !== null || r.latitude !== null;
