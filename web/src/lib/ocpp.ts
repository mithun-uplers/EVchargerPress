/**
 * OCPP 1.6J helpers shared by the HTTP gateway endpoint and tests (no I/O).
 * Charge points authenticate with HTTP Basic auth (OCPP security profile 1): user = chargeBoxIdentity.
 */

export const IDENTITY = /^[A-Za-z0-9._-]{3,48}$/;
export const ACTIONS = ["BootNotification", "Heartbeat", "StatusNotification", "Authorize", "StartTransaction", "MeterValues", "StopTransaction"] as const;
export type OcppFrame = [2, string, string, Record<string, unknown>] | [3, string, Record<string, unknown>] | [4, string, string, string, Record<string, unknown>];

export function parseBasicAuth(header: string | null, identity: string): string | null {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return null;
  }
  const i = decoded.indexOf(":");
  if (i < 0 || decoded.slice(0, i) !== identity) return null;
  const secret = decoded.slice(i + 1);
  return secret.length >= 16 && secret.length <= 128 ? secret : null;
}

/** Structural check before the frame reaches the database (which validates payloads). */
export function isFrame(f: unknown): f is OcppFrame {
  if (!Array.isArray(f) || typeof f[1] !== "string" || f[1].length === 0 || f[1].length > 36) return false;
  if (f[0] === 2) return f.length === 4 && typeof f[2] === "string" && f[2].length <= 40 && isObject(f[3]);
  if (f[0] === 3) return f.length === 3 && isObject(f[2]);
  if (f[0] === 4) return f.length === 5 && typeof f[2] === "string" && typeof f[3] === "string";
  return false;
}
const isObject = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);

/** Accepts one frame or a batch of up to 20 (a gateway may buffer while offline). */
export function parseFrames(body: unknown): OcppFrame[] | null {
  const frames = Array.isArray(body) && Array.isArray(body[0]) ? body : [body];
  if (frames.length === 0 || frames.length > 20) return null;
  return frames.every(isFrame) ? (frames as OcppFrame[]) : null;
}
