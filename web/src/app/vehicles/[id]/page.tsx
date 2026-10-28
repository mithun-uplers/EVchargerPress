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
  const [readings, sessions, finished, upcomingRows] = await Promise.all([
    listBatteryReadings(id), listSessions(500), listFinishedBookings(200), listBookings("upcoming"),
  ]);
  const all = toHistoryItems(sessions, finished);
  const mine = all.filter((i) => i.vehicleId === id);
  const ownPrice = averagePricePerKwhMinor(mine);
  const anyPrice = ownPrice ?? averagePricePerKwhMinor(all);
  const editing = sp.edit === "1";
  const preferred = profile?.preferred_vehicle_id === vehicle.id;

  return (
    <VehicleDashboard
      vehicle={vehicle}
      readings={readings}
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
      removeSlot={<RemoveVehicleButton vehicleId={vehicle.id} />}
    />
  );
}
