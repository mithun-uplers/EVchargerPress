import "server-only";
import type { EvseLive, LiveSessionData, StartState } from "@/lib/live";
import { createClient } from "@/lib/supabase/server";
import { rpc } from "@/server/bookings";

export async function getEvseLive(stationId: string): Promise<EvseLive[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("evse_live_status").select("*").eq("station_id", stationId).order("label");
  return (data ?? []) as EvseLive[];
}

export const liveSession = (sessionId: string) => rpc<LiveSessionData>("live_session", { p_session_id: sessionId });

export const startCharging = (bookingId: string) => rpc<{ id: string; status: string }>("start_charging", { p_booking_id: bookingId });
export const stopCharging = (sessionId: string) => rpc<{ id: string; status: string }>("stop_charging", { p_session_id: sessionId });

/** The latest session for a booking (live or finished) plus the state of a pending remote start. */
export async function liveForBooking(bookingId: string): Promise<{ live: LiveSessionData | null; start: StartState }> {
  const supabase = await createClient();
  const [{ data: ses }, { data: cmd }] = await Promise.all([
    supabase.from("charging_sessions").select("id").eq("booking_id", bookingId).neq("source", "manual")
      .order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("charger_commands").select("status,created_at,completed_at").eq("booking_id", bookingId)
      .eq("action", "RemoteStartTransaction").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const live = ses ? await liveSession(ses.id) : null;
  let start: StartState = { state: "none" };
  if (cmd && (cmd.status === "pending" || cmd.status === "sent")) start = { state: "waiting", since: cmd.created_at };
  else if (cmd && (cmd.status === "rejected" || cmd.status === "expired") && !live) start = { state: cmd.status, at: cmd.completed_at ?? cmd.created_at };
  return { live, start };
}

/** The signed-in driver's session that is charging right now, if any (for the Home banner). */
export async function activeSession() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("charging_sessions")
    .select("id,energy_kwh,last_power_kw,last_soc_percent,is_simulated,booking:bookings(reference),station:stations(name)")
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as unknown as {
    id: string; energy_kwh: number | null; last_power_kw: number | null; last_soc_percent: number | null; is_simulated: boolean;
    booking: { reference: string } | null; station: { name: string } | null;
  } | null;
}
