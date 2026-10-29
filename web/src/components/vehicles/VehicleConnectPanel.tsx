import { connectVehicleAction, disconnectVehicleAction, syncVehicleAction } from "@/app/vehicles/connect-actions";
import { LineChart } from "@/components/charging/VehicleVisuals";
import { PlugIcon } from "@/components/nav/icons";
import { secondsAgo } from "@/lib/live";
import { ui } from "@/lib/ui";
import { connectLabels, supportsCloudConnect } from "@/lib/vehicle-types";
import type { Telemetry, VehicleConnection } from "@/server/vehicle-connect";

export type ConnectNotice = { kind: "ok" | "error"; text: string } | null;

function sourceLabel(c: VehicleConnection, simulatedLabel: string) {
  if (c.provider === "simulator") return simulatedLabel;
  return c.mode === "simulated" ? "Smartcar · test vehicle" : "Smartcar · live";
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-[11px] text-zinc-500">{note}</dd>}
    </div>
  );
}

/** "Connected car/scooter/…": connect via Smartcar (cars) or the simulator, then show what the vehicle reports — always labelled. */
export function VehicleConnectPanel({
  vehicleId, vehicleType, connection, telemetry, smartcarAvailable, smartcarTestMode, notice, now, demo = false,
}: {
  vehicleId: string;
  vehicleType: string;
  connection: VehicleConnection | null;
  telemetry: Telemetry[];
  smartcarAvailable: boolean;
  smartcarTestMode: boolean;
  notice: ConnectNotice;
  now: number;
  demo?: boolean;
}) {
  const L = connectLabels(vehicleType);
  const cloudOk = supportsCloudConnect(vehicleType);
  const latest = telemetry[0] ?? null;
  const simulated = connection ? connection.provider === "simulator" || connection.mode === "simulated" : false;
  const soc24 = telemetry.filter((t) => t.soc_percent !== null && now - Date.parse(t.recorded_at) <= 24 * 3600_000).map((t) => ({ t: t.recorded_at, v: Number(t.soc_percent) }));

  return (
    <section id="connect" aria-labelledby="connect-h" className={`${ui.card} scroll-mt-20`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-energy-50 text-energy-700 dark:bg-energy-500/10 dark:text-energy-300"><PlugIcon className="h-5 w-5" /></span>
          <div>
            <h2 id="connect-h" className="font-semibold">{L.heading}</h2>
            <p className="text-sm text-zinc-500">
              {connection?.status === "active" || connection?.status === "error"
                ? `${sourceLabel(connection, L.simulated)}${connection.provider_make ? ` · ${connection.provider_make} ${connection.provider_model ?? ""}${connection.provider_year ? ` ${connection.provider_year}` : ""}` : ""}`
                : `Read battery, range, odometer, charging and location straight from your ${L.noun}.`}
            </p>
          </div>
        </div>
        {connection && (connection.status === "active" || connection.status === "error") && (
          <span className={`${ui.pill} ${connection.status === "error" ? "bg-rose-100 text-rose-800" : simulated ? "bg-charge-50 text-charge-600 ring-1 ring-inset ring-charge-200" : "bg-energy-100 text-energy-800"}`}>
            {connection.status === "error" ? "Sync problem" : simulated ? "Simulated" : "Live"}
          </span>
        )}
      </div>

      {notice && <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-3 ${notice.kind === "error" ? ui.error : ui.ok}`}>{notice.text}</p>}

      {!connection || connection.status === "pending" ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <form action={demo ? undefined : connectVehicleAction} className="flex flex-col rounded-2xl p-4 ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700">
            <input type="hidden" name="vehicle_id" value={vehicleId} />
            <input type="hidden" name="provider" value="smartcar" />
            <p className="font-semibold">Connect with Smartcar</p>
            <p className="mt-1 flex-1 text-sm text-zinc-500">
              {cloudOk ? (
                <>
                  Sign in with your car brand’s account (Tesla, BMW, Hyundai, Kia, Ford, VW and more). You choose what to share and can disconnect any time.
                  {smartcarTestMode ? " This server uses Smartcar test mode: you’ll connect a virtual car." : ""}
                </>
              ) : (
                <>Smartcar connects cars only. Two-wheeler and e-bike makers don’t offer a public data connection that apps can use yet, so this isn’t available for your {L.noun}.</>
              )}
            </p>
            <button disabled={!smartcarAvailable || !cloudOk} className={`mt-3 ${ui.btn} disabled:cursor-not-allowed`}>
              {!cloudOk ? "Not available for this vehicle" : smartcarAvailable ? L.connect : "Not set up yet"}
            </button>
            {cloudOk && !smartcarAvailable && <p className="mt-2 text-xs text-zinc-500">An admin needs to add the Smartcar keys to the server (see docs/VEHICLE_CONNECT.md).</p>}
            {connection?.status === "pending" && <p className="mt-2 text-xs text-charge-600">A connection was started but not finished — try again.</p>}
          </form>
          <form action={demo ? undefined : connectVehicleAction} className="flex flex-col rounded-2xl p-4 ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700">
            <input type="hidden" name="vehicle_id" value={vehicleId} />
            <input type="hidden" name="provider" value="simulator" />
            <p className="font-semibold">{L.useSimulated}</p>
            <p className="mt-1 flex-1 text-sm text-zinc-500">
              For testing: a virtual {L.noun} reports battery %, range, odometer and location every 5 minutes, and follows live charging sessions. Everything is labelled “Simulated”.
            </p>
            <button className={`mt-3 ${ui.btnLight}`}>{L.connectSimulated}</button>
          </form>
          <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 sm:col-span-2 dark:bg-zinc-800/60 dark:text-zinc-300">
            <p className="font-semibold text-zinc-800 dark:text-zinc-100">How the connection works</p>
            <p className="mt-1">
              Over the internet, not Bluetooth: Smartcar reads your car’s data from the car maker’s cloud after you sign in with your brand account, so it works even when you’re away from the vehicle.
              Many Indian brands (for example Tata, MG and Mahindra) and two-wheeler makers don’t offer a public data API yet — until they do, add battery readings manually or use the battery % a connected charger reports during live sessions.
            </p>
          </div>
        </div>
      ) : (
        <>
          {latest ? (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                <Stat label="Battery" value={latest.soc_percent !== null ? `${Math.round(Number(latest.soc_percent))}%` : "—"} />
                <Stat label="Range" value={latest.range_km !== null ? `${Math.round(Number(latest.range_km))} km` : "—"} note={`as reported by the ${L.noun}`} />
                <Stat label="Odometer" value={latest.odometer_km !== null ? `${Number(latest.odometer_km).toLocaleString("en-IN")} km` : "—"} />
                <Stat
                  label="Charging"
                  value={latest.is_charging ? "Charging" : latest.is_plugged_in ? "Plugged in" : latest.is_charging === false ? "Not charging" : "—"}
                  note={latest.is_charging && latest.charge_power_kw !== null ? `${Number(latest.charge_power_kw)} kW` : undefined}
                />
                <Stat label="Charge limit" value={latest.charge_limit_percent !== null ? `${Number(latest.charge_limit_percent)}%` : "—"} />
                <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                  <dt className="text-xs text-zinc-500">Location</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {latest.latitude !== null && latest.longitude !== null ? (
                      <a href={`https://www.openstreetmap.org/?mlat=${latest.latitude}&mlon=${latest.longitude}#map=15/${latest.latitude}/${latest.longitude}`} target="_blank" rel="noreferrer" className={ui.link}>
                        {Number(latest.latitude).toFixed(4)}, {Number(latest.longitude).toFixed(4)}
                      </a>
                    ) : "—"}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-zinc-500">
                {simulated ? `Simulated data for testing — not your real ${L.noun}.` : `Reported by your ${L.noun} through Smartcar.`} Updated {secondsAgo(latest.recorded_at, now)}.
                {connection.last_error ? ` Last sync problem: ${connection.last_error}` : ""}
              </p>
              {soc24.length > 1 && (
                <div className="mt-4">
                  <h3 className="mb-1 text-sm text-zinc-500">Battery, last 24 hours</h3>
                  <LineChart points={soc24} label="Battery percentage reported by the car, last 24 hours" format={(v) => `${Math.round(v)}%`} min={0} max={100} />
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Connected — waiting for the first reading from the {L.noun}.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {connection.provider === "smartcar" && (
              <form action={demo ? undefined : syncVehicleAction}>
                <input type="hidden" name="connection_id" value={connection.id} />
                <input type="hidden" name="vehicle_id" value={vehicleId} />
                <button className={ui.btn}>Sync now</button>
              </form>
            )}
            <form action={demo ? undefined : disconnectVehicleAction}>
              <input type="hidden" name="connection_id" value={connection.id} />
              <input type="hidden" name="vehicle_id" value={vehicleId} />
              <button className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:ring-rose-500/30 dark:hover:bg-rose-500/20">Disconnect</button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
