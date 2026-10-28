import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LiveCharging } from "@/components/live/LiveCharging";
import { chargingWindow } from "@/lib/charging-window";
import { getCurrentUser } from "@/lib/supabase/server";
import { getBooking } from "@/server/bookings";
import { liveForBooking } from "@/server/live";

export const metadata: Metadata = { title: "Live charging" };

export default async function LiveChargingPage({ params }: PageProps<"/bookings/[ref]/live">) {
  const { ref } = await params;
  if (!/^EV-[A-Z0-9]{8}$/.test(ref)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/bookings/${ref}/live`)}`);
  const found = await getBooking(ref);
  if (!found) notFound();
  const b = found.booking;
  const { connected, canStart } = chargingWindow(b);
  const initial = await liveForBooking(b.id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/bookings/${ref}`} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">← Booking {ref}</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{b.station?.name ?? "Charging"}</h1>
        <p className="text-sm text-zinc-500">
          {b.evse?.label}{b.evse?.max_power_kw ? ` · up to ${Number(b.evse.max_power_kw)} kW` : ""}{b.price_snapshot.vehicle ? ` · ${b.price_snapshot.vehicle.label}` : ""}
        </p>
      </div>
      {!connected && !initial.live ? (
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
          <p className="font-semibold">This charger isn’t connected to EVChargePress yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Start charging on the charger’s own screen or app. Live power, energy and cost appear here only when the operator connects the charger. You can add the session afterwards from your receipt in{" "}
            <Link href="/history#add-session" className="font-medium text-energy-700 hover:underline">Charging history</Link>.
          </p>
        </section>
      ) : (
        <LiveCharging reference={ref} initial={initial} canStart={canStart} serverNow={new Date().getTime()} />
      )}
    </div>
  );
}
