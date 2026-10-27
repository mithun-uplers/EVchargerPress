import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { BookingError } from "@/server/bookings";
export { readJson } from "@/lib/booking-validation";

/** Consistent JSON envelope for /api/v1. */
export function ok<T>(data: T, init: ResponseInit = {}) {
  return NextResponse.json({ data }, init);
}

export function fail(status: number, code: string, message: string, fields?: Record<string, string[]>) {
  return NextResponse.json(
    { error: { code, message, ...(fields ? { fields } : {}), request_id: crypto.randomUUID() } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Maps thrown errors to the envelope; unknown errors become 500 without leaking details. */
export function handle(err: unknown) {
  if (err instanceof BookingError) return fail(err.status, err.code, err.message);
  console.error(err);
  return fail(500, "internal_error", "Something went wrong. Please try again.");
}

/** CSRF defence for cookie-authenticated writes: the Origin must match this site. */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export { DATE, REFERENCE, UUID, parseWindow } from "@/lib/booking-validation";
