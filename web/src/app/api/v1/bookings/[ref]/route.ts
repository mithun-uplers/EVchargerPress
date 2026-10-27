import type { NextRequest } from "next/server";
import { getBooking } from "@/server/bookings";
import { REFERENCE, fail, handle, ok } from "@/server/http";

// GET /api/v1/bookings/{reference} — own booking with its status history. Others' bookings return 404.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/v1/bookings/[ref]">) {
  const { ref } = await ctx.params;
  if (!REFERENCE.test(ref)) return fail(404, "not_found", "Booking not found.");
  try {
    const found = await getBooking(ref);
    if (!found) return fail(404, "not_found", "Booking not found.");
    return ok(found, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handle(e);
  }
}
