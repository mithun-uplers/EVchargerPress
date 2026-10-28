import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { setPreferredVehicle } from "@/app/account/actions";
import { VehicleDashboard } from "@/components/charging/VehicleDashboard";
import { BatteryReadingForm, RemoveVehicleButton } from "@/components/vehicles/VehicleExtras";
import { VehicleForm } from "@/components/vehicles/VehicleForm";
import { upcomingBriefs } from "@/lib/booking-brief";
import { averagePricePerKwhMinor, toHistoryItems } from "@/lib/charging-stats";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, getVehicle, listBatteryReadings, listFinishedBookings, listSessions } from "@/server/account";
import { VehicleConnectPanel, type ConnectNotice } from "@/components/vehicles/VehicleConnectPanel";
import { smartcarConfigured, smartcarMode } from "@/server/smartcar";
import { connectionsFor, syncSmartcar, telemetry } from "@/server/vehicle-connect";
import { listBookings } from "@/server/bookings";

export const metadata: Metadata = { title: "Vehicle" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function VehiclePage({ params, searchParams }: PageProps<"/vehicles/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/vehicles/${id}`);
  const sp = await searchParams;
  const [vehicle, profile] = await Promise.all([getVehicle(id), getProfile(user.id)]);
  if (!vehicle) notFound();
  // Keep a Smartcar connection fresh: pull new signals when the last reading is over 15 minutes old.
  const nowMs = new Date().getTime();
  let connection = (await connectionsFor([id]))[id] ?? null;
  let autoSyncError: string | null = null;
  if (connection?.provider === "smartcar" && connection.status === "active" && smartcarConfigured()
      && (!connection.last_synced_at || nowMs - Date.parse(connection.last_synced_at) > 15 * 60_000)) {
    autoSyncError = await syncSmartcar(connection.id);
    connection = (await connectionsFor([id]))[id] ?? null;
  }
  const [readings, sessions, finished, upcomingRows, carTelemetry] = await Promise.all([
    listBatteryReadings(id), listSessions(500), listFinishedBookings(200), listBookings("upcoming"), connection ? telemetry(id) : Promise.resolve([]),
  ]);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 200) : "");
  const notice: ConnectNotice = one("connect_error") ? { kind: "error", text: one("connect_error") }
    : one("connected") === "smartcar" ? { kind: "ok", text: "Your car is connected through Smartcar." }
    : one("connected") === "simulator" ? { kind: "ok", text: "Simulated car connected. It reports a reading every 5 minutes." }
    : one("synced") ? { kind: "ok", text: "Synced with your car." }
    : one("disconnected") ? { kind: "ok", text: "Disconnected. Readings already saved stay in your history." }
    : autoSyncError ? { kind: "error", text: autoSyncError } : null;
  const all = toHistoryItems(sessions, finished);
  const mine = all.filter((i) => i.vehicleId === id);
  const ownPrice = averagePricePerKwhMinor(mine);
  const anyPrice = ownPrice ?? averagePricePerKwhMinor(all);
  const fromCharger = sessions
    .filter((x) => x.vehicle?.id === id && x.source !== "manual" && x.last_soc_percent !== null && x.last_meter_at)
    .sort((a, b) => Date.parse(b.last_meter_at!) - Date.parse(a.last_meter_at!))[0];
  const editing = sp.edit === "1";
  const preferred = profile?.preferred_vehicle_id === vehicle.id;

  return (
    <VehicleDashboard
      vehicle={vehicle}
      readings={readings}
      chargerReading={fromCharger ? { soc_percent: Number(fromCharger.last_soc_percent), recorded_at: fromCharger.last_meter_at!, simulated: fromCharger.is_simulated } : null}
      items={mine}
      upcoming={upcomingBriefs(upcomingRows).filter((b) => b.vehicleId === id)}
      pricePerKwhMinor={anyPrice}
      priceBasis={ownPrice !== null ? "your average for this vehicle" : anyPrice !== null ? "your average across all sessions" : null}
      preferredSlot={
        <>
          {preferred ? (
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-white/30">Preferred</span>
          ) : (
            <form action={setPreferredVehicle}>
              <input type="hidden" name="id" value={vehicle.id} />
              <button className="min-h-9 rounded-full bg-white/15 px-3 text-sm font-medium ring-1 ring-inset ring-white/30 hover:bg-white/25">Make preferred</button>
            </form>
          )}
          {!editing && (
            <Link href={`/vehicles/${vehicle.id}?edit=1#edit`} className="inline-flex min-h-9 items-center rounded-full bg-white px-3 text-sm font-medium text-energy-800 hover:bg-energy-50">Edit</Link>
          )}
        </>
      }
      editSlot={
        editing ? (
          <section id="edit" className="scroll-mt-20 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800">
            <h2 className="mb-4 font-semibold">Edit vehicle</h2>
            <VehicleForm vehicle={vehicle} />
          </section>
        ) : null
      }
      readingForm={<BatteryReadingForm vehicleId={vehicle.id} />}
      connectSlot={
        <VehicleConnectPanel vehicleId={vehicle.id} connection={connection} telemetry={carTelemetry} smartcarAvailable={smartcarConfigured()}
          smartcarTestMode={smartcarMode() === "simulated"} notice={notice} now={nowMs} />
      }
      removeSlot={<RemoveVehicleButton vehicleId={vehicle.id} />}
    />
  );
}
