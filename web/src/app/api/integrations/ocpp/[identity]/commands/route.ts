import { NextResponse, type NextRequest } from "next/server";
import { IDENTITY, parseBasicAuth } from "@/lib/ocpp";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * GET /api/integrations/ocpp/{chargeBoxIdentity}/commands
 * Returns pending CSMS→charger calls as OCPP-J CALL frames (RemoteStartTransaction, RemoteStopTransaction)
 * and marks them sent. The gateway forwards them over the charger's WebSocket and posts the CALLRESULT back.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/integrations/ocpp/[identity]/commands">) {
  const { identity } = await ctx.params;
  if (!IDENTITY.test(identity)) return NextResponse.json({ error: "unknown_charge_point" }, { status: 404 });
  const secret = parseBasicAuth(req.headers.get("authorization"), identity);
  if (!secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await createAnonClient().rpc("ocpp_poll_commands", { p_identity: identity, p_secret: secret });
  if (error?.code === "28000") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (error) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  return NextResponse.json({ commands: data }, { headers: { "Cache-Control": "no-store" } });
}
