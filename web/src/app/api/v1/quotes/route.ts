import type { NextRequest } from "next/server";
import { quote } from "@/server/bookings";
import { fail, handle, ok, parseWindow, readJson } from "@/server/http";

// POST /api/v1/quotes  { evse_id, start_at, duration_min } → server-side price breakdown (nothing is booked).
export async function POST(req: NextRequest) {
  const parsed = parseWindow(await readJson(req));
  if (!parsed.ok) return fail(400, "invalid_request", "Check the highlighted fields.", parsed.fields);
  try {
    return ok(await quote(parsed.value.evseId, parsed.value.startAt, parsed.value.durationMin));
  } catch (e) {
    return handle(e);
  }
}
