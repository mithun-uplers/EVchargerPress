/** Formats integer minor units (paise, cents) as currency. */
export function formatMoney(minor: number, currency: string, locale = "en-IN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(minor / 100);
}

/** Formats an instant in the station's time zone, e.g. "Tue 2 Mar, 10:00". */
export function formatLocal(
  value: Date | string,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
) {
  return new Intl.DateTimeFormat("en-IN", { timeZone, ...opts }).format(new Date(value));
}

export const formatTime = (value: Date | string, timeZone: string) =>
  formatLocal(value, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Today's date (YYYY-MM-DD) in a time zone. */
export function localDate(timeZone: string, base = new Date(), addDays = 0) {
  const d = new Date(base.getTime() + addDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Short zone label such as "IST" or "GMT+5:30". */
export function zoneLabel(timeZone: string, at = new Date()) {
  return new Intl.DateTimeFormat("en-IN", { timeZone, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
