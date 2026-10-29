"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { supportsCloudConnect, vehicleNoun } from "@/lib/vehicle-types";
import { getVehicle } from "@/server/account";
import { BookingError } from "@/server/bookings";
import { connectUrl, smartcarConfigured } from "@/server/smartcar";
import { disconnect, startConnection, syncSmartcar } from "@/server/vehicle-connect";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const back = (id: string, q: Record<string, string>) => `/vehicles/${id}?${new URLSearchParams(q)}#connect`;
const msg = (e: unknown) => (e instanceof BookingError ? e.message : "Something went wrong. Please try again.");

export async function connectVehicleAction(formData: FormData) {
  const user = await getCurrentUser();
  const vehicleId = str(formData.get("vehicle_id"));
  if (!user) redirect(`/login?next=/vehicles/${vehicleId}`);
  if (!UUID.test(vehicleId)) redirect("/vehicles");
  const provider = str(formData.get("provider")) === "smartcar" ? "smartcar" : "simulator";
  if (provider === "smartcar" && !smartcarConfigured()) redirect(back(vehicleId, { connect_error: "Smartcar isn’t set up on this server yet." }));
  if (provider === "smartcar") {
    const vehicle = await getVehicle(vehicleId);
    if (!vehicle) redirect("/vehicles");
    if (!supportsCloudConnect(vehicle.vehicle_type))
      redirect(back(vehicleId, { connect_error: `Smartcar connects cars only, so it isn’t available for this ${vehicleNoun(vehicle.vehicle_type)}.` }));
  }
  let state: string | null = null;
  try {
    ({ state_nonce: state } = await startConnection(vehicleId, provider));
  } catch (e) {
    redirect(back(vehicleId, { connect_error: msg(e) }));
  }
  if (provider === "smartcar") {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    redirect(connectUrl({ state: state!, origin, externalId: user.id }));
  }
  revalidatePath(`/vehicles/${vehicleId}`);
  redirect(back(vehicleId, { connected: "simulator" }));
}

export async function disconnectVehicleAction(formData: FormData) {
  const id = str(formData.get("connection_id"));
  const vehicleId = str(formData.get("vehicle_id"));
  if (UUID.test(id)) {
    try {
      await disconnect(id);
    } catch (e) {
      redirect(back(vehicleId, { connect_error: msg(e) }));
    }
  }
  revalidatePath(`/vehicles/${vehicleId}`);
  redirect(back(vehicleId, { disconnected: "1" }));
}

export async function syncVehicleAction(formData: FormData) {
  const id = str(formData.get("connection_id"));
  const vehicleId = str(formData.get("vehicle_id"));
  const err = UUID.test(id) ? await syncSmartcar(id) : "Connection not found.";
  revalidatePath(`/vehicles/${vehicleId}`);
  redirect(back(vehicleId, err ? { connect_error: err } : { synced: "1" }));
}
