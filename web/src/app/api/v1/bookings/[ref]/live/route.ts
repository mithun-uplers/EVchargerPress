import type { NextRequest } from "next/server";
import { idForReference } from "@/server/bookings";
import { REFERENCE, fail, handle, ok } from "@/server/http";
import { liveForBooking } from "@/server/live";

// GET /api/v1/bookings/{reference}/live — the booking's charging session as reported by the charger (polled).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/v1/bookings/[ref]/live">) {
  const { ref } = await ctx.params;
  if (!REFERENCE.test(ref)) return fail(404, "not_found", "Booking not found.");
  try {
    return ok(await liveForBooking(await idForReference(ref)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handle(e);
  }
}
