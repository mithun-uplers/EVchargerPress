import type { NextRequest } from "next/server";
import { UUID, fail, handle, ok } from "@/server/http";
import { getEvseLive } from "@/server/live";

// GET /api/v1/stations/{id}/live — live status per charging point. Only fresh values (≤ 15 min) count as live.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/v1/stations/[id]/live">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(404, "not_found", "Station not found.");
  try {
    return ok(await getEvseLive(id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handle(e);
  }
}
