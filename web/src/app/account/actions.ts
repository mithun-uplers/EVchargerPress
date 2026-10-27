"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { CONNECTOR_TYPES } from "@/lib/types";

export type FormState = { error?: string; ok?: string } | null;

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VEHICLE_TYPES = ["car", "motorcycle", "scooter", "bicycle", "other"];

/** Optional positive number within bounds; "" → null; invalid → NaN. */
function num(v: FormDataEntryValue | null, max: number) {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= max ? n : NaN;
}

/** Parses a datetime-local value ("2026-10-28T10:00") using the browser's offset (minutes, as getTimezoneOffset()). */
function parseLocalDateTime(value: string, offsetRaw: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return new Date(NaN);
  const offset = Number(offsetRaw);
  const asUtc = Date.parse(`${value}Z`);
  return new Date(asUtc + (Number.isFinite(offset) && Math.abs(offset) <= 840 ? offset : 0) * 60_000);
}

async function requireUser(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

function dbError(e: { code?: string; message?: string; details?: string | null } | null) {
  if (!e) return null;
  if (e.code?.startsWith("EVB") && e.details) return e.details;
  if (e.code === "23514") return "Some values are outside the allowed range.";
  if (e.code === "42501") return "You don’t have permission to do that.";
  console.error("account action error", e.code, e.message);
  return "Something went wrong. Please try again.";
}

/* ---------- Profile ---------- */

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/profile");
  const name = str(formData.get("display_name")).slice(0, 60);
  const phone = str(formData.get("phone")).replace(/[\s()-]/g, "");
  if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) return { error: "Enter the phone number with country code, e.g. +91 98765 43210." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: name || null, phone: phone || null }).eq("id", user.id);
  if (error) return { error: dbError(error)! };
  revalidatePath("/profile");
  return { ok: "Profile saved." };
}

export async function savePreferences(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/profile");
  const preferred = str(formData.get("preferred_vehicle_id"));
  const unit = str(formData.get("distance_unit")) === "mi" ? "mi" : "km";
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      preferred_vehicle_id: UUID.test(preferred) ? preferred : null,
      distance_unit: unit,
      email_reminders: formData.get("email_reminders") === "on",
      share_location: formData.get("share_location") === "on",
    })
    .eq("id", user.id);
  if (error) return { error: dbError(error)! };
  revalidatePath("/profile");
  return { ok: "Preferences saved." };
}

export async function requestDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser("/profile");
  if (str(formData.get("confirm")) !== "DELETE") return { error: "Type DELETE to confirm." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return { error: dbError(error)! };
  revalidatePath("/profile");
  return { ok: "Request received. Your account and personal data will be removed within 30 days; bookings and payments are kept anonymised for accounting." };
}

/* ---------- Onboarding ---------- */

