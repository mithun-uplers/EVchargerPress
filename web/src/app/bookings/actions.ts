"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { BookingError, cancelBooking, checkInBooking, confirmBooking, createBooking } from "@/server/bookings";

export type ActionState = { error?: string } | null;

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^EV-[A-Z0-9]{8}$/;

function message(e: unknown) {
  if (e instanceof BookingError) return e.message;
  console.error(e);
  return "Something went wrong. Please try again.";
}

/** Places a timed hold on a slot. The idempotency key comes from the form, so double-submits are safe. */
export async function holdSlot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const stationId = str(formData.get("station_id"));
  const evseId = str(formData.get("evse_id"));
  const startAt = str(formData.get("start_at"));
  const durationMin = Number(str(formData.get("duration_min")));
  const key = str(formData.get("idempotency_key"));
  const vehicleId = str(formData.get("vehicle_id"));
  const back = str(formData.get("back"));

  const user = await getCurrentUser();
  if (!user) {
    const next = back.startsWith("/stations/") ? back : `/stations/${stationId}/book`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!UUID.test(evseId) || Number.isNaN(Date.parse(startAt)) || !Number.isInteger(durationMin)) {
    return { error: "Pick a slot first." };
  }

  let reference: string;
  try {
    ({ reference } = await createBooking({
      evseId,
      startAt,
      durationMin,
      idempotencyKey: key,
      vehicleId: UUID.test(vehicleId) ? vehicleId : null,
    }));
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/bookings");
  redirect(`/bookings/${reference}`);
}

async function transition(formData: FormData, run: (ref: string) => Promise<unknown>): Promise<ActionState> {
  const reference = str(formData.get("reference"));
  if (!REF.test(reference)) return { error: "Booking not found." };
  try {
    await run(reference);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/bookings/${reference}`);
  revalidatePath("/bookings");
  return null;
}

export async function confirmAction(_prev: ActionState, formData: FormData) {
  return transition(formData, confirmBooking);
}

export async function cancelAction(_prev: ActionState, formData: FormData) {
  const reason = str(formData.get("reason")).slice(0, 300);
  return transition(formData, (ref) => cancelBooking(ref, reason || undefined));
}

export async function checkInAction(_prev: ActionState, formData: FormData) {
  return transition(formData, checkInBooking);
}
