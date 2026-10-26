import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addCheckin, deleteStation } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";
import { timeAgo } from "@/lib/geo";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Checkin, Connector, StationSummary } from "@/lib/types";

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
  const [{ data: connectors }, { data: checkins }, user] = await Promise.all([
    supabase.from("connectors").select("*").eq("station_id", id).order("power_kw", { ascending: false }),
    supabase
      .from("checkins")
      .select("id,status,comment,created_at,user_id,profiles(display_name)")
      .eq("station_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    getCurrentUser(),
  ]);

  const reports = (checkins ?? []) as unknown as Checkin[];
  const isOwner = !!user && user.id === station.created_by;
  const d = 0.01;
  const bbox = [station.lng - d, station.lat - d, station.lng + d, station.lat + d].join(",");
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${station.lat},${station.lng}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
        ← All stations
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{station.name}</h1>
            <StatusBadge status={station.last_status} />
          </div>
          <p className="mt-1 text-zinc-500">
            {station.address}, {station.city}
          </p>
          {station.is_demo && <p className="mt-1 text-xs text-amber-600">Demo data — not a real station.</p>}
        </div>
        <a href={directions} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-emerald-700">
          Get directions
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <iframe title="Map" src={mapSrc} className="h-64 w-full rounded-xl border border-zinc-200 dark:border-zinc-800" loading="lazy" />

          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-medium">Connectors</h2>
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
              {(connectors as Connector[] | null)?.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{c.type}</span>
                  <span className="text-zinc-500">
                    {Number(c.power_kw)} kW · ×{c.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-medium">Details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Info label="Operator" value={station.operator} />
              <Info label="Access" value={station.access === "restricted" ? "Restricted" : "Public"} />
              <Info label="Hours" value={station.hours} />
              <Info label="Pricing" value={station.price_info} />
            </dl>
            {isOwner && (
              <form action={deleteStation} className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <input type="hidden" name="station_id" value={station.id} />
                <button className="text-sm font-medium text-rose-600 hover:underline">Delete this station</button>
              </form>
            )}
          </section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-medium">Report status</h2>
            {error && <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
            {user ? (
              <form action={addCheckin} className="mt-3 space-y-3">
                <input type="hidden" name="station_id" value={station.id} />
                <div className="grid grid-cols-3 gap-2">
                  {(["working", "busy", "broken"] as const).map((s, i) => (
                    <label key={s} className="cursor-pointer">
                      <input type="radio" name="status" value={s} defaultChecked={i === 0} className="peer sr-only" />
                      <span className="block rounded-lg border border-zinc-300 px-2 py-2 text-center text-sm capitalize peer-checked:border-emerald-600 peer-checked:bg-emerald-50 peer-checked:font-medium dark:border-zinc-700 dark:peer-checked:bg-emerald-500/10">
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
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">
                  Submit report
                </button>
              </form>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                <Link href={`/login?next=/stations/${station.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  Sign in
                </Link>{" "}
                to report whether this charger is working.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-medium">Recent reports</h2>
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
