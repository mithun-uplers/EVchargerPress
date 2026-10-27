import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { setPreferredVehicle } from "@/app/account/actions";
import { BatteryReadingForm, RemoveVehicleButton } from "@/components/vehicles/VehicleExtras";
import { VEHICLE_TYPE_LABEL, VehicleForm } from "@/components/vehicles/VehicleForm";
import { formatLocal } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, getVehicle, listBatteryReadings, vehicleLabel, type BatteryReading } from "@/server/account";

export const metadata: Metadata = { title: "Vehicle" };

const UUID = /^[0-9a-f-]{36}$/i;

/** Small inline chart of battery % over time (manual readings only). */
function SocChart({ readings }: { readings: BatteryReading[] }) {
  const pts = readings.filter((r) => r.soc_percent !== null).slice(0, 30).reverse();
  if (pts.length < 2) return null;
  const W = 600, H = 140, pad = 24;
  const t0 = Date.parse(pts[0].recorded_at), t1 = Date.parse(pts.at(-1)!.recorded_at);
  const x = (t: number) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * pad);
  const y = (v: number) => H - pad - (v / 100) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(Date.parse(p.recorded_at)).toFixed(1)} ${y(Number(p.soc_percent)).toFixed(1)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Battery percentage over time (manual readings)" className="w-full">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={pad} x2={W - pad} y1={y(v)} y2={y(v)} className="stroke-zinc-200 dark:stroke-zinc-800" />
            <text x={4} y={y(v) + 4} className="fill-zinc-500 text-[10px]">{v}%</text>
          </g>
        ))}
        <path d={d} fill="none" className="stroke-emerald-600" strokeWidth={2} />
        {pts.map((p) => (
          <circle key={p.id} cx={x(Date.parse(p.recorded_at))} cy={y(Number(p.soc_percent))} r={3} className="fill-emerald-600" />
        ))}
      </svg>
      <figcaption className="text-xs text-zinc-500">Battery % from your manual readings — not live vehicle data.</figcaption>
    </figure>
  );
}

export default async function VehiclePage({ params, searchParams }: PageProps<"/vehicles/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/vehicles/${id}`);
  const sp = await searchParams;
  const [vehicle, profile] = await Promise.all([getVehicle(id), getProfile(user.id)]);
  if (!vehicle) notFound();
  const readings = await listBatteryReadings(id);
  const editing = sp.edit === "1";
  const latest = readings[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/vehicles" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">← My vehicles</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{vehicleLabel(vehicle)}</h1>
          <p className="text-sm text-zinc-500">
            {VEHICLE_TYPE_LABEL[vehicle.vehicle_type]} · {vehicle.make} {vehicle.model}{vehicle.model_year ? ` (${vehicle.model_year})` : ""}
            {vehicle.registration_label ? ` · ${vehicle.registration_label}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {profile?.preferred_vehicle_id === vehicle.id ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">Preferred</span>
          ) : (
            <form action={setPreferredVehicle}>
              <input type="hidden" name="id" value={vehicle.id} />
              <button className="min-h-10 rounded-lg px-3 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:ring-emerald-500/30">Make preferred</button>
            </form>
          )}
          {!editing && <Link href={`/vehicles/${vehicle.id}?edit=1`} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800">Edit</Link>}
        </div>
      </div>

      {editing ? (
        <VehicleForm vehicle={vehicle} />
      ) : (
        <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <h2 className="text-sm text-zinc-500">Battery</h2>
            <p className="font-medium">{vehicle.battery_capacity_kwh ? `${Number(vehicle.battery_capacity_kwh)} kWh usable` : "Not set"}</p>
          </div>
          <div>
            <h2 className="text-sm text-zinc-500">Max charging power</h2>
            <p className="font-medium">
              {[vehicle.max_dc_kw ? `DC ${Number(vehicle.max_dc_kw)} kW` : null, vehicle.max_ac_kw ? `AC ${Number(vehicle.max_ac_kw)} kW` : null].filter(Boolean).join(" · ") || "Not set"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <h2 className="text-sm text-zinc-500">Connectors</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {vehicle.vehicle_connectors.length ? vehicle.vehicle_connectors.map((c) => (
                <span key={c.connector_type} className="rounded-md bg-zinc-100 px-2 py-0.5 text-sm dark:bg-zinc-800">
                  {c.connector_type}{c.supported_power_kw ? ` · ${Number(c.supported_power_kw)} kW` : ""}
                </span>
              )) : <span className="text-sm text-amber-700">None set — add them so we can match chargers.</span>}
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Battery readings</h2>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Manual entries</span>
        </div>
        {latest && (
          <p className="text-sm">
            Last reading {formatLocal(latest.recorded_at, "Asia/Kolkata")}:{" "}
            <strong>{latest.soc_percent !== null ? `${Number(latest.soc_percent)}%` : "—"}</strong>
            {latest.odometer_km !== null ? ` · ${Number(latest.odometer_km).toLocaleString("en-IN")} km` : ""}
          </p>
        )}
        {latest?.soc_percent !== null && latest?.soc_percent !== undefined && vehicle.battery_capacity_kwh ? (
          <p className="text-xs text-zinc-500">
            Estimated energy to 80%: about {Math.max(0, Math.round((80 - Number(latest.soc_percent)) / 100 * Number(vehicle.battery_capacity_kwh) * 10) / 10)} kWh
            (from your last reading and battery size; real needs vary).
          </p>
        ) : null}
        <SocChart readings={readings} />
        <BatteryReadingForm vehicleId={vehicle.id} />
        {readings.length > 0 && (
          <table className="w-full text-sm">
            <caption className="sr-only">Battery reading history</caption>
            <thead className="text-left text-xs text-zinc-500">
              <tr><th className="py-1 font-medium">When</th><th className="py-1 font-medium">Battery</th><th className="py-1 font-medium">Odometer</th><th className="py-1 font-medium">Source</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {readings.slice(0, 15).map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5">{formatLocal(r.recorded_at, "Asia/Kolkata")}</td>
                  <td className="py-1.5 tabular-nums">{r.soc_percent !== null ? `${Number(r.soc_percent)}%` : "—"}</td>
                  <td className="py-1.5 tabular-nums">{r.odometer_km !== null ? `${Number(r.odometer_km).toLocaleString("en-IN")} km` : "—"}</td>
                  <td className="py-1.5 text-zinc-500">{r.source === "manual" ? "Manual" : "Vehicle"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-zinc-500">We don’t calculate battery health from these readings — percentage alone isn’t enough to measure it reliably.</p>
      </section>

      <RemoveVehicleButton vehicleId={vehicle.id} />
    </div>
  );
}
