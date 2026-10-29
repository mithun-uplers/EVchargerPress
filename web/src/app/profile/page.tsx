import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { AccountForm, DeleteAccountForm, PreferencesForm } from "@/components/account/ProfileForms";
import { SignOutIcon } from "@/components/nav/icons";
import { getCurrentUser } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import { getProfile, listVehicles, vehicleLabel } from "@/server/account";

export const metadata: Metadata = { title: "My profile" };

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={ui.card}>
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");
  const [profile, vehicles] = await Promise.all([getProfile(user.id), listVehicles()]);
  if (!profile) redirect("/login");
  const name = profile.display_name || user.email.split("@")[0];
  const initials = name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "EV";
  const preferred = vehicles.find((v) => v.id === profile.preferred_vehicle_id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className={ui.hero}>
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 text-xl font-semibold ring-1 ring-inset ring-white/25">{initials}</span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
            <p className="truncate text-sm text-white/80">{user.email}</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-xl bg-white/10 p-3 ring-1 ring-inset ring-white/15"><dt className="text-xs text-white/70">Vehicles</dt><dd className="mt-0.5 text-lg font-semibold">{vehicles.length}</dd></div>
          <div className="col-span-2 rounded-xl bg-white/10 p-3 ring-1 ring-inset ring-white/15"><dt className="text-xs text-white/70">Preferred</dt><dd className="mt-0.5 truncate text-lg font-semibold">{preferred ? vehicleLabel(preferred) : "—"}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/vehicles" className={ui.btnOnDark}>My vehicles</Link>
          <Link href="/history" className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-white ring-1 ring-inset ring-white/30 hover:bg-white/10">Charging history</Link>
        </div>
      </section>
      <Card title="Account">
        <AccountForm email={user.email} profile={profile} />
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4 text-sm dark:border-zinc-800">
          <Link href="/reset-password" className={ui.btnLight}>Change password</Link>
          <form action={signOut}>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-50 px-4 text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30 dark:hover:bg-rose-500/25">
              <SignOutIcon className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </Card>
      <Card title="Preferences">
        <PreferencesForm profile={profile} vehicles={vehicles.map((v) => ({ id: v.id, label: vehicleLabel(v) }))} />
      </Card>
      <Card title="Privacy">
        <ul className="mb-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
          {[
            "Your vehicles, bookings, sessions and battery readings are visible only to you.",
            "Manual entries and simulated charger data are always labelled — never shown as live measurements.",
            "Location is used in your browser to find nearby chargers and isn’t saved.",
          ].map((t) => (
            <li key={t} className="flex gap-2"><span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-energy-500" />{t}</li>
          ))}
        </ul>
        <DeleteAccountForm requested={profile.status === "deletion_requested"} />
      </Card>
    </div>
  );
}
