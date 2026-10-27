import type { NextRequest } from "next/server";
import { cancelBooking } from "@/server/bookings";
import { REFERENCE, fail, handle, ok, readJson, sameOrigin } from "@/server/http";

// POST /api/v1/bookings/{reference}/cancel — safe to repeat: a second call returns the same result.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/v1/bookings/[ref]/cancel">) {
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-site requests are not allowed.");
  const { ref } = await ctx.params;
  if (!REFERENCE.test(ref)) return fail(404, "not_found", "Booking not found.");
  try {
    const body = await readJson(req);
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 300) : undefined;
    return ok(await cancelBooking(ref, reason));
  } catch (e) {
    return handle(e);
  }
}
