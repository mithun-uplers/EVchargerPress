import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { setPreferredVehicle } from "@/app/account/actions";
import { VEHICLE_TYPE_LABEL } from "@/components/vehicles/VehicleForm";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, listVehicles, vehicleLabel } from "@/server/account";

export const metadata: Metadata = { title: "My vehicles" };

export default async function VehiclesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/vehicles");
  const [vehicles, profile] = await Promise.all([listVehicles(), getProfile(user.id)]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My vehicles</h1>
          <p className="mt-1 text-sm text-zinc-500">Connector types decide which chargers you can book.</p>
        </div>
        <Link href="/vehicles/new" className="inline-flex min-h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700">
          Add vehicle
        </Link>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="font-medium">No vehicles yet.</p>
          <p className="mt-1 text-sm text-zinc-500">Add your EV to see compatible chargers and better price estimates.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {vehicles.map((v) => {
            const preferred = profile?.preferred_vehicle_id === v.id;
            return (
              <li key={v.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/vehicles/${v.id}`} className="block truncate font-medium hover:underline">{vehicleLabel(v)}</Link>
                    <p className="text-sm text-zinc-500">
                      {VEHICLE_TYPE_LABEL[v.vehicle_type]}{v.model_year ? ` · ${v.model_year}` : ""}{v.nickname ? ` · ${v.make} ${v.model}` : ""}
                    </p>
                  </div>
                  {preferred && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">Preferred</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.vehicle_connectors.map((c) => (
                    <span key={c.connector_type} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{c.connector_type}</span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  {[v.battery_capacity_kwh ? `${Number(v.battery_capacity_kwh)} kWh battery` : "Battery size not set",
                    v.max_dc_kw ? `DC up to ${Number(v.max_dc_kw)} kW` : null,
                    v.max_ac_kw ? `AC up to ${Number(v.max_ac_kw)} kW` : null].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-3 flex gap-2">
                  <Link href={`/vehicles/${v.id}`} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800">Details</Link>
                  {!preferred && (
                    <form action={setPreferredVehicle}>
                      <input type="hidden" name="id" value={v.id} />
                      <button className="min-h-10 rounded-lg px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10">Make preferred</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
