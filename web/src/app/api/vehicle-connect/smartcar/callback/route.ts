import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { BookingError } from "@/server/bookings";
import { completeConnection, syncSmartcar } from "@/server/vehicle-connect";

// GET /api/vehicle-connect/smartcar/callback?userId=…&state=…  (Smartcar Connect redirect)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const to = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin));
  const user = await getCurrentUser();
  if (!user) return to(`/login?next=${encodeURIComponent("/vehicles")}`);
  const state = sp.get("state") ?? "";
  if (sp.get("error")) {
    const why = (sp.get("error_description") || sp.get("error") || "").slice(0, 120);
    return to(`/vehicles?${new URLSearchParams({ connect_error: `Smartcar: ${why || "connection cancelled"}` })}`);
  }
  if (!/^[0-9a-f]{36}$/.test(state)) return to(`/vehicles?${new URLSearchParams({ connect_error: "Invalid connection link." })}`);
  try {
    const c = await completeConnection(state, (sp.get("userId") ?? sp.get("user_id") ?? "").slice(0, 100));
    const err = await syncSmartcar(c.id);
    return to(`/vehicles/${c.vehicle_id}?${new URLSearchParams(err ? { connect_error: err } : { connected: "smartcar" })}#connect`);
  } catch (e) {
    return to(`/vehicles?${new URLSearchParams({ connect_error: e instanceof BookingError ? e.message : "Couldn’t finish connecting your car." })}`);
  }
}
