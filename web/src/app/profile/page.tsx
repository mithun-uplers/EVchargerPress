import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { AccountForm, DeleteAccountForm, PreferencesForm } from "@/components/account/ProfileForms";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, listVehicles, vehicleLabel } from "@/server/account";

export const metadata: Metadata = { title: "My profile" };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 font-medium">{title}</h2>
      {children}
    </section>
  );
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");
  const [profile, vehicles] = await Promise.all([getProfile(user.id), listVehicles()]);
  if (!profile) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
      <Card title="Account">
        <AccountForm email={user.email} profile={profile} />
        <div className="mt-4 flex flex-wrap gap-3 border-t border-zinc-100 pt-4 text-sm dark:border-zinc-800">
          <Link href="/reset-password" className="font-medium text-energy-700 hover:underline dark:text-energy-400">Change password</Link>
          <form action={signOut}><button className="font-medium text-zinc-600 hover:underline dark:text-zinc-300">Sign out</button></form>
        </div>
      </Card>
      <Card title="Preferences">
        <PreferencesForm profile={profile} vehicles={vehicles.map((v) => ({ id: v.id, label: vehicleLabel(v) }))} />
      </Card>
      <Card title="Privacy">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
          <li>Your vehicles, bookings, sessions and battery readings are visible only to you.</li>
          <li>Battery readings and manual sessions are stored as you entered them — we never present them as live data.</li>
          <li>Location is used in your browser to find nearby chargers and isn’t saved.</li>
        </ul>
        <DeleteAccountForm requested={profile.status === "deletion_requested"} />
      </Card>
    </div>
  );
}
