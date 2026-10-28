"use client";

import { useState } from "react";
import { inputCls } from "@/components/forms";

export type RouteFormDefaults = {
  from: string;
  to: string;
  vehicleId: string;
  soc: string;
  reserve: string;
  consumption: string;
  consumptionHint: string | null;
};

export function RouteForm({ vehicles, d, action = "/route" }: { vehicles: { id: string; label: string; batteryKwh: number | null }[]; d: RouteFormDefaults; action?: string }) {
  const [from, setFrom] = useState(d.from);
  const [msg, setMsg] = useState<string | null>(null);
  function locate() {
    if (!navigator.geolocation) return setMsg("Location isn’t available in this browser.");
    setMsg("Locating…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setFrom(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`);
        setMsg(null);
      },
      () => setMsg("Couldn’t get your location — type a place instead."),
      { timeout: 10_000 },
    );
  }
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium">
        From
        <input name="from" required value={from} onChange={(e) => setFrom(e.target.value)} placeholder="City, address or lat, lng" className={inputCls} />
      </label>
      <button type="button" onClick={locate} className="text-sm font-medium text-energy-700 hover:underline dark:text-energy-400">Use my location</button>
      {msg && <p className="text-xs text-zinc-500">{msg}</p>}
      <label className="block text-sm font-medium">
        To
        <input name="to" required defaultValue={d.to} placeholder="e.g. Surat, Gujarat" className={inputCls} />
      </label>
      <label className="block text-sm font-medium">
        Vehicle
        <select name="vehicle" defaultValue={d.vehicleId} required className={inputCls}>
          {vehicles.length === 0 && <option value="">Add a vehicle first</option>}
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.label}{v.batteryKwh ? ` · ${v.batteryKwh} kWh` : " · battery size not set"}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">
          Battery now (%)
          <input name="soc" required inputMode="numeric" defaultValue={d.soc} placeholder="80" className={inputCls} />
        </label>
        <label className="block text-sm font-medium">
          Arrive with at least (%)
          <input name="reserve" inputMode="numeric" defaultValue={d.reserve} placeholder="15" className={inputCls} />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Consumption (kWh/100 km)
        <input name="consumption" required inputMode="decimal" defaultValue={d.consumption} placeholder="e.g. 14" className={inputCls} />
        {d.consumptionHint && <span className="mt-1 block text-xs font-normal text-zinc-500">{d.consumptionHint}</span>}
      </label>
      <button className="min-h-11 w-full rounded-xl bg-energy-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-energy-700">Plan route</button>
    </form>
  );
}
