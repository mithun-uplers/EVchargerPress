import Link from "next/link";
import type { ReactNode } from "react";
import { VEHICLE_TYPE_LABEL } from "@/lib/vehicle-types";
import type { BatteryReading, Vehicle } from "@/server/account";
import { BatteryBar, VehicleArt } from "./VehicleVisuals";

export function VehicleCard({
  vehicle: v,
  latest,
  preferred,
  action,
  timeZone = "Asia/Kolkata",
  connected = null,
}: {
  vehicle: Vehicle;
  latest: BatteryReading | null;
  preferred: boolean;
  action?: ReactNode;
  timeZone?: string;
  connected?: { simulated: boolean } | null;
}) {
  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
      <Link href={`/vehicles/${v.id}`} className="block bg-gradient-to-br from-energy-50 to-white p-4 hover:from-energy-100 dark:from-energy-500/10 dark:to-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{v.nickname || `${v.make} ${v.model}`}</p>
            <p className="truncate text-sm text-zinc-500">
              {VEHICLE_TYPE_LABEL[v.vehicle_type]}{v.model_year ? ` · ${v.model_year}` : ""}{v.nickname ? ` · ${v.make} ${v.model}` : ""}
            </p>
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            {preferred && <span className="rounded-full bg-energy-600 px-2 py-0.5 text-xs font-medium text-white">Preferred</span>}
            {connected && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${connected.simulated ? "bg-charge-50 text-charge-600 ring-1 ring-inset ring-charge-200" : "bg-energy-100 text-energy-800"}`}>
                {connected.simulated ? "Simulated car" : "Connected"}
              </span>
            )}
          </span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <BatteryBar percent={latest?.soc_percent !== null && latest ? Number(latest.soc_percent) : null} recordedAt={latest?.recorded_at} timeZone={timeZone} size="sm"
              sourceLabel={latest?.source === "vehicle_api" ? (latest.is_simulated ? "Simulated car" : "From car") : "Manual"} />
          </div>
          <VehicleArt type={v.vehicle_type} className="h-14 w-auto shrink-0 text-energy-600" />
        </div>
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap gap-1.5">
          {v.vehicle_connectors.map((c) => (
            <span key={c.connector_type} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{c.connector_type}</span>
          ))}
          <span className="text-xs text-zinc-500">
            {[v.battery_capacity_kwh ? `${Number(v.battery_capacity_kwh)} kWh` : "Battery size not set", v.max_dc_kw ? `DC ${Number(v.max_dc_kw)} kW` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
        {action}
      </div>
    </li>
  );
}
