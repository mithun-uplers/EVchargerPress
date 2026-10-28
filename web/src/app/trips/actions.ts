"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { efficiencyKwhPer100Km, toHistoryItems } from "@/lib/charging-stats";
import { getCurrentUser } from "@/lib/supabase/server";
import { BookingError } from "@/server/bookings";
import { listBatteryReadings, listSessions, listVehicles } from "@/server/account";
import { planTrip, tripPayload } from "@/server/trip-planner";
import { deleteTrip, saveTrip } from "@/server/trips";

const str = (v: FormDataEntryValue | null, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Re-plans on the server from the form's inputs (never trusts posted route data) and saves the trip with every station on the route. */
export async function saveTripAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/route");
  const p = { from: str(formData.get("from")), to: str(formData.get("to")), soc: str(formData.get("soc"), 6), reserve: str(formData.get("reserve"), 6), consumption: str(formData.get("consumption"), 6) };
  const vehicleId = str(formData.get("vehicle"), 40);
  const back = `/route?${new URLSearchParams({ ...p, vehicle: vehicleId })}`;
  const vehicles = await listVehicles();
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  let efficiency: number | null = null;
  if (vehicle) {
    const [readings, sessions] = await Promise.all([listBatteryReadings(vehicle.id), listSessions(500)]);
    const odo = readings.filter((r) => r.odometer_km !== null).map((r) => ({ recorded_at: r.recorded_at, odometer_km: Number(r.odometer_km) }));
    efficiency = efficiencyKwhPer100Km(odo, toHistoryItems(sessions).filter((i) => i.vehicleId === vehicle.id));
  }
  const res = await planTrip(p, vehicle, efficiency);
  if (!res.ok) redirect(`${back}&save_error=${encodeURIComponent(res.error)}`);
  const name = str(formData.get("name"), 80) || `${res.planned.result.fromLabel.split(",")[0]} → ${res.planned.result.toLabel.split(",")[0]}`;
  const { trip, stations } = tripPayload(res.planned, name, str(formData.get("notes"), 500));
  let id: string;
  try {
    ({ id } = await saveTrip(trip, stations));
  } catch (e) {
    redirect(`${back}&save_error=${encodeURIComponent(e instanceof BookingError ? e.message : "Couldn’t save the trip. Please try again.")}`);
  }
  revalidatePath("/trips");
  redirect(`/trips/${id}?saved=1`);
}

export async function deleteTripAction(formData: FormData) {
  const id = str(formData.get("id"), 40);
  if (UUID.test(id)) await deleteTrip(id);
  revalidatePath("/trips");
  redirect("/trips");
}
