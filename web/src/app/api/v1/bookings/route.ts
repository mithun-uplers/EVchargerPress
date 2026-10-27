import type { NextRequest } from "next/server";
import { BOOKING_TABS, type BookingTab } from "@/lib/booking-types";
import { createBooking, listBookings } from "@/server/bookings";
import { UUID, fail, handle, ok, parseWindow, readJson, sameOrigin } from "@/server/http";

// GET /api/v1/bookings?tab=upcoming|completed|cancelled|expired|no_show  (signed-in user's own bookings)
export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get("tab") ?? "upcoming") as BookingTab;
  if (!BOOKING_TABS.includes(tab)) return fail(400, "invalid_request", "Unknown tab.", { tab: [`One of: ${BOOKING_TABS.join(", ")}`] });
  try {
    return ok(await listBookings(tab), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handle(e);
  }
}

// POST /api/v1/bookings  Idempotency-Key: <8–100 chars>  { evse_id, start_at, duration_min, vehicle_id? }
// Creates a timed hold (status "pending"); confirm it with POST /api/v1/bookings/{ref}/confirm.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-site requests are not allowed.");
  const key = req.headers.get("idempotency-key") ?? "";
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
    return fail(400, "invalid_request", "An Idempotency-Key header (8–100 letters, digits, - or _) is required.");
  const body = await readJson(req);
  const parsed = parseWindow(body);
  if (!parsed.ok) return fail(400, "invalid_request", "Check the highlighted fields.", parsed.fields);
  const vehicleId = body?.vehicle_id ?? null;
  if (vehicleId !== null && (typeof vehicleId !== "string" || !UUID.test(vehicleId)))
    return fail(400, "invalid_request", "Check the highlighted fields.", { vehicle_id: ["Must be one of your vehicle ids (UUID) or omitted."] });
  try {
    const booking = await createBooking({ ...parsed.value, idempotencyKey: key, vehicleId });
    return ok(booking, { status: 201, headers: { Location: `/api/v1/bookings/${booking.reference}` } });
  } catch (e) {
    return handle(e);
  }
}
