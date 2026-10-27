/** Pure request validation shared by the /api/v1 routes (no server-only imports, so it is unit-testable). */
import type { NextRequest } from "next/server";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const REFERENCE = /^EV-[A-Z0-9]{8}$/;

export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type ParsedWindow =
  | { ok: true; value: { evseId: string; startAt: string; durationMin: number } }
  | { ok: false; fields: Record<string, string[]> };

/** Validates {evse_id, start_at, duration_min}. Returns field errors or the parsed values. */
export function parseWindow(body: Record<string, unknown> | null): ParsedWindow {
  const fields: Record<string, string[]> = {};
  const evseId = typeof body?.evse_id === "string" ? body.evse_id : "";
  const startAt = typeof body?.start_at === "string" ? body.start_at : "";
  const durationMin = typeof body?.duration_min === "number" ? body.duration_min : NaN;
  if (!UUID.test(evseId)) fields.evse_id = ["Must be a charging point id (UUID)."];
  if (!startAt || Number.isNaN(Date.parse(startAt)) || !/[zZ]|[+-]\d\d:?\d\d$/.test(startAt))
    fields.start_at = ["Must be an ISO 8601 timestamp with a time zone, e.g. 2027-03-02T04:30:00Z."];
  if (!Number.isInteger(durationMin) || durationMin <= 0 || durationMin > 720) fields.duration_min = ["Must be a whole number of minutes."];
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, value: { evseId, startAt, durationMin } };
}
