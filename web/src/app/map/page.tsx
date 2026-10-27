import type { Metadata } from "next";
import Link from "next/link";
import { StationMap } from "@/components/StationMap";

export const metadata: Metadata = { title: "Map" };

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const sp = await searchParams;
  const lat = Number(sp.lat);
  const lng = Number(sp.lng);
  const center: [number, number] | undefined =
    Number.isFinite(lat) && Number.isFinite(lng) && sp.lat !== undefined ? [lng, lat] : undefined;

  return (
    <div className="-mx-4 -mt-6 flex h-[calc(100dvh-7.5rem)] flex-col md:mx-0 md:mt-0 md:h-[calc(100dvh-7rem)]">
      <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-0">
        <h1 className="text-lg font-semibold tracking-tight">Charging stations map</h1>
        <Link href="/" className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800">
          List view
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden sm:rounded-xl sm:border sm:border-zinc-200 dark:sm:border-zinc-800">
        <StationMap initialCenter={center} />
      </div>
    </div>
  );
}
