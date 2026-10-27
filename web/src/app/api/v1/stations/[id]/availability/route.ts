import type { NextRequest } from "next/server";
import { getAvailability } from "@/server/bookings";
import { DATE, UUID, fail, handle, ok } from "@/server/http";

// GET /api/v1/stations/{id}/availability?date=YYYY-MM-DD&duration_min=60
// `date` is in the station's local time zone. Public.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/v1/stations/[id]/availability">) {
  const { id } = await ctx.params;
  const date = req.nextUrl.searchParams.get("date") ?? "";
  const duration = Number(req.nextUrl.searchParams.get("duration_min"));
  if (!UUID.test(id)) return fail(404, "not_found", "Station not found.");
  const fields: Record<string, string[]> = {};
  if (!DATE.test(date)) fields.date = ["Use YYYY-MM-DD (station local date)."];
  if (!Number.isInteger(duration)) fields.duration_min = ["Must be a whole number of minutes."];
  if (Object.keys(fields).length) return fail(400, "invalid_request", "Check the highlighted fields.", fields);
  try {
    const slots = await getAvailability(id, date, duration);
    return ok(slots, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (e) {
    return handle(e);
  }
}
