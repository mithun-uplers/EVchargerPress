import "server-only";
import { hasAnyValue } from "@/lib/smartcar-signals";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import { rpc } from "@/server/bookings";
import { readVehicle, smartcarMode, userVehicles } from "@/server/smartcar";

export type VehicleConnection = {
  id: string; vehicle_id: string; provider: "smartcar" | "simulator"; mode: "live" | "simulated";
  status: "pending" | "active" | "error" | "revoked"; provider_make: string | null; provider_model: string | null; provider_year: number | null;
  has_vehicle: boolean; last_synced_at: string | null; last_error: string | null; created_at: string;
};
export type Telemetry = {
  id: number; recorded_at: string; soc_percent: number | null; range_km: number | null; odometer_km: number | null;
  is_charging: boolean | null; is_plugged_in: boolean | null; charge_power_kw: number | null; charge_limit_percent: number | null;
  latitude: number | null; longitude: number | null; source: "smartcar" | "simulator"; is_simulated: boolean;
};

export async function connectionsFor(vehicleIds: string[]): Promise<Record<string, VehicleConnection>> {
  if (!vehicleIds.length) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("my_vehicle_connections").select("*").in("vehicle_id", vehicleIds).in("status", ["active", "error", "pending"]);
  const out: Record<string, VehicleConnection> = {};
  for (const c of (data ?? []) as VehicleConnection[]) if (c.status !== "pending" || !out[c.vehicle_id]) out[c.vehicle_id] = c;
  return out;
}

export async function telemetry(vehicleId: string, limit = 288): Promise<Telemetry[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("vehicle_telemetry").select("*").eq("vehicle_id", vehicleId).order("recorded_at", { ascending: false }).limit(limit);
  return (data ?? []) as Telemetry[];
}

export const startConnection = (vehicleId: string, provider: "smartcar" | "simulator") =>
  rpc<{ id: string; state_nonce: string | null; status: string }>("start_vehicle_connection", { p_vehicle_id: vehicleId, p_provider: provider, p_mode: provider === "smartcar" ? smartcarMode() : "simulated" });
export const completeConnection = (state: string, providerUserId: string) =>
  rpc<{ id: string; vehicle_id: string }>("complete_vehicle_connection", { p_state: state, p_provider_user_id: providerUserId });
export const disconnect = (connectionId: string) => rpc("disconnect_vehicle", { p_connection_id: connectionId });

/**
 * Pulls the latest Smartcar signals for one of the signed-in driver's connections and stores them
 * through the integration-key RPC. Returns a short error message instead of throwing.
 */
export async function syncSmartcar(connectionId: string): Promise<string | null> {
  const key = process.env.VEHICLE_INGEST_KEY;
  if (!key) return "Vehicle sync isn’t configured on the server (VEHICLE_INGEST_KEY).";
  const supabase = await createClient();
  const { data: c } = await supabase.from("vehicle_connections").select("id,provider,provider_user_id,provider_vehicle_id,status").eq("id", connectionId).maybeSingle();
  if (!c || c.provider !== "smartcar" || !c.provider_user_id || c.status === "revoked") return "Connection not found.";
  const anon = createAnonClient();
  try {
    let vehicle: { id: string; make: string | null; model: string | null; year: number | null } | null = null;
    let vid = c.provider_vehicle_id as string | null;
    if (!vid) {
      [vehicle] = await userVehicles(c.provider_user_id);
      if (!vehicle) return "Smartcar didn’t return a vehicle for this account yet. Try again in a minute.";
      vid = vehicle.id;
    }
    const reading = await readVehicle(vid, c.provider_user_id);
    const { error } = await anon.rpc("ingest_vehicle_telemetry", {
      p_key: key, p_connection_id: connectionId, p_reading: hasAnyValue(reading) ? reading : null, p_vehicle: vehicle,
    });
    if (error) throw new Error(error.message);
    return hasAnyValue(reading) ? null : "Connected, but the car didn’t report battery, odometer or location data.";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    await anon.rpc("report_vehicle_sync_error", { p_key: key, p_connection_id: connectionId, p_error: msg });
    return `Couldn’t reach Smartcar: ${msg}`;
  }
}
