"use client";

import { useActionState } from "react";
import { addBatteryReading, removeVehicle, type FormState } from "@/app/account/actions";
import { FormMessage, SubmitButton, TzOffsetField, inputCls } from "@/components/forms";

export function BatteryReadingForm({ vehicleId }: { vehicleId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addBatteryReading, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <TzOffsetField />
      <label className="text-sm font-medium">
        Battery %
        <input name="soc_percent" inputMode="decimal" placeholder="64" className={inputCls} />
      </label>
      <label className="text-sm font-medium">
        Odometer (km)
        <input name="odometer_km" inputMode="decimal" placeholder="12450" className={inputCls} />
      </label>
      <label className="text-sm font-medium">
        When <span className="font-normal text-zinc-500">(default now)</span>
        <input name="recorded_at" type="datetime-local" className={inputCls} />
      </label>
      <SubmitButton pending={pending}>Add reading</SubmitButton>
      <div className="sm:col-span-4"><FormMessage state={state} /></div>
    </form>
  );
}

export function RemoveVehicleButton({ vehicleId }: { vehicleId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(removeVehicle, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Remove this vehicle? Past bookings and history keep their record.")) e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="id" value={vehicleId} />
      <button disabled={pending} className="min-h-10 rounded-lg px-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:opacity-60 dark:text-rose-300 dark:ring-rose-500/30">
        {pending ? "Removing…" : "Remove vehicle"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
