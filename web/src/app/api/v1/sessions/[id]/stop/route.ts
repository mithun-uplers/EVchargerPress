import type { NextRequest } from "next/server";
import { UUID, fail, handle, ok, sameOrigin } from "@/server/http";
import { stopCharging } from "@/server/live";

// POST /api/v1/sessions/{id}/stop — asks the charger to stop. Safe to repeat.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/v1/sessions/[id]/stop">) {
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-site requests are not allowed.");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(404, "not_found", "Session not found.");
  try {
    return ok(await stopCharging(id), { status: 202 });
  } catch (e) {
    return handle(e);
  }
}
