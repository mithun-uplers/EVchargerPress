/**
 * EV route planning (pure). Everything here is an estimate from the driver's inputs — battery size,
 * starting %, consumption — and the station data we have. Results must be labelled as estimates.
 */

export type RouteStation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  city: string | null;
  operator: string | null;
  is_bookable: boolean;
  max_power_kw: number | null;
  connector_types: string[];
  live_evse_count: number | null;
  live_available_count: number | null;
  live_is_simulated: boolean | null;
  along_km: number;
  detour_km: number;
};

export type PlanInput = {
  distanceKm: number;
  startSocPct: number;
  reservePct?: number; // never plan to arrive anywhere below this
  chargeToPct?: number; // stop charging here (charging slows above ~80 %)
  batteryKwh: number;
  consumptionKwhPer100Km: number;
  vehicleConnectors: string[];
  vehicleMaxDcKw: number | null;
  vehicleMaxAcKw: number | null;
  stations: RouteStation[];
};

export type PlannedStop = {
  station: RouteStation;
  arriveSocPct: number;
  departSocPct: number;
  energyKwh: number;
  powerKw: number | null;
  chargeMinutes: number | null;
  legKm: number;
};

export type Plan =
  | { ok: true; stops: PlannedStop[]; arriveSocPct: number; energyKwh: number; chargeMinutes: number | null; compatibleStations: number }
  | { ok: false; reason: "gap"; stops: PlannedStop[]; gapFromKm: number; gapToKm: number; compatibleStations: number };

const DC_MIN_KW = 25;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function isCompatible(s: Pick<RouteStation, "connector_types">, vehicleConnectors: string[]) {
  return s.connector_types.some((c) => vehicleConnectors.includes(c));
}

/** Power the vehicle can actually draw at a station: limited by the station and by the vehicle's AC/DC maximum. */
export function stationPowerKw(s: Pick<RouteStation, "max_power_kw">, dc: number | null, ac: number | null) {
  const p = s.max_power_kw ? Number(s.max_power_kw) : null;
  if (!p) return null;
  const limit = p >= DC_MIN_KW ? dc ?? ac : ac;
  return limit ? Math.min(p, limit) : p >= DC_MIN_KW ? null : p;
}

export function planRoute(input: PlanInput): Plan {
  const reserve = input.reservePct ?? 15;
  const chargeTo = input.chargeToPct ?? 80;
  const kmPerPct = input.batteryKwh / input.consumptionKwhPer100Km; // 1 % of battery → km (battery/100 kWh ÷ kWh-per-km)
  const pctFor = (km: number) => km / kmPerPct;
  const candidates = input.stations
    .filter((s) => isCompatible(s, input.vehicleConnectors) && s.along_km > 0.5 && s.along_km < input.distanceKm)
    .sort((a, b) => a.along_km - b.along_km);

  const stops: PlannedStop[] = [];
  let pos = 0;
  let soc = input.startSocPct;
  for (let guard = 0; guard < 12; guard++) {
    const reach = pos + Math.max(0, soc - reserve) * kmPerPct;
    if (reach >= input.distanceKm) {
      const energy = stops.reduce((a, s) => a + s.energyKwh, 0);
      const mins = stops.every((s) => s.chargeMinutes !== null) ? stops.reduce((a, s) => a + (s.chargeMinutes ?? 0), 0) : null;
      return { ok: true, stops, arriveSocPct: r1(soc - pctFor(input.distanceKm - pos)), energyKwh: r1(energy), chargeMinutes: mins, compatibleStations: candidates.length };
    }
    // Reachable stations, keeping the reserve after the detour off the route.
    const reachable = candidates.filter((s) => s.along_km > pos + 1 && s.along_km + s.detour_km <= reach);
    if (reachable.length === 0) {
      return { ok: false, reason: "gap", stops, gapFromKm: r1(pos), gapToKm: r1(reach), compatibleStations: candidates.length };
    }
    // Prefer going far, then fast (DC), bookable and reported free; penalise detours.
    const score = (s: RouteStation) => {
      const p = stationPowerKw(s, input.vehicleMaxDcKw, input.vehicleMaxAcKw) ?? 0;
      return s.along_km + (p >= DC_MIN_KW ? 25 : 0) + (s.is_bookable ? 8 : 0) + ((s.live_available_count ?? 0) > 0 ? 8 : 0) - s.detour_km * 3;
    };
    const best = reachable.reduce((a, b) => (score(b) > score(a) ? b : a));
    const arrive = soc - pctFor(best.along_km - pos + best.detour_km);
    const needToFinish = reserve + pctFor(input.distanceKm - best.along_km + best.detour_km) + 3;
    const depart = Math.min(100, Math.max(arrive + 5, Math.min(chargeTo, needToFinish)));
    const energy = ((depart - arrive) / 100) * input.batteryKwh;
    const power = stationPowerKw(best, input.vehicleMaxDcKw, input.vehicleMaxAcKw);
    stops.push({
      station: best,
      arriveSocPct: r1(arrive),
      departSocPct: r1(depart),
      energyKwh: r1(energy),
      powerKw: power,
      chargeMinutes: power ? Math.round((energy / (power * 0.8)) * 60) : null,
      legKm: r1(best.along_km - pos + best.detour_km),
    });
    pos = best.along_km;
    soc = depart - pctFor(best.detour_km);
  }
  return { ok: false, reason: "gap", stops, gapFromKm: r1(pos), gapToKm: r1(pos), compatibleStations: candidates.length };
}

/** Thins a long polyline to at most `max` points (keeps the ends) so it can be sent to the database. */
export function thin(coords: [number, number][], max = 400): [number, number][] {
  if (coords.length <= max) return coords;
  const step = (coords.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * step)]);
}

/** Great-circle distance in km. */
export function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Parses "lat, lng" typed by the user. */
export function parseLatLng(s: string): [number, number] | null {
  const m = s.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
}
