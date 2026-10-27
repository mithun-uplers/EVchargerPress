import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CONNECTOR_TYPES } from "@/lib/types";

// GET /api/stations?bbox=west,south,east,north[&connector=CCS2]
// Returns a GeoJSON FeatureCollection of stations inside the map viewport.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parts = (sp.get("bbox") ?? "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: { code: "invalid_bbox", message: "bbox=west,south,east,north is required" } }, { status: 400 });
  }
  const [west, south, east, north] = parts;
  const connector = sp.get("connector") ?? "";

  const supabase = await createClient();
  let query = supabase
    .from("station_summaries")
    .select("id,name,lat,lng,address,city,city_is_approx,last_status,max_power_kw,connector_types,data_source")
    .gte("lat", Math.max(-90, south))
    .lte("lat", Math.min(90, north))
    .gte("lng", Math.max(-180, west))
    .lte("lng", Math.min(180, east))
    .limit(3000);
  if ((CONNECTOR_TYPES as readonly string[]).includes(connector)) query = query.contains("connector_types", [connector]);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: { code: "query_failed", message: "Could not load stations" } }, { status: 500 });
  }

  const features = (data ?? []).map((s) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
    properties: {
      id: s.id,
      name: s.name,
      place: [s.address, s.city ? (s.city_is_approx ? `near ${s.city}` : s.city) : null].filter(Boolean).join(", "),
      status: s.last_status ?? "",
      max_kw: Number(s.max_power_kw) || 0,
      connectors: (s.connector_types ?? []).join(", "),
      source: s.data_source,
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } },
  );
}
