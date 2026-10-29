import { connectLabels } from "@/lib/vehicle-types";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { setPreferredVehicle } from "@/app/account/actions";
import { VehicleCard } from "@/components/charging/VehicleCard";
import { PlugIcon } from "@/components/nav/icons";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, latestReadings, listVehicles } from "@/server/account";
import { connectionsFor } from "@/server/vehicle-connect";

export const metadata: Metadata = { title: "My vehicles" };

export default async function VehiclesPage({ searchParams }: PageProps<"/vehicles">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/vehicles");
  const [vehicles, profile] = await Promise.all([listVehicles(), getProfile(user.id)]);
  const [latest, connections] = await Promise.all([latestReadings(vehicles.map((v) => v.id)), connectionsFor(vehicles.map((v) => v.id))]);
  const sp = await searchParams;
  const connectError = typeof sp.connect_error === "string" ? sp.connect_error.slice(0, 200) : "";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My vehicles</h1>
          <p className="mt-1 text-sm text-zinc-500">Connector types decide which chargers you can book. Tap <strong>Connect</strong> on a vehicle to read battery, range and location from the vehicle itself.</p>
        </div>
        <Link href="/vehicles/new" className="inline-flex min-h-11 items-center rounded-xl bg-energy-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-energy-700">
          Add vehicle
        </Link>
      </div>

      {connectError && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">{connectError}</p>}
      {vehicles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center dark:border-zinc-700 dark:bg-transparent">
          <p className="font-medium">No vehicles yet.</p>
          <p className="mt-1 text-sm text-zinc-500">Add your EV to see compatible chargers and better price estimates.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {vehicles.map((v) => {
            const preferred = profile?.preferred_vehicle_id === v.id;
            return (
              <VehicleCard
                key={v.id}
                vehicle={v}
                latest={latest[v.id] ?? null}
                preferred={preferred}
                connected={connections[v.id] && connections[v.id].status !== "pending" ? { simulated: connections[v.id].provider === "simulator" || connections[v.id].mode === "simulated" } : null}
                action={
                  <span className="flex flex-wrap items-center gap-1">
                    {!preferred && (
                      <form action={setPreferredVehicle}>
                        <input type="hidden" name="id" value={v.id} />
                        <button className="min-h-9 rounded-lg px-3 text-sm font-medium text-energy-700 hover:bg-energy-50 dark:text-energy-400 dark:hover:bg-energy-500/10">Make preferred</button>
                      </form>
                    )}
                    {!(connections[v.id] && connections[v.id].status !== "pending") && (
                      <Link href={`/vehicles/${v.id}#connect`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-charge-400 px-3 text-sm font-semibold text-zinc-900 hover:bg-charge-300">
                        <PlugIcon className="h-4 w-4" /> {connectLabels(v.vehicle_type).connect}
                      </Link>
                    )}
                  </span>
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