export async function completeOnboarding(formData: FormData) {
  const user = await requireUser("/onboarding");
  const supabase = await createClient();
  const name = str(formData.get("display_name")).slice(0, 60);
  const phone = str(formData.get("phone")).replace(/[\s()-]/g, "");
  const preferred = str(formData.get("preferred_vehicle_id"));
  await supabase
    .from("profiles")
    .update({
      ...(name ? { display_name: name } : {}),
      ...(phone && /^\+?[0-9]{8,15}$/.test(phone) ? { phone } : {}),
      ...(UUID.test(preferred) ? { preferred_vehicle_id: preferred } : {}),
      share_location: formData.get("share_location") === "on",
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

/* ---------- Vehicles ---------- */

export async function saveVehicle(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = str(formData.get("id"));
  const back = str(formData.get("back"));
  const user = await requireUser(id ? `/vehicles/${id}` : "/vehicles/new");

  const vehicle_type = str(formData.get("vehicle_type"));
  const make = str(formData.get("make")).slice(0, 60);
  const model = str(formData.get("model")).slice(0, 60);
  const yearRaw = str(formData.get("model_year"));
  const model_year = yearRaw ? Number(yearRaw) : null;
  const battery = num(formData.get("battery_capacity_kwh"), 300);
  const ac = num(formData.get("max_ac_kw"), 50);
  const dc = num(formData.get("max_dc_kw"), 1000);
  const types = formData.getAll("connector_types").map(String).filter((t) => (CONNECTOR_TYPES as readonly string[]).includes(t));

  if (!VEHICLE_TYPES.includes(vehicle_type)) return { error: "Choose the vehicle type." };
  if (!make || !model) return { error: "Make and model are required." };
  if (model_year !== null && !(Number.isInteger(model_year) && model_year >= 1990 && model_year <= 2100))
    return { error: "Model year must be between 1990 and 2100." };
  if ([battery, ac, dc].some((n) => Number.isNaN(n))) return { error: "Check the battery and power values (numbers only, leave blank if unknown)." };
  if (types.length === 0) return { error: "Select at least one connector type your vehicle can use, so we can match chargers." };

  const row = {
    vehicle_type,
    make,
    model,
    model_year,
    nickname: str(formData.get("nickname")).slice(0, 40) || null,
    registration_label: str(formData.get("registration_label")).slice(0, 20).toUpperCase() || null,
    battery_capacity_kwh: battery,
    max_ac_kw: ac,
    max_dc_kw: dc,
  };

  const supabase = await createClient();
  let vehicleId = id;
  if (id) {
    const { error } = await supabase.from("vehicles").update(row).eq("id", id);
    if (error) return { error: dbError(error)! };
  } else {
    const { data, error } = await supabase.from("vehicles").insert({ ...row, user_id: user.id }).select("id").single();
    if (error || !data) return { error: dbError(error) ?? "Could not save the vehicle." };
    vehicleId = data.id;
  }

  const powers = types.map((t) => num(formData.get(`power_${t}`), 1000));
  const { error: cErr } = await supabase.rpc("set_vehicle_connectors", {
    p_vehicle_id: vehicleId,
    p_types: types,
    p_powers: powers.map((p) => (p && !Number.isNaN(p) ? p : null)),
  });
  if (cErr) return { error: dbError(cErr)! };

  // First vehicle becomes the preferred one.
  if (!id) {
    const { data: prof } = await supabase.from("profiles").select("preferred_vehicle_id").eq("id", user.id).maybeSingle();
    if (!prof?.preferred_vehicle_id) await supabase.from("profiles").update({ preferred_vehicle_id: vehicleId }).eq("id", user.id);
  }

  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${vehicleId}`);
  if (back.startsWith("/") && !back.startsWith("//")) redirect(back.includes("?") ? `${back}&vehicle=${vehicleId}` : `${back}?vehicle=${vehicleId}`);
  redirect(`/vehicles/${vehicleId}`);
}

export async function removeVehicle(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = str(formData.get("id"));
  await requireUser("/vehicles");
  if (!UUID.test(id)) return { error: "Vehicle not found." };
  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: dbError(error)! };
  revalidatePath("/vehicles");
  redirect("/vehicles");
}

export async function setPreferredVehicle(formData: FormData) {
  const id = str(formData.get("id"));
  const user = await requireUser("/vehicles");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("profiles").update({ preferred_vehicle_id: id }).eq("id", user.id);
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${id}`);
}

export async function addBatteryReading(_prev: FormState, formData: FormData): Promise<FormState> {
  const vehicleId = str(formData.get("vehicle_id"));
  await requireUser(`/vehicles/${vehicleId}`);
  const socRaw = str(formData.get("soc_percent"));
  const odoRaw = str(formData.get("odometer_km"));
  const soc = socRaw ? Number(socRaw) : null;
  const odo = odoRaw ? Number(odoRaw) : null;
  if (soc === null && odo === null) return { error: "Enter a battery % or an odometer reading." };
  if (soc !== null && !(soc >= 0 && soc <= 100)) return { error: "Battery % must be between 0 and 100." };
  if (odo !== null && !(odo >= 0)) return { error: "Odometer must be zero or more." };
  const when = str(formData.get("recorded_at"));
  const recordedAt = when ? parseLocalDateTime(when, str(formData.get("tz_offset"))) : new Date();
  if (Number.isNaN(recordedAt.getTime()) || recordedAt.getTime() > Date.now() + 5 * 60_000) return { error: "Pick a time that isn’t in the future." };
  const supabase = await createClient();
  const { error } = await supabase.from("battery_readings").insert({
    vehicle_id: vehicleId,
    soc_percent: soc,
    odometer_km: odo,
    recorded_at: recordedAt.toISOString(),
    notes: str(formData.get("notes")).slice(0, 300) || null,
    source: "manual",
  });
  if (error) return { error: dbError(error)! };
  revalidatePath(`/vehicles/${vehicleId}`);
  return { ok: "Reading saved." };
}

/* ---------- Charging history ---------- */

export async function addManualSession(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/history");
  const start = parseLocalDateTime(str(formData.get("started_at")), str(formData.get("tz_offset")));
  const minutes = Number(str(formData.get("duration_min")));
  const energy = str(formData.get("energy_kwh")) ? Number(str(formData.get("energy_kwh"))) : null;
  const cost = str(formData.get("total_cost")) ? Math.round(Number(str(formData.get("total_cost"))) * 100) : null;
  const bookingId = str(formData.get("booking_id"));
  const vehicleId = str(formData.get("vehicle_id"));
  if (Number.isNaN(start.getTime()) || start.getTime() > Date.now()) return { error: "Enter when charging started (not in the future)." };
  if (!(minutes > 0 && minutes <= 24 * 60)) return { error: "Duration must be between 1 minute and 24 hours." };
  if (energy !== null && !(energy >= 0 && energy <= 1000)) return { error: "Energy must be between 0 and 1000 kWh." };
  if (cost !== null && !(cost >= 0)) return { error: "Cost must be zero or more." };
  const supabase = await createClient();
  const { error } = await supabase.from("charging_sessions").insert({
    user_id: user.id,
    booking_id: UUID.test(bookingId) ? bookingId : null,
    vehicle_id: UUID.test(vehicleId) ? vehicleId : null,
    started_at: start.toISOString(),
    ended_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
    energy_kwh: energy,
    total_cost_minor: cost,
    currency: "INR",
    source: "manual",
    status: "completed",
    notes: str(formData.get("notes")).slice(0, 500) || null,
  });
  if (error) return { error: dbError(error)! };
  revalidatePath("/history");
  return { ok: "Session saved." };
}
