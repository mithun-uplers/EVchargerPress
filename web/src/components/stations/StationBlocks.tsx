import Link from "next/link";
import { StationLiveBadge } from "@/components/live/LiveBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { timeAgo } from "@/lib/geo";
import { CONNECTOR_TYPES, SOURCE_LABEL, formatPlace, type StationSummary } from "@/lib/types";

/** Station result card: power tile, bookable badge, driver-reported and live status, connectors. */
export function StationCard({ s }: { s: StationSummary & { distance: number | null } }) {
  return (
    <Link
      href={`/stations/${s.id}`}
      className="flex h-full min-w-0 gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 transition hover:ring-energy-400 dark:bg-zinc-900 dark:ring-zinc-800"
    >
      <span
        aria-hidden="true"
        className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-center ${s.is_bookable ? "bg-energy-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
      >
        <span>
          <span className="block text-base font-semibold leading-none">{Number(s.max_power_kw) > 0 ? Number(s.max_power_kw) : "—"}</span>
          <span className="block text-[10px] leading-tight opacity-80">kW</span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate font-semibold">{s.name}</span>
            <span className="block truncate text-sm text-zinc-500">{formatPlace(s)}</span>
          </span>
          {s.is_bookable ? (
            <span className="shrink-0 rounded-full bg-charge-400 px-2 py-0.5 text-xs font-semibold text-zinc-900">Bookable</span>
          ) : (
            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Info only</span>
          )}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={s.last_status} />
          <StationLiveBadge s={s} />
          {s.connector_types.length ? (
            s.connector_types.map((c) => (
              <span key={c} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{c}</span>
            ))
          ) : (
            <span className="text-xs text-zinc-400">Connectors not listed</span>
          )}
        </span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          {s.distance !== null && <span className="font-medium text-energy-700 dark:text-energy-400">{s.distance.toFixed(1)} km away</span>}
          {s.price_info && <span>{s.price_info}</span>}
          {s.access === "restricted" && <span>Restricted access</span>}
          {s.last_checkin_at && <span>Reported {timeAgo(s.last_checkin_at)}</span>}
          <span className={s.is_demo ? "text-charge-600" : ""}>{SOURCE_LABEL[s.data_source]}</span>
        </span>
      </span>
    </Link>
  );
}

/** Home hero: greeting, search with connector filter, filter chips and quick links. */
export function HomeHero({ name, q, connector, bookableOnly, workingOnly, loc, mapHref }: {
  name: string | null; q: string; connector: string; bookableOnly: boolean; workingOnly: boolean; loc: { lat: number; lng: number } | null; mapHref: string;
}) {
  return (
  <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-energy-800 via-energy-700 to-energy-900 p-5 text-white shadow-md sm:p-8">
    <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -right-12 -top-12 h-72 w-72 text-white/10">
      <path d="M115 10 45 115h50l-10 75 70-105h-50l10-75Z" fill="currentColor" />
    </svg>
    <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-charge-400/20 blur-3xl" />
    <p className="relative text-sm text-white/80">{name ? `Hi ${name}` : "EV charging across India"}</p>
    <h1 className="relative mt-1 max-w-2xl text-2xl font-semibold tracking-tight sm:text-4xl">Find a charger that actually works.</h1>
    <p className="relative mt-2 max-w-xl text-sm text-white/80 sm:text-base">
      Search by city, PIN code or name, filter by connector, book a slot and see live status where chargers are connected.
    </p>
    <form className="relative mt-5 space-y-3" action="/">
      <div className="flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-lg sm:flex-row">
        <label className="sr-only" htmlFor="q">Search</label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="City, PIN code, operator or station"
          className="min-h-11 flex-1 rounded-xl px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-4 focus:ring-energy-600/15"
        />
        <select name="connector" defaultValue={connector} aria-label="Connector" className="min-h-11 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900">
          <option value="">Any connector</option>
          {CONNECTOR_TYPES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="min-h-11 rounded-xl bg-energy-600 px-5 text-sm font-semibold text-white hover:bg-energy-700">Search</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white/10 px-3 text-sm ring-1 ring-inset ring-white/20 has-[:checked]:bg-white has-[:checked]:font-medium has-[:checked]:text-energy-800">
          <input type="checkbox" name="bookable" value="1" defaultChecked={bookableOnly} className="accent-energy-600" /> Bookable only
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white/10 px-3 text-sm ring-1 ring-inset ring-white/20 has-[:checked]:bg-white has-[:checked]:font-medium has-[:checked]:text-energy-800">
          <input type="checkbox" name="working" value="1" defaultChecked={workingOnly} className="accent-energy-600" /> Working only
        </label>
        {loc && (
            <>
              <input type="hidden" name="lat" value={loc.lat} />
              <input type="hidden" name="lng" value={loc.lng} />
            </>
          )}
      </div>
    </form>
    <div className="relative mt-5 grid grid-cols-3 gap-2 sm:max-w-lg">
      {[
        { href: mapHref, label: "Map", sub: "All chargers" },
        { href: "/route", label: "Plan trip", sub: "Stops on route" },
        { href: "/bookings", label: "Bookings", sub: "Your slots" },
      ].map((t) => (
        <Link key={t.label} href={t.href} className="rounded-2xl bg-white/10 p-3 ring-1 ring-inset ring-white/15 transition hover:bg-white/20">
          <span className="block text-sm font-semibold">{t.label}</span>
          <span className="block text-[11px] text-white/70">{t.sub}</span>
        </Link>
      ))}
    </div>
  </section>
  );
}

/** Station page header: badges, key facts, Book and Directions. */
export function StationHero({ station, canBook }: { station: StationSummary; canBook: boolean }) {
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;
  return (
  <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-energy-700 via-energy-600 to-energy-800 p-5 text-white shadow-md sm:p-6">
    <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 text-white/10">
      <path d="M115 10 45 115h50l-10 75 70-105h-50l10-75Z" fill="currentColor" />
    </svg>
    <div className="relative flex flex-wrap items-center gap-2">
      {canBook ? (
        <span className="rounded-full bg-charge-400 px-2.5 py-0.5 text-xs font-semibold text-zinc-900">Bookable</span>
      ) : (
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-white/25">Information only</span>
      )}
      <span className="rounded-full bg-white p-0.5"><StatusBadge status={station.last_status} /></span>
      <span className="rounded-full bg-white p-0.5 empty:hidden"><StationLiveBadge s={station} /></span>
    </div>
    <h1 className="relative mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{station.name}</h1>
    <p className="relative mt-1 text-white/80">{formatPlace(station)}</p>
    <dl className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl bg-white/10 p-3 ring-1 ring-inset ring-white/15">
        <dt className="text-xs text-white/70">Max power</dt>
        <dd className="font-semibold">{Number(station.max_power_kw) > 0 ? `${Number(station.max_power_kw)} kW` : "Not listed"}</dd>
      </div>
      <div className="rounded-xl bg-white/10 p-3 ring-1 ring-inset ring-white/15">
        <dt className="text-xs text-white/70">Connectors</dt>
        <dd className="truncate font-semibold">{station.connector_types.length ? station.connector_types.join(", ") : "Not listed"}</dd>
      </div>
      <div className="rounded-xl bg-white/10 p-3 ring-1 ring-inset ring-white/15">
        <dt className="text-xs text-white/70">Operator</dt>
        <dd className="truncate font-semibold">{station.operator || "—"}</dd>
      </div>
      <div className="rounded-xl bg-white/10 p-3 ring-1 ring-inset ring-white/15">
        <dt className="text-xs text-white/70">Free now</dt>
        <dd className="font-semibold">{station.live_evse_count ? `${station.live_available_count ?? 0} of ${station.live_evse_count}${station.live_is_simulated ? " · sim." : ""}` : "No live data"}</dd>
      </div>
    </dl>
    <div className="relative mt-4 flex flex-wrap gap-2">
      {canBook && <Link href={`/stations/${station.id}/book`} className="inline-flex min-h-11 items-center rounded-xl bg-charge-400 px-5 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-charge-300">Book a slot</Link>}
      <a href={directions} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-energy-800 shadow-sm hover:bg-energy-50">Get directions</a>
    </div>
    {station.is_demo && <p className="relative mt-3 text-xs text-charge-100">Demo data — not a real station.</p>}
    {station.data_source === "openstreetmap" && (
      <p className="relative mt-3 text-xs text-white/75">
        {SOURCE_LABEL.openstreetmap}
        {station.external_id && (
          <>
            {" · "}
            <a href={`https://www.openstreetmap.org/${station.external_id}`} target="_blank" rel="noreferrer" className="underline">
              view or fix on OpenStreetMap
            </a>
          </>
        )}
        {station.source_updated_at && <> · data as of {new Date(station.source_updated_at).toLocaleDateString("en-IN")}</>}
        {station.city_is_approx && <> · town is the nearest one, not a postal address</>}
      </p>
    )}
  </section>
  );
}
