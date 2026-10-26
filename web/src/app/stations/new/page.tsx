import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createStation } from "@/app/actions";
import { LocationFields } from "@/components/LocationFields";
import { getCurrentUser } from "@/lib/supabase/server";
import { CONNECTOR_TYPES } from "@/lib/types";

export const metadata: Metadata = { title: "Add a station" };

const input = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function NewStationPage({ searchParams }: PageProps<"/stations/new">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/stations/new");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Add a charging station</h1>
      <p className="mt-1 text-sm text-zinc-500">Help other drivers find it. You can delete stations you add.</p>
      {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <form action={createStation} className="mt-6 space-y-6">
        <fieldset className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <legend className="px-1 text-sm font-medium">Location</legend>
          <label className="block text-sm font-medium">
            Station name
            <input name="name" required minLength={2} maxLength={120} className={input} />
          </label>
          <label className="block text-sm font-medium">
            Address
            <input name="address" required className={input} />
          </label>
          <label className="block text-sm font-medium">
            City
            <input name="city" required className={input} />
          </label>
          <LocationFields />
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <legend className="px-1 text-sm font-medium">Connectors</legend>
          <p className="text-xs text-zinc-500">Fill in at least one row. Leave unused rows on “—”.</p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_5rem] gap-2">
              <select name={`c${i}_type`} defaultValue={i === 0 ? "CCS2" : ""} className={input} aria-label="Connector type">
                <option value="">—</option>
                {CONNECTOR_TYPES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input name={`c${i}_kw`} inputMode="decimal" placeholder="kW" className={input} aria-label="Power kW" />
              <input name={`c${i}_qty`} inputMode="numeric" placeholder="Qty" defaultValue="1" className={input} aria-label="Quantity" />
            </div>
          ))}
        </fieldset>

        <fieldset className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900">
          <legend className="px-1 text-sm font-medium">Details (optional)</legend>
          <label className="text-sm font-medium">
            Operator
            <input name="operator" className={input} />
          </label>
          <label className="text-sm font-medium">
            Access
            <select name="access" className={input}>
              <option value="public">Public</option>
              <option value="restricted">Restricted (customers/tenants)</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Hours
            <input name="hours" placeholder="24x7" className={input} />
          </label>
          <label className="text-sm font-medium">
            Pricing
            <input name="price_info" placeholder="₹18/kWh" className={input} />
          </label>
        </fieldset>

        <button className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">Save station</button>
      </form>
    </div>
  );
}
