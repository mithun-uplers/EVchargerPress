import { NextResponse, type NextRequest } from "next/server";
import { IDENTITY, parseBasicAuth, parseFrames } from "@/lib/ocpp";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * POST /api/integrations/ocpp/{chargeBoxIdentity}
 * Body: one OCPP-J frame, or an array of up to 20 frames. Auth: HTTP Basic (identity:secret).
 * Reply: { replies: [...] } with one OCPP-J reply per CALL (CALLRESULT/CALLERROR answers to our commands get null).
 * Used by the WebSocket gateway in tools/ocpp-gateway; chargers never call this directly.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/integrations/ocpp/[identity]">) {
  const { identity } = await ctx.params;
  if (!IDENTITY.test(identity)) return NextResponse.json({ error: "unknown_charge_point" }, { status: 404 });
  const secret = parseBasicAuth(req.headers.get("authorization"), identity);
  if (!secret) return unauthorized();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const frames = parseFrames(body);
  if (!frames) return NextResponse.json({ error: "invalid_frame" }, { status: 400 });

  const supabase = createAnonClient();
  const replies: unknown[] = [];
  for (const frame of frames) {
    const { data, error } = await supabase.rpc("ocpp_ingest", { p_identity: identity, p_secret: secret, p_frame: frame });
    if (error?.code === "28000") return unauthorized();
    if (error) {
      // Malformed payloads get an OCPP CALLERROR so the charger can move on.
      replies.push(frame[0] === 2 ? [4, frame[1], error.code === "22023" ? "FormationViolation" : "InternalError", "Rejected", {}] : null);
      continue;
    }
    replies.push(data);
  }
  return NextResponse.json({ replies }, { headers: { "Cache-Control": "no-store" } });
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Basic realm="ocpp"' } });
}
