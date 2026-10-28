import "server-only";
import { extractSignals, toReading, type TelemetryReading } from "@/lib/smartcar-signals";

/**
 * Smartcar Vehicles API v3 (https://smartcar.com/docs).
 *   Connect:  https://connect.smartcar.com/oauth/authorize  → redirect with userId (+ state)
 *   Token:    POST https://iam.smartcar.com/oauth2/token (client credentials, 1 h)
 *   Data:     GET https://vehicle.api.smartcar.com/v3/vehicles/{id}/signals  (Bearer + sc-user-id)
 * Credentials are server-only env vars; nothing here reaches the browser.
 */
const CONNECT = "https://connect.smartcar.com/oauth/authorize";
const TOKEN = "https://iam.smartcar.com/oauth2/token";
const API = "https://vehicle.api.smartcar.com/v3";
export const SMARTCAR_SCOPES = ["read_vehicle_info", "read_battery", "read_charge", "read_odometer", "read_location"];

export const smartcarMode = (): "live" | "simulated" => (process.env.SMARTCAR_MODE === "live" ? "live" : "simulated");
export const smartcarConfigured = () => !!(process.env.SMARTCAR_CLIENT_ID && process.env.SMARTCAR_CLIENT_SECRET && process.env.VEHICLE_INGEST_KEY);

export function redirectUri(origin: string) {
  return process.env.SMARTCAR_REDIRECT_URI || `${origin}/api/vehicle-connect/smartcar/callback`;
}

export function connectUrl(opts: { state: string; origin: string; externalId: string }) {
  const p = new URLSearchParams({
    response_type: "code",
    application_id: process.env.SMARTCAR_CLIENT_ID!,
    redirect_uri: redirectUri(opts.origin),
    scope: SMARTCAR_SCOPES.join(" "),
    mode: smartcarMode(),
    state: opts.state,
    external_id: opts.externalId,
  });
  return `${CONNECT}?${p}`;
}

let cached: { token: string; until: number } | null = null;
async function appToken() {
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.SMARTCAR_CLIENT_ID!, client_secret: process.env.SMARTCAR_CLIENT_SECRET! }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Smartcar token request failed (${res.status})`);
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { token: body.access_token, until: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 120) * 1000 };
  return cached.token;
}

async function get(path: string, userId?: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await appToken()}`, ...(userId ? { "sc-user-id": userId } : {}) },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Smartcar ${path.split("?")[0]} failed (${res.status})`);
  return res.json();
}

export type SmartcarVehicle = { id: string; make: string | null; model: string | null; year: number | null };

/** Vehicles this Smartcar user connected (newest first). */
export async function userVehicles(userId: string): Promise<SmartcarVehicle[]> {
  const q = new URLSearchParams({ "filter[userId]": userId, "filter[vehicle.mode]": smartcarMode(), "page[size]": "10" });
  const body = (await get(`/connections?${q}`, userId)) as {
    data?: { attributes?: { vehicle?: { make?: string; model?: string; year?: number } }; relationships?: { vehicle?: { data?: { id?: string } } } }[];
  };
  return (body.data ?? [])
    .map((c) => ({ id: c.relationships?.vehicle?.data?.id ?? "", make: c.attributes?.vehicle?.make ?? null, model: c.attributes?.vehicle?.model ?? null, year: c.attributes?.vehicle?.year ?? null }))
    .filter((v) => v.id);
}

export async function readVehicle(vehicleId: string, userId: string): Promise<TelemetryReading> {
  return toReading(extractSignals(await get(`/vehicles/${encodeURIComponent(vehicleId)}/signals`, userId)));
}
