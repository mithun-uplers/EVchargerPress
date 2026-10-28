import type { NextRequest } from "next/server";
import { idForReference } from "@/server/bookings";
import { REFERENCE, fail, handle, ok, sameOrigin } from "@/server/http";
import { startCharging } from "@/server/live";

// POST /api/v1/bookings/{reference}/start-charging — asks the connected charger to start (checks in if needed). Safe to repeat.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/v1/bookings/[ref]/start-charging">) {
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-site requests are not allowed.");
  const { ref } = await ctx.params;
  if (!REFERENCE.test(ref)) return fail(404, "not_found", "Booking not found.");
  try {
    return ok(await startCharging(await idForReference(ref)), { status: 202 });
  } catch (e) {
    return handle(e);
  }
}
