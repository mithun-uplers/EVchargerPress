import Link from "next/link";
import { createStationAction } from "@/app/admin/actions";
import { AdminHeader, Flash } from "@/components/admin/AdminUI";
import { StationFields } from "@/components/admin/StationForm";
import { CONNECTOR_TYPES } from "@/lib/types";
import { ui } from "@/lib/ui";
import { requireAdmin } from "@/server/admin";

export const metadata = { title: "Add a station" };

export default async function NewStationPage({ searchParams }: PageProps<"/admin/stations/new">) {
  await requireAdmin("/admin/stations/new");
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <AdminHeader title="Add a station" subtitle="Only admins can add stations. Charging points, hours, rules and a tariff come next." actions={<Link href="/admin/stations" className={ui.btnLight}>Back to stations</Link>} />
      <Flash sp={sp} />
      <form action={createStationAction} className="space-y-5">
        <fieldset className={`${ui.card} space-y-4`}>
          <legend className="sr-only">Station details</legend>
          <h2 className="font-semibold">Details</h2>
          <StationFields />
        </fieldset>
        <fieldset className={`${ui.card} space-y-3`}>
          <legend className="sr-only">Connectors</legend>
          <h2 className="font-semibold">Connectors</h2>
          <p className="text-xs text-zinc-500">Fill in at least one row. Leave unused rows on “—”. You can link them to charging points afterwards.</p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grid grid-cols-[1fr_5.5rem_4.5rem] gap-2">
              <select name={`c${i}_type`} defaultValue={i === 0 ? "CCS2" : ""} className={ui.input} aria-label={`Connector ${i + 1} type`}>
                <option value="">—</option>
                {CONNECTOR_TYPES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input name={`c${i}_kw`} inputMode="decimal" placeholder="kW" className={ui.input} aria-label={`Connector ${i + 1} power in kW`} />
              <input name={`c${i}_qty`} inputMode="numeric" placeholder="Qty" defaultValue="1" className={ui.input} aria-label={`Connector ${i + 1} quantity`} />
            </div>
          ))}
        </fieldset>
        <button className={`${ui.btn} w-full`}>Create station</button>
      </form>
    </div>
  );
}
