"use client";

import { useActionState } from "react";
import { registerChargePointAction, type RegisterState } from "@/app/admin/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { ui } from "@/lib/ui";

/** Registers a real OCPP charger. The secret is shown once here and never stored in plain text. */
export function RegisterChargerForm({ stations }: { stations: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerChargePointAction, null);
  return (
    <div className="space-y-3">
      <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm font-medium">Station
          <select name="station_id" required defaultValue="" className={ui.input}>
            <option value="" disabled>Pick a station</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Charger ID (chargeBoxIdentity)
          <input name="identity" required pattern="[A-Za-z0-9._\-]{3,48}" placeholder="CP-PUNE-01" className={ui.input} />
        </label>
        <SubmitButton pending={pending}>Register charger</SubmitButton>
      </form>
      <FormMessage state={state?.error ? { error: state.error } : null} />
      {state?.secret && (
        <div role="status" className="space-y-2 rounded-xl bg-charge-50 p-3 text-sm ring-1 ring-inset ring-charge-200 dark:bg-charge-500/10 dark:ring-charge-500/30">
          <p className="font-semibold">Charger {state.identity} registered. Copy its secret now — it won’t be shown again.</p>
          <code className="block select-all break-all rounded-lg bg-white px-3 py-2 font-mono text-xs dark:bg-zinc-950">{state.secret}</code>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Configure the charger (or the OCPP gateway) with this ID and secret. Registering the same ID again issues a new secret and the old one stops working.
            Then link the charger to a charging point on the station page.
          </p>
        </div>
      )}
    </div>
  );
}
