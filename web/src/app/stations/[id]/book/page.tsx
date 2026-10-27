import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SlotPicker } from "@/components/booking/SlotPicker";
import { localDate, formatLocal, zoneLabel } from "@/lib/format";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { BookingError, getAvailability } from "@/server/bookings";

export const metadata: Metadata = { title: "Book a charging slot" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function BookPage({ params, searchParams }: PageProps<"/stations/[id]/book">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: station }, { data: rules }, { data: evses }, user] = await Promise.all([
    supabase.from("stations").select("id,name,address,city,time_zone").eq("id", id).maybeSingle(),
    supabase.from("booking_rules").select("*").eq("station_id", id).maybeSingle(),
    supabase.from("evses").select("id,label,max_power_kw,is_bookable,is_active,connectors(type)").eq("station_id", id).order("label"),
    getCurrentUser(),
  ]);
  if (!station) notFound();

  const bookableEvses = (evses ?? []).filter((e) => e.is_bookable && e.is_active);
  if (!rules || bookableEvses.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <h1 className="text-xl font-semibold">{station.name} doesn’t take bookings</h1>
        <p className="mt-2 text-sm text-zinc-500">You can still check the station details and drivers’ reports.</p>
        <Link href={`/stations/${id}`} className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">Back to station</Link>
      </div>
    );
  }

  const tz = station.time_zone as string;
  const days = Array.from({ length: Math.min(rules.max_advance_days + 1, 8) }, (_, i) => localDate(tz, new Date(), i));
  const date = typeof sp.date === "string" && days.includes(sp.date) ? sp.date : days[0];
  const durations: number[] = [];
  for (let m = rules.min_duration_min; m <= rules.max_duration_min; m += rules.slot_step_min) durations.push(m);
  const requested = Number(sp.duration);
  const duration = durations.includes(requested) ? requested : durations.includes(60) ? 60 : durations[0];

  let slots: Awaited<ReturnType<typeof getAvailability>> = [];
  let loadError: string | null = null;
  try {
    slots = await getAvailability(id, date, duration);
  } catch (e) {
    loadError = e instanceof BookingError ? e.message : "Couldn’t load availability.";
  }

  const evseInfo = bookableEvses.map((e) => ({
    id: e.id as string,
    label: e.label as string,
    max_power_kw: e.max_power_kw as number | null,
    connectors: [...new Set(((e.connectors ?? []) as { type: string }[]).map((c) => c.type))],
  }));
  const back = `/stations/${id}/book?date=${date}&duration=${duration}`;
  const fmtDuration = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

  return (
    <div className="space-y-6">
      <Link href={`/stations/${id}`} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">← {station.name}</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Book a charging slot</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Times are in the station’s local time ({zoneLabel(tz)}). A slot is held for {rules.hold_minutes} minutes while you review it.
        </p>
      </div>

      <form className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-end dark:border-zinc-800 dark:bg-zinc-900" action={`/stations/${id}/book`}>
        <fieldset className="min-w-0 flex-1">
          <legend className="text-sm font-medium">Day</legend>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => (
              <label key={d} className="cursor-pointer">
                <input type="radio" name="date" value={d} defaultChecked={d === date} className="peer sr-only" />
                <span className="block min-w-16 rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm peer-checked:border-emerald-600 peer-checked:bg-emerald-50 peer-checked:font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-emerald-600 dark:border-zinc-700 dark:peer-checked:bg-emerald-500/10">
                  {formatLocal(`${d}T12:00:00Z`, "UTC", { weekday: "short" })}
                  <span className="block text-xs text-zinc-500">{formatLocal(`${d}T12:00:00Z`, "UTC", { day: "numeric", month: "short" })}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-sm font-medium">
          Duration
          <select name="duration" defaultValue={duration} className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm sm:w-36 dark:border-zinc-700 dark:bg-zinc-950">
            {durations.map((m) => (
              <option key={m} value={m}>{fmtDuration(m)}</option>
            ))}
          </select>
        </label>
        <button className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">Show slots</button>
      </form>

      {loadError ? (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{loadError}</p>
      ) : (
        <SlotPicker
          stationId={id}
          timeZone={tz}
          durationMin={duration}
          slots={slots}
          evses={evseInfo}
          back={back}
          signedIn={!!user}
        />
      )}

      <p className="text-xs text-zinc-500">
        Free cancellation until {rules.free_cancel_until_min} minutes before the start; after that the reservation fee applies.
        A {rules.buffer_min}-minute changeover is kept free after each booking. A reservation guarantees the time slot in our system,
        not that the charger is working — check drivers’ recent reports on the station page.
      </p>
    </div>
  );
}
