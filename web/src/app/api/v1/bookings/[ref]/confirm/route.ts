import type { NextRequest } from "next/server";
import { confirmBooking } from "@/server/bookings";
import { REFERENCE, fail, handle, ok, sameOrigin } from "@/server/http";

// POST /api/v1/bookings/{reference}/confirm — safe to repeat: a second call returns the same result.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/v1/bookings/[ref]/confirm">) {
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-site requests are not allowed.");
  const { ref } = await ctx.params;
  if (!REFERENCE.test(ref)) return fail(404, "not_found", "Booking not found.");
  try {
    return ok(await confirmBooking(ref));
  } catch (e) {
    return handle(e);
  }
}
