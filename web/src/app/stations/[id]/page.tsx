import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addCheckin, deleteStation } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";
import { EvseLivePanel } from "@/components/live/EvseLivePanel";
import { StationHero } from "@/components/stations/StationBlocks";
import { getEvseLive } from "@/server/live";
import { WEEKDAYS } from "@/lib/format";
import { timeAgo } from "@/lib/geo";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { type Checkin, type Connector, type StationSummary } from "@/lib/types";

const UUID = /^[0-9a-f-]{36}$/i;

async function getStation(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("station_summaries").select("*").eq("id", id).maybeSingle();
  return data as StationSummary | null;
}

export async function generateMetadata({ params }: PageProps<"/stations/[id]">): Promise<Metadata> {
  const s = await getStation((await params).id);
  return { title: s?.name ?? "Station" };
}

export default async function StationPage({ params, searchParams }: PageProps<"/stations/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  const station = await getStation(id);
  if (!station) notFound();

  const supabase = await createClient();
  const [{ data: connectors }, { data: checkins }, user, { data: bookable }, { data: hours }, evseLive] = await Promise.all([
    supabase.from("connectors").select("*").eq("station_id", id).order("power_kw", { ascending: false }),
    supabase
      .from("checkins")
      .select("id,status,comment,created_at,user_id,profiles(display_name)")
      .eq("station_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    getCurrentUser(),
    supabase.from("evses").select("id").eq("station_id", id).eq("is_bookable", true).eq("is_active", true).limit(1),
    supabase.from("operating_hours").select("weekday,opens_at,closes_at").eq("station_id", id).order("weekday").order("opens_at"),
    getEvseLive(id),
  ]);
  const canBook = (bookable ?? []).length > 0;
  const hoursByDay = WEEKDAYS.map((d, i) => ({
    day: d,
    spans: (hours ?? []).filter((h) => h.weekday === i).map((h) => `${String(h.opens_at).slice(0, 5)}–${String(h.closes_at).slice(0, 5)}`),
  }));

  const reports = (checkins ?? []) as unknown as Checkin[];
  const isOwner = !!user && user.id === station.created_by;
  const d = 0.01;
  const bbox = [station.lng - d, station.lat - d, station.lng + d, station.lat + d].join(",");
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${station.lat},${station.lng}`;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
        ← All stations
      </Link>

      <StationHero station={station} canBook={canBook} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <iframe title="Map" src={mapSrc} className="h-64 w-full rounded-2xl shadow-sm ring-1 ring-zinc-200/70 dark:ring-zinc-800" loading="lazy" />

          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 p-4 dark:bg-zinc-900 dark:ring-zinc-800">
            <h2 className="font-semibold">Connectors</h2>
            {!(connectors as Connector[] | null)?.length && (
              <p className="mt-2 text-sm text-zinc-500">The source doesn’t list connector types for this station.</p>
            )}
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
              {(connectors as Connector[] | null)?.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{c.type}</span>
                  <span className="text-zinc-500">
                    {c.power_kw ? `${Number(c.power_kw)} kW` : "Power not listed"} · ×{c.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 p-4 dark:bg-zinc-900 dark:ring-zinc-800">
            <h2 className="font-semibold">Details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Info label="Operator" value={station.operator} />
              <Info label="Access" value={station.access === "restricted" ? "Restricted" : "Public"} />
              <Info label="Hours" value={station.hours} />
              <Info label="Pricing" value={station.price_info} />
            </dl>
            {(hours ?? []).length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm text-zinc-500">Opening hours ({station.time_zone})</h3>
                <dl className="mt-1 grid grid-cols-[3rem_1fr] gap-x-3 gap-y-0.5 text-sm">
                  {hoursByDay.map((d) => (
                    <div key={d.day} className="contents">
                      <dt className="text-zinc-500">{d.day}</dt>
                      <dd>{d.spans.length ? d.spans.join(", ").replace("00:00–24:00", "Open 24 hours") : "Closed"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {isOwner && (
              <form action={deleteStation} className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <input type="hidden" name="station_id" value={station.id} />
                <button className="text-sm font-medium text-rose-600 hover:underline">Delete this station</button>
              </form>
            )}
          </section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <EvseLivePanel stationId={station.id} initial={evseLive} />
          {!canBook && (
            <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:bg-zinc-900 dark:ring-zinc-800">
              <h2 className="font-semibold">Online booking isn’t available here</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {station.data_source === "openstreetmap"
                  ? "This station comes from OpenStreetMap. We don’t have verified charging points, opening hours or prices for it, so we don’t take bookings — turn up and charge as usual."
                  : "The operator hasn’t published bookable charging points, opening hours and prices for this station yet."}
              </p>
              <Link href="/?bookable=1" className="mt-3 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-energy-700 ring-1 ring-inset ring-energy-200 hover:bg-energy-50 dark:text-energy-400 dark:ring-energy-500/30">
                Find bookable stations
              </Link>
            </section>
          )}
          {canBook && (
            <section className="rounded-2xl bg-energy-50 p-4 ring-1 ring-inset ring-energy-200 dark:bg-energy-500/10 dark:ring-energy-500/30">
              <h2 className="font-semibold">Reserve a charging slot</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Pick a time, see the full price, then confirm. Free cancellation up to the cut-off.</p>
              <Link href={`/stations/${station.id}/book`} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-energy-600 shadow-sm px-4 text-sm font-medium text-white hover:bg-energy-700">
                Book a slot
              </Link>
            </section>
          )}
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 p-4 dark:bg-zinc-900 dark:ring-zinc-800">
            <h2 className="font-semibold">Report status</h2>
            {error && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
            {user ? (
              <form action={addCheckin} className="mt-3 space-y-3">
                <input type="hidden" name="station_id" value={station.id} />
                <div className="grid grid-cols-3 gap-2">
                  {(["working", "busy", "broken"] as const).map((s, i) => (
                    <label key={s} className="cursor-pointer">
                      <input type="radio" name="status" value={s} defaultChecked={i === 0} className="peer sr-only" />
                      <span className="block rounded-xl border border-zinc-300 px-2 py-2 text-center text-sm capitalize peer-checked:border-energy-600 peer-checked:bg-energy-50 peer-checked:font-medium dark:border-zinc-700 dark:peer-checked:bg-energy-500/10">
                        {s}
                      </span>
                    </label>
                  ))}
                </div>
                <textarea
                  name="comment"
                  maxLength={500}
                  rows={3}
                  placeholder="Optional: e.g. 'CCS2 #2 out of order, #1 fine'"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button className="w-full rounded-xl bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">
                  Submit report
                </button>
              </form>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                <Link href={`/login?next=/stations/${station.id}`} className="font-medium text-energy-700 hover:underline dark:text-energy-400">
                  Sign in
                </Link>{" "}
                to report whether this charger is working.
              </p>
            )}
          </section>

          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 p-4 dark:bg-zinc-900 dark:ring-zinc-800">
            <h2 className="font-semibold">Recent reports</h2>
            {reports.length ? (
              <ul className="mt-3 space-y-3">
                {reports.map((c) => (
                  <li key={c.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={c.status} />
                      <span className="text-xs text-zinc-500">
                        {c.profiles?.display_name ?? "Driver"} · {timeAgo(c.created_at)}
                      </span>
                    </div>
                    {c.comment && <p className="mt-1 text-zinc-600 dark:text-zinc-300">{c.comment}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">No reports yet. Be the first.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}
