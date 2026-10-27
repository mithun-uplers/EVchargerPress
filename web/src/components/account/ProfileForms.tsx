"use client";

import { useActionState } from "react";
import { requestDeletion, savePreferences, saveProfile, type FormState } from "@/app/account/actions";
import { FormMessage, SubmitButton, inputCls } from "@/components/forms";

type P = { display_name: string | null; phone: string | null; distance_unit: string; email_reminders: boolean; share_location: boolean; preferred_vehicle_id: string | null };

export function AccountForm({ email, profile }: { email: string; profile: P }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfile, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">
        Email
        <input value={email} readOnly aria-readonly="true" className={`${inputCls} bg-zinc-50 text-zinc-500 dark:bg-zinc-900`} />
      </label>
      <label className="text-sm font-medium">
        Name
        <input name="display_name" maxLength={60} defaultValue={profile.display_name ?? ""} autoComplete="name" className={inputCls} />
      </label>
      <label className="text-sm font-medium">
        Mobile number <span className="font-normal text-zinc-500">(optional)</span>
        <input name="phone" type="tel" defaultValue={profile.phone ?? ""} placeholder="+91 98765 43210" autoComplete="tel" className={inputCls} />
        <span className="mt-1 block text-xs font-normal text-zinc-500">Not verified yet — SMS verification comes later.</span>
      </label>
      <div className="sm:col-span-2 space-y-3">
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Save account</SubmitButton>
      </div>
    </form>
  );
}

export function PreferencesForm({ profile, vehicles }: { profile: P; vehicles: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePreferences, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium">
        Preferred vehicle
        <select name="preferred_vehicle_id" defaultValue={profile.preferred_vehicle_id ?? ""} className={inputCls}>
          <option value="">None</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm font-medium">Distance unit</legend>
        <div className="mt-2 flex gap-4 text-sm">
          {["km", "mi"].map((u) => (
            <label key={u} className="flex items-center gap-2">
              <input type="radio" name="distance_unit" value={u} defaultChecked={profile.distance_unit === u} className="accent-emerald-600" />
              {u === "km" ? "Kilometres" : "Miles"}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="email_reminders" defaultChecked={profile.email_reminders} className="mt-0.5 h-4 w-4 accent-emerald-600" />
        <span>Email me booking confirmations and reminders</span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="share_location" defaultChecked={profile.share_location} className="mt-0.5 h-4 w-4 accent-emerald-600" />
        <span>
          Use my location to show nearby chargers
          <span className="block text-xs text-zinc-500">Your browser still asks for permission. We don’t store your location.</span>
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Save preferences</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm({ requested }: { requested: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestDeletion, null);
  if (requested && !state?.ok) {
    return <p className="text-sm text-amber-800 dark:text-amber-300">Deletion requested. Your data will be removed within 30 days.</p>;
  }
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        We’ll remove your profile, vehicles and battery readings within 30 days. Booking and payment records are kept anonymised for accounting.
      </p>
      <label className="block text-sm font-medium">
        Type DELETE to confirm
        <input name="confirm" autoComplete="off" className={inputCls} />
      </label>
      <FormMessage state={state} />
      <SubmitButton pending={pending} variant="danger">Request account deletion</SubmitButton>
    </form>
  );
}
