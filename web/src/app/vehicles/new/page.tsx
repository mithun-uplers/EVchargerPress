import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VehicleForm } from "@/components/vehicles/VehicleForm";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add a vehicle" };

export default async function NewVehiclePage({ searchParams }: PageProps<"/vehicles/new">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/vehicles/new");
  const sp = await searchParams;
  const back = typeof sp.back === "string" && sp.back.startsWith("/") && !sp.back.startsWith("//") ? sp.back : undefined;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href={back ?? "/vehicles"} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">← Back</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a vehicle</h1>
        <p className="mt-1 text-sm text-zinc-500">Only you can see your vehicles.</p>
      </div>
      <VehicleForm back={back} />
    </div>
  );
}
