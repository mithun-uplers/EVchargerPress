import "server-only";
import { createClient } from "@/lib/supabase/server";
import { haversineKm, parseLatLng, thin, type RouteStation } from "@/lib/route-plan";

/**
 * Geocoding and routing use OpenStreetMap services by default (Nominatim + OSRM). Both are
 * configurable: set GEOCODER_URL / ROUTING_URL to a self-hosted or commercial endpoint before
 * real traffic — the public demo servers are rate-limited and not meant for production.
 */
const GEOCODER = process.env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org";
const ROUTER = process.env.ROUTING_URL ?? "https://router.project-osrm.org";
const UA = process.env.OSM_USER_AGENT ?? "EVChargePress/0.1 (route planner)";

export type Place = { label: string; lngLat: [number, number] };
export type RouteGeometry = { coordinates: [number, number][]; distanceKm: number; durationMin: number | null; source: "osrm" | "straight_line" };

export async function geocode(q: string): Promise<Place | null> {
  const typed = parseLatLng(q);
  if (typed) return { label: `${typed[1].toFixed(4)}, ${typed[0].toFixed(4)}`, lngLat: typed };
  if (q.trim().length < 3) return null;
  const url = `${GEOCODER}/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(q.trim().slice(0, 120))}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, next: { revalidate: 86_400 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    return hit ? { label: hit.display_name.split(",").slice(0, 3).join(","), lngLat: [Number(hit.lon), Number(hit.lat)] } : null;
  } catch {
    return null;
  }
}

/** Driving route from OSRM; if the service is unreachable, a straight line clearly marked as such. */
export async function drivingRoute(from: [number, number], to: [number, number]): Promise<RouteGeometry> {
  const url = `${ROUTER}/route/v1/driving/${from.join(",")};${to.join(",")}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const body = (await res.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
      const r = body.routes?.[0];
      if (r) return { coordinates: r.geometry.coordinates, distanceKm: r.distance / 1000, durationMin: Math.round(r.duration / 60), source: "osrm" };
    }
  } catch {
    /* fall through */
  }
  return { coordinates: [from, to], distanceKm: haversineKm(from, to), durationMin: null, source: "straight_line" };
}

export async function stationsAlongRoute(coords: [number, number][], bufferKm = 5): Promise<RouteStation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stations_along_route", {
    p_route: { type: "LineString", coordinates: thin(coords, 400) },
    p_buffer_km: bufferKm,
    p_limit: 300,
  });
  if (error) throw new Error(`stations_along_route failed: ${error.message}`);
  return (data ?? []) as RouteStation[];
}
