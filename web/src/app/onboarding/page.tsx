import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { completeOnboarding } from "@/app/account/actions";
import { LocationPermission } from "@/components/account/LocationPermission";
import { inputCls } from "@/components/forms";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, listVehicles, vehicleLabel } from "@/server/account";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/onboarding");
  const [profile, vehicles] = await Promise.all([getProfile(user.id), listVehicles()]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to EVChargePress</h1>
        <p className="mt-1 text-sm text-zinc-500">Three quick steps. You can change everything later in your profile.</p>
      </div>
      <form action={completeOnboarding} className="space-y-4">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-medium">1. About you</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Name
              <input name="display_name" defaultValue={profile?.display_name ?? ""} autoComplete="name" className={inputCls} />
            </label>
            <label className="text-sm font-medium">
              Mobile <span className="font-normal text-zinc-500">(optional)</span>
              <input name="phone" type="tel" defaultValue={profile?.phone ?? ""} placeholder="+91 98765 43210" autoComplete="tel" className={inputCls} />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-medium">2. Your vehicle</h2>
          <p className="mt-1 text-sm text-zinc-500">We use its connector types to show only chargers you can plug into.</p>
          {vehicles.length === 0 ? (
            <Link href="/vehicles/new?back=/onboarding" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700">
              Add your vehicle
            </Link>
          ) : (
            <label className="mt-3 block text-sm font-medium">
              Preferred vehicle
              <select name="preferred_vehicle_id" defaultValue={profile?.preferred_vehicle_id ?? vehicles[0].id} className={inputCls}>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
                ))}
              </select>
              <Link href="/vehicles/new?back=/onboarding" className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:underline">+ Add another</Link>
            </label>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-medium">3. Location</h2>
          <p className="mb-3 mt-1 text-sm text-zinc-500">Allow location to find chargers near you. It stays in your browser; we don’t save it.</p>
          <LocationPermission />
        </section>

        <div className="flex flex-wrap gap-3">
          <button className="min-h-11 rounded-lg bg-emerald-600 px-5 text-sm font-medium text-white hover:bg-emerald-700">Finish</button>
          <Link href="/" className="inline-flex min-h-11 items-center px-3 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">Skip for now</Link>
        </div>
      </form>
    </div>
  );
}
