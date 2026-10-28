import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BookingRow, BookingStatus, BookingTab, Slot } from "@/lib/booking-types";

/**
 * Booking service. Every rule (hours, durations, buffers, overlap, idempotency,
 * cancellation fees, status transitions) is enforced inside Postgres
 * (supabase/migrations/20261028000001_reservation_engine.sql). This layer only
 * calls those functions as the signed-in user and maps their errors.
 */

const ERRORS: Record<string, { status: number; code: string }> = {
  EVB01: { status: 401, code: "not_authenticated" },
  EVB02: { status: 404, code: "not_found" },
  EVB03: { status: 422, code: "not_bookable" },
  EVB04: { status: 422, code: "invalid_duration" },
  EVB05: { status: 422, code: "invalid_start" },
  EVB06: { status: 422, code: "outside_hours" },
  EVB07: { status: 409, code: "slot_unavailable" },
  EVB08: { status: 409, code: "idempotency_mismatch" },
  EVB09: { status: 422, code: "too_many_active" },
  EVB10: { status: 409, code: "booking_immutable" },
  EVB11: { status: 409, code: "invalid_transition" },
  EVB12: { status: 409, code: "hold_expired" },
  EVB13: { status: 422, code: "not_cancellable" },
  EVB14: { status: 422, code: "no_tariff" },
  EVB15: { status: 400, code: "invalid_request" },
  EVB16: { status: 422, code: "check_in_window" },
  EVB17: { status: 422, code: "incompatible_vehicle" },
  EVB18: { status: 409, code: "vehicle_in_use" },
  EVB19: { status: 422, code: "charger_not_connected" },
  EVB20: { status: 409, code: "already_charging" },
  EVB21: { status: 409, code: "not_charging" },
  EVB22: { status: 409, code: "already_connected" },
  "42501": { status: 403, code: "forbidden" },
  "40P01": { status: 409, code: "busy" }, // deadlock (should not happen: writes are queued per charging point)
  "40001": { status: 409, code: "busy" }, // serialization failure
  "22P02": { status: 400, code: "invalid_request" },
  "22007": { status: 400, code: "invalid_request" },
  "22008": { status: 400, code: "invalid_request" },
};

export class BookingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type PgError = { code?: string; message?: string; details?: string | null };

function toBookingError(e: PgError): BookingError {
  const known = e.code ? ERRORS[e.code] : undefined;
  if (known) {
    const message =
      e.code?.startsWith("EVB") && e.details
        ? e.details
        : known.status === 403
          ? "You don't have permission to do that."
          : known.code === "busy"
            ? "Lots of people are booking right now. Please try again."
            : "The request is not valid.";
    return new BookingError(known.code, known.status, message);
  }
  console.error("Unexpected booking error", e.code, e.message);
  return new BookingError("internal_error", 500, "Something went wrong. Please try again.");
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toBookingError(error);
  return data as T;
}

const BOOKING_COLUMNS =
  "id,reference,status,period,hold_expires_at,price_snapshot,currency,reservation_fee_minor,estimated_total_minor," +
  "cancellation_fee_minor,confirmed_at,checked_in_at,cancelled_at,cancel_reason,created_at," +
  "station:stations(id,name,address,city,city_is_approx,time_zone),evse:evses(id,label,max_power_kw,charge_point_id),vehicle:vehicles(id,make,model,nickname)";

export async function getAvailability(stationId: string, date: string, durationMin: number): Promise<Slot[]> {
  return rpc<Slot[]>("get_availability", { p_station_id: stationId, p_date: date, p_duration_min: durationMin });
}

export async function quote(evseId: string, startAt: string, durationMin: number) {
  return rpc<Record<string, unknown>>("quote_booking", { p_evse_id: evseId, p_start: startAt, p_duration_min: durationMin });
}

export async function createBooking(input: {
  evseId: string;
  startAt: string;
  durationMin: number;
  idempotencyKey: string;
  vehicleId?: string | null;
}) {
  return rpc<{ id: string; reference: string; status: BookingStatus }>("book_slot", {
    p_evse_id: input.evseId,
    p_vehicle_id: input.vehicleId ?? null,
    p_start: input.startAt,
    p_duration_min: input.durationMin,
    p_idempotency_key: input.idempotencyKey,
  });
}

/** Charging points at a station that the vehicle can plug into, with the power it can draw. */
export async function compatibleEvses(vehicleId: string, stationId: string) {
  return rpc<{ evse_id: string; effective_power_kw: number | null }[]>("compatible_evses", {
    p_vehicle_id: vehicleId,
    p_station_id: stationId,
  });
}

export async function idForReference(reference: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bookings").select("id").eq("reference", reference).maybeSingle();
  if (error) throw toBookingError(error);
  if (!data) throw new BookingError("not_found", 404, "Booking not found.");
  return data.id as string;
}

export async function confirmBooking(reference: string) {
  return rpc<{ status: BookingStatus }>("confirm_booking", { p_booking_id: await idForReference(reference) });
}

export async function cancelBooking(reference: string, reason?: string) {
  return rpc<{ status: BookingStatus; cancellation_fee_minor: number }>("cancel_booking", {
    p_booking_id: await idForReference(reference),
    p_reason: reason ?? null,
  });
}

export async function checkInBooking(reference: string) {
  return rpc<{ status: BookingStatus }>("check_in_booking", { p_booking_id: await idForReference(reference) });
}

export async function getBooking(reference: string): Promise<{ booking: BookingRow; events: BookingEvent[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bookings").select(BOOKING_COLUMNS).eq("reference", reference).maybeSingle();
  if (error) throw toBookingError(error);
  if (!data) return null;
  const booking = data as unknown as BookingRow;
  const { data: ev } = await supabase
    .from("booking_events")
    .select("id,from_status,to_status,reason,created_at")
    .eq("booking_id", booking.id)
    .order("id");
  return { booking, events: (ev ?? []) as BookingEvent[] };
}

export type BookingEvent = { id: number; from_status: string | null; to_status: string; reason: string | null; created_at: string };

const TAB_STATUSES: Record<BookingTab, BookingStatus[]> = {
  upcoming: ["pending", "confirmed", "checked_in"],
  completed: ["completed"],
  cancelled: ["cancelled"],
  expired: ["expired"],
  no_show: ["no_show"],
};

export async function listBookings(tab: BookingTab, limit = 50): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .in("status", TAB_STATUSES[tab])
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw toBookingError(error);
  return (data ?? []) as unknown as BookingRow[];
}
