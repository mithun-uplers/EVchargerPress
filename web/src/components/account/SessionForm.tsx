"use client";

import { useActionState } from "react";
import { addManualSession, type FormState } from "@/app/account/actions";
import { FormMessage, SubmitButton, TzOffsetField, inputCls } from "@/components/forms";

export function SessionForm({
  vehicles,
  bookings,
}: {
  vehicles: { id: string; label: string }[];
  bookings: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addManualSession, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <TzOffsetField />
      <label className="text-sm font-medium">
        Started
        <input name="started_at" type="datetime-local" required className={inputCls} />
      </label>
      <label className="text-sm font-medium">
        Duration (minutes)
        <input name="duration_min" inputMode="numeric" required placeholder="45" className={inputCls} />
      </label>
      <label className="text-sm font-medium">
        Energy (kWh) <span className="font-normal text-zinc-500">from the charger or receipt</span>
        <input name="energy_kwh" inputMode="decimal" placeholder="24.6" className={inputCls} />
      </label>
      <label className="text-sm font-medium">
        Amount paid (₹)
        <input name="total_cost" inputMode="decimal" placeholder="520" className={inputCls} />
      </label>
      <label className="text-sm font-medium">
        Vehicle
        <select name="vehicle_id" className={inputCls}>
          <option value="">—</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Linked booking <span className="font-normal text-zinc-500">(optional)</span>
        <select name="booking_id" className={inputCls}>
          <option value="">None</option>
          {bookings.map((b) => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Notes
        <input name="notes" maxLength={500} placeholder="e.g. Charger 2 was slow" className={inputCls} />
      </label>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Save session</SubmitButton>
      </div>
    </form>
  );
}
