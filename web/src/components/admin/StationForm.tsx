import { LocationFields } from "@/components/LocationFields";
import type { StationDetail } from "@/server/admin";
import { ui } from "@/lib/ui";

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York"];

/** Station details fields, shared by "new" and "edit". */
export function StationFields({ s }: { s?: StationDetail["station"] }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">
          Station name
          <input name="name" required minLength={2} maxLength={120} defaultValue={s?.name} className={ui.input} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Address
          <input name="address" required defaultValue={s?.address ?? ""} className={ui.input} />
        </label>
        <label className="text-sm font-medium">
          City
          <input name="city" required defaultValue={s?.city ?? ""} className={ui.input} />
        </label>
        <label className="text-sm font-medium">
          State
          <input name="state" defaultValue={s?.state ?? ""} className={ui.input} />
        </label>
        <label className="text-sm font-medium">
          Postal code
          <input name="postal_code" defaultValue={s?.postal_code ?? ""} className={ui.input} />
        </label>
        <label className="text-sm font-medium">
          Time zone
          <select name="time_zone" defaultValue={s?.time_zone ?? "Asia/Kolkata"} className={ui.input}>
            {[...new Set([s?.time_zone ?? "Asia/Kolkata", ...ZONES])].map((z) => <option key={z}>{z}</option>)}
          </select>
        </label>
      </div>
      <LocationFields defaultLat={s?.lat} defaultLng={s?.lng} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Operator
          <input name="operator" defaultValue={s?.operator ?? ""} className={ui.input} />
        </label>
        <label className="text-sm font-medium">
          Access
          <select name="access" defaultValue={s?.access ?? "public"} className={ui.input}>
            <option value="public">Public</option>
            <option value="restricted">Restricted (customers or tenants)</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Hours (shown as text)
          <input name="hours" placeholder="24x7" defaultValue={s?.hours ?? ""} className={ui.input} />
        </label>
        <label className="text-sm font-medium">
          Price note (shown as text)
          <input name="price_info" placeholder="₹18/kWh" defaultValue={s?.price_info ?? ""} className={ui.input} />
        </label>
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" name="is_verified" defaultChecked={s?.is_verified ?? true} className="mt-0.5 h-5 w-5 accent-energy-600" />
        <span>
          <span className="font-medium">Verified by EVChargePress</span>
          <span className="block text-xs text-zinc-500">Tick only when the location and connectors were checked with the operator or on site.</span>
        </span>
      </label>
    </>
  );
}
