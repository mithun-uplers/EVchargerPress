import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { completeOnboarding } from "@/app/account/actions";
import { LocationPermission } from "@/components/account/LocationPermission";
import { getCurrentUser } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import { getProfile, listVehicles, vehicleLabel } from "@/server/account";

export const metadata: Metadata = { title: "Set up your account" };

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className={`${ui.card} relative pl-16 sm:pl-16`}>
      <span aria-hidden="true" className={`absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-full text-sm font-bold sm:top-5 ${done ? "bg-energy-600 text-white" : "bg-charge-400 text-zinc-900"}`}>
        {done ? "✓" : n}
      </span>
      <h2 className="pt-1.5 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/onboarding");
  const [profile, vehicles] = await Promise.all([getProfile(user.id), listVehicles()]);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <section className={ui.hero}>
        <p className="text-sm text-white/80">Welcome{profile?.display_name ? `, ${profile.display_name}` : ""}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Let’s set up your EV</h1>
        <p className="mt-1 text-sm text-white/80">Three quick steps. You can change everything later in your profile.</p>
        <div aria-hidden="true" className="mt-4 flex gap-1.5">
          {[profile?.display_name, vehicles.length > 0, false].map((d, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${d ? "bg-charge-400" : "bg-white/25"}`} />
          ))}
        </div>
      </section>
      <form action={completeOnboarding} className="space-y-4">
        <Step n={1} title="About you" done={!!profile?.display_name}>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Name
              <input name="display_name" defaultValue={profile?.display_name ?? ""} autoComplete="name" className={ui.input} />
            </label>
            <label className="text-sm font-medium">
              Mobile <span className="font-normal text-zinc-500">(optional)</span>
              <input name="phone" type="tel" defaultValue={profile?.phone ?? ""} placeholder="+91 98765 43210" autoComplete="tel" className={ui.input} />
            </label>
          </div>
        </Step>

        <Step n={2} title="Your vehicle" done={vehicles.length > 0}>
          <p className="mt-1 text-sm text-zinc-500">We use its connector types to show only chargers you can plug into.</p>
          {vehicles.length === 0 ? (
            <Link href="/vehicles/new?back=/onboarding" className={`mt-3 ${ui.btn}`}>Add your vehicle</Link>
          ) : (
            <label className="mt-3 block text-sm font-medium">
              Preferred vehicle
              <select name="preferred_vehicle_id" defaultValue={profile?.preferred_vehicle_id ?? vehicles[0].id} className={ui.input}>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
                ))}
              </select>
              <Link href="/vehicles/new?back=/onboarding" className={`mt-2 inline-block text-sm ${ui.link}`}>+ Add another</Link>
            </label>
          )}
        </Step>

        <Step n={3} title="Location">
          <p className="mb-3 mt-1 text-sm text-zinc-500">Allow location to find chargers near you. It stays in your browser; we don’t save it.</p>
          <LocationPermission />
        </Step>

        <div className="flex flex-wrap items-center gap-3">
          <button className={ui.btn}>Finish setup</button>
          <Link href="/" className="inline-flex min-h-11 items-center px-3 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">Skip for now</Link>
        </div>
      </form>
    </div>
  );
}
