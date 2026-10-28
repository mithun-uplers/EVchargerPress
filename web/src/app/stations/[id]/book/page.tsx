import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SlotPicker } from "@/components/booking/SlotPicker";
import { localDate, formatLocal, zoneLabel } from "@/lib/format";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getProfile, listVehicles, vehicleLabel } from "@/server/account";
import { BookingError, compatibleEvses, getAvailability } from "@/server/bookings";

export const metadata: Metadata = { title: "Book a charging slot" };

const UUID = /^[0-9a-f-]{36}$/i;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800">
      <h2 id={`step-${n}`} className="flex items-center gap-3 font-semibold">
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-charge-400 text-sm font-bold text-zinc-900">{n}</span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

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
        <h1 className="text-xl font-semibold">{station.name} doesn’t take online bookings</h1>
        <p className="mt-2 text-sm text-zinc-500">You can still see its details and drivers’ reports.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link href={`/stations/${id}`} className="text-sm font-medium text-energy-700 hover:underline">Back to station</Link>
          <Link href="/?bookable=1" className="text-sm font-medium text-energy-700 hover:underline">Find bookable stations</Link>
        </div>
      </div>
    );
  }

  // ---- Step 1: vehicle ----
  const [vehicles, profile] = user ? await Promise.all([listVehicles(), getProfile(user.id)]) : [[], null];
  const requested = typeof sp.vehicle === "string" ? sp.vehicle : "";
  const vehicle =
    vehicles.find((v) => v.id === requested) ??
    vehicles.find((v) => v.id === profile?.preferred_vehicle_id) ??
    vehicles[0] ??
    null;

  const allEvseInfo = bookableEvses.map((e) => ({
    id: e.id as string,
    label: e.label as string,
    max_power_kw: e.max_power_kw as number | null,
    connectors: [...new Set(((e.connectors ?? []) as { type: string }[]).map((c) => c.type))],
  }));
  let evseInfo: (typeof allEvseInfo[number] & { effective_power_kw?: number | null })[] = allEvseInfo;
  let incompatible: typeof allEvseInfo = [];
  if (vehicle) {
    const compat = await compatibleEvses(vehicle.id, id).catch(() => []);
    const map = new Map(compat.map((c) => [c.evse_id, c.effective_power_kw]));
    evseInfo = allEvseInfo.filter((e) => map.has(e.id)).map((e) => ({ ...e, effective_power_kw: map.get(e.id) }));
    incompatible = allEvseInfo.filter((e) => !map.has(e.id));
  }

  // ---- Step 2: day + duration ----
  const tz = station.time_zone as string;
  const days = Array.from({ length: Math.min(rules.max_advance_days + 1, 8) }, (_, i) => localDate(tz, new Date(), i));
  const date = typeof sp.date === "string" && days.includes(sp.date) ? sp.date : days[0];
  const durations: number[] = [];
  for (let m = rules.min_duration_min; m <= rules.max_duration_min; m += rules.slot_step_min) durations.push(m);
  const reqDuration = Number(sp.duration);
  const duration = durations.includes(reqDuration) ? reqDuration : durations.includes(60) ? 60 : durations[0];

  let slots: Awaited<ReturnType<typeof getAvailability>> = [];
  let loadError: string | null = null;
  try {
    slots = await getAvailability(id, date, duration);
  } catch (e) {
    loadError = e instanceof BookingError ? e.message : "Couldn’t load availability.";
  }
  const allowed = new Set(evseInfo.map((e) => e.id));
  slots = slots.filter((s) => allowed.has(s.evse_id));

  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({ date, duration: String(duration), ...(vehicle ? { vehicle: vehicle.id } : {}), ...extra }).toString();
  const back = `/stations/${id}/book?${qs({})}`;
  const fmtDuration = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={`/stations/${id}`} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">← {station.name}</Link>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-energy-700 via-energy-600 to-energy-800 p-5 text-white shadow-md sm:p-6">
        <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 text-white/10">
          <path d="M115 10 45 115h50l-10 75 70-105h-50l10-75Z" fill="currentColor" />
        </svg>
        <p className="relative text-sm text-white/80">{station.name}</p>
        <h1 className="relative mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Book a charging slot</h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/80">
          Times are in the station’s local time ({zoneLabel(tz)}). Your slot is held for {rules.hold_minutes} minutes while you review the price.
        </p>
        <ol className="relative mt-4 flex flex-wrap gap-2 text-xs font-medium">
          {["Vehicle", "Day & duration", "Charger & time", "Review & confirm"].map((t, i) => (
            <li key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ring-1 ring-inset ring-white/20">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-charge-400 text-[10px] font-bold text-zinc-900">{i + 1}</span>{t}
            </li>
          ))}
        </ol>
      </section>

      <Step n={1} title="Your vehicle">
        {!user ? (
          <p className="text-sm">
            <Link href={`/login?next=${encodeURIComponent(back)}`} className="font-medium text-energy-700 hover:underline">Sign in</Link> to pick your
            vehicle — we’ll only show charging points it can plug into. You can browse times below meanwhile.
          </p>
        ) : vehicles.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-charge-50 p-3 text-sm text-zinc-800 dark:bg-charge-500/10 dark:text-charge-200">
            <span>Add your vehicle so we can check connector compatibility and estimate the price.</span>
            <Link href={`/vehicles/new?back=${encodeURIComponent(`/stations/${id}/book?date=${date}&duration=${duration}`)}`} className="inline-flex min-h-10 items-center rounded-xl bg-energy-600 shadow-sm px-3 font-medium text-white hover:bg-energy-700">
              Add vehicle
            </Link>
          </div>
        ) : (
          <form action={`/stations/${id}/book`} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="duration" value={duration} />
            <label className="text-sm font-medium">
              Vehicle
              <select name="vehicle" defaultValue={vehicle?.id} className="mt-1 block min-h-11 w-64 rounded-xl border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{vehicleLabel(v)} — {v.vehicle_connectors.map((c) => c.connector_type).join(", ") || "no connectors set"}</option>
                ))}
              </select>
            </label>
            <button className="min-h-11 rounded-xl px-4 text-sm font-medium ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800">Use this vehicle</button>
            <Link href={`/vehicles/new?back=${encodeURIComponent(`/stations/${id}/book?date=${date}&duration=${duration}`)}`} className="min-h-11 content-center text-sm font-medium text-energy-700 hover:underline">+ Add another</Link>
          </form>
        )}
        {vehicle && incompatible.length > 0 && (
          <p className="mt-3 text-xs text-zinc-500">
            Not shown — doesn’t match {vehicleLabel(vehicle)}’s connectors: {incompatible.map((e) => `${e.label} (${e.connectors.join(", ") || "connectors not listed"})`).join("; ")}.
          </p>
        )}
      </Step>

      <Step n={2} title="Day and duration">
        <form className="flex flex-col gap-4 sm:flex-row sm:items-end" action={`/stations/${id}/book`}>
          {vehicle && <input type="hidden" name="vehicle" value={vehicle.id} />}
          <fieldset className="min-w-0 flex-1">
            <legend className="text-sm font-medium">Day</legend>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {days.map((d) => (
                <label key={d} className="cursor-pointer">
                  <input type="radio" name="date" value={d} defaultChecked={d === date} className="peer sr-only" />
                  <span className="block min-w-16 rounded-xl border border-zinc-300 px-3 py-2 text-center text-sm peer-checked:border-energy-600 peer-checked:bg-energy-600 peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-energy-600 dark:border-zinc-700 dark:peer-checked:bg-energy-500/10">
                    {formatLocal(`${d}T12:00:00Z`, "UTC", { weekday: "short" })}
                    <span className="block text-xs opacity-70">{formatLocal(`${d}T12:00:00Z`, "UTC", { day: "numeric", month: "short" })}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm font-medium">
            Duration
            <select name="duration" defaultValue={duration} className="mt-2 block min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm sm:w-36 dark:border-zinc-700 dark:bg-zinc-950">
              {durations.map((m) => (
                <option key={m} value={m}>{fmtDuration(m)}</option>
              ))}
            </select>
          </label>
          <button className="min-h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">Show times</button>
        </form>
      </Step>

      <Step n={3} title="Charging point and start time">
        {loadError ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{loadError}</p>
        ) : vehicle && evseInfo.length === 0 ? (
          <p className="rounded-xl bg-charge-50 p-3 text-sm text-zinc-800 dark:bg-charge-500/10 dark:text-charge-200">
            None of this station’s charging points match {vehicleLabel(vehicle)}’s connectors ({vehicle.vehicle_connectors.map((c) => c.connector_type).join(", ") || "none set"}).{" "}
            <Link href={`/vehicles/${vehicle.id}?edit=1`} className="font-medium underline">Check your vehicle’s connectors</Link> or{" "}
            <Link href="/?bookable=1" className="font-medium underline">find another station</Link>.
          </p>
        ) : (
          <SlotPicker
            stationId={id}
            timeZone={tz}
            durationMin={duration}
            slots={slots}
            evses={evseInfo}
            back={back}
            signedIn={!!user}
            vehicleId={vehicle?.id ?? null}
            vehicleLabel={vehicle ? vehicleLabel(vehicle) : null}
          />
        )}
      </Step>

      <p className="text-xs text-zinc-500">
        Free cancellation until {rules.free_cancel_until_min} minutes before the start; after that the reservation fee applies.
        A {rules.buffer_min}-minute changeover is kept free after each booking. A booking reserves the time slot in our system — it
        doesn’t guarantee the charger is working, so check drivers’ recent reports on the station page.
      </p>
    </div>
  );
}
