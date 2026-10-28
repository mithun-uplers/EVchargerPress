"use client";

import { useActionState, useState } from "react";
import { saveVehicle, type FormState } from "@/app/account/actions";
import { FormMessage, SubmitButton, inputCls } from "@/components/forms";
import { VEHICLE_TYPE_LABEL } from "@/lib/vehicle-types";
import { CONNECTOR_TYPES } from "@/lib/types";
import type { Vehicle } from "@/server/account";


const HINT: Record<string, string> = {
  CCS2: "DC fast charging — most new cars in India",
  "Type 2": "AC charging — most cars and some 2-wheelers",
  CHAdeMO: "DC — older Nissan / Kia",
  "Bharat DC-001": "Low-voltage DC — some older cars",
  "Bharat AC-001": "Low-power AC — older fleet vehicles",
  "15A Socket": "Home-style plug — scooters, e-bikes, portable chargers",
  "GB/T": "Chinese standard",
  NACS: "Tesla / North American standard",
  CCS1: "North American DC",
  "Type 1": "Older Japanese/US AC",
  Other: "Proprietary or another standard",
};

export function VehicleForm({ vehicle, back }: { vehicle?: Vehicle; back?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveVehicle, null);
  const current = new Map((vehicle?.vehicle_connectors ?? []).map((c) => [c.connector_type, c.supported_power_kw]));
  const [selected, setSelected] = useState<Set<string>>(new Set(current.keys()));

  function toggle(t: string) {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setSelected(next);
  }

  return (
    <form action={action} className="space-y-6">
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
      {back && <input type="hidden" name="back" value={back} />}

      <fieldset className="grid gap-4 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 p-4 sm:grid-cols-2 dark:bg-zinc-900 dark:ring-zinc-800">
        <legend className="px-1 text-sm font-medium">Vehicle</legend>
        <label className="text-sm font-medium sm:col-span-2">
          Type
          <select name="vehicle_type" required defaultValue={vehicle?.vehicle_type ?? "car"} className={inputCls}>
            {Object.entries(VEHICLE_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Make
          <input name="make" required maxLength={60} defaultValue={vehicle?.make} placeholder="Tata" className={inputCls} />
        </label>
        <label className="text-sm font-medium">
          Model
          <input name="model" required maxLength={60} defaultValue={vehicle?.model} placeholder="Nexon EV" className={inputCls} />
        </label>
        <label className="text-sm font-medium">
          Model year <span className="font-normal text-zinc-500">(optional)</span>
          <input name="model_year" inputMode="numeric" pattern="[0-9]{4}" defaultValue={vehicle?.model_year ?? ""} placeholder="2024" className={inputCls} />
        </label>
        <label className="text-sm font-medium">
          Nickname <span className="font-normal text-zinc-500">(optional)</span>
          <input name="nickname" maxLength={40} defaultValue={vehicle?.nickname ?? ""} placeholder="Family car" className={inputCls} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Registration <span className="font-normal text-zinc-500">(optional, shown only to you)</span>
          <input name="registration_label" maxLength={20} defaultValue={vehicle?.registration_label ?? ""} placeholder="GJ 01 AB 1234" className={inputCls} />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 p-4 sm:grid-cols-3 dark:bg-zinc-900 dark:ring-zinc-800">
        <legend className="px-1 text-sm font-medium">Battery and charging</legend>
        <p className="text-xs text-zinc-500 sm:col-span-3">Leave blank if you don’t know — we never guess specs. They improve price and time estimates.</p>
        <label className="text-sm font-medium">
          Usable battery (kWh)
          <input name="battery_capacity_kwh" inputMode="decimal" defaultValue={vehicle?.battery_capacity_kwh ?? ""} placeholder="40.5" className={inputCls} />
        </label>
        <label className="text-sm font-medium">
          Max AC charging (kW)
          <input name="max_ac_kw" inputMode="decimal" defaultValue={vehicle?.max_ac_kw ?? ""} placeholder="7.2" className={inputCls} />
        </label>
        <label className="text-sm font-medium">
          Max DC charging (kW)
          <input name="max_dc_kw" inputMode="decimal" defaultValue={vehicle?.max_dc_kw ?? ""} placeholder="50" className={inputCls} />
        </label>
      </fieldset>

      <fieldset className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 p-4 dark:bg-zinc-900 dark:ring-zinc-800">
        <legend className="px-1 text-sm font-medium">Connectors your vehicle can use</legend>
        <p className="text-xs text-zinc-500">Pick every plug your vehicle accepts (directly or with the cable you carry). Bookings only show chargers that match.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {CONNECTOR_TYPES.map((t) => {
            const on = selected.has(t);
            return (
              <div key={t} className={`rounded-lg border p-3 ${on ? "border-energy-600 bg-energy-50/50 dark:bg-energy-500/5" : "border-zinc-200 dark:border-zinc-800"}`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" name="connector_types" value={t} checked={on} onChange={() => toggle(t)} className="mt-1 h-4 w-4 accent-energy-600" />
                  <span>
                    <span className="block text-sm font-medium">{t}</span>
                    <span className="block text-xs text-zinc-500">{HINT[t]}</span>
                  </span>
                </label>
                {on && (
                  <label className="mt-2 block pl-7 text-xs text-zinc-600 dark:text-zinc-300">
                    Max power on this plug (kW, optional)
                    <input name={`power_${t}`} inputMode="decimal" defaultValue={current.get(t) ?? ""} className={`${inputCls} min-h-9 py-1`} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <FormMessage state={state} />
      <div className="flex gap-3">
        <SubmitButton pending={pending}>{vehicle ? "Save changes" : "Add vehicle"}</SubmitButton>
      </div>
    </form>
  );
}
