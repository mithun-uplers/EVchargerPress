import Link from "next/link";
import { setChargePointActiveAction } from "@/app/admin/actions";
import { AdminHeader, Empty, Flash, Pill, TableCard, td, th } from "@/components/admin/AdminUI";
import { RegisterChargerForm } from "@/components/admin/RegisterChargerForm";
import { formatLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import { chargePoints, requireAdmin } from "@/server/admin";

export const metadata = { title: "Live chargers" };
export const dynamic = "force-dynamic";

const ago = (iso: string | null, now: number) => {
  if (!iso) return "never";
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default async function AdminChargers({ searchParams }: PageProps<"/admin/chargers">) {
  await requireAdmin("/admin/chargers");
  const sp = await searchParams;
  const [cps, stations] = await Promise.all([
    chargePoints(),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase.from("stations").select("id,name").neq("data_source", "openstreetmap").order("name").limit(500);
      return (data ?? []) as { id: string; name: string }[];
    })(),
  ]);
  const now = new Date().getTime();
  const online = cps.filter((c) => c.is_online).length;
  const sim = cps.filter((c) => c.is_simulated).length;
  return (
    <div className="space-y-5">
      <AdminHeader
        title="Live chargers"
        subtitle={<>{online} of {cps.length} online (heartbeat in the last 5 minutes){sim ? ` · ${sim} run by the built-in simulator` : ""}. Refresh the page for the latest status.</>}
      />
      <Flash sp={sp} />
      {cps.length === 0 ? (
        <Empty>No chargers registered yet.</Empty>
      ) : (
        <TableCard caption="Registered chargers">
          <thead className="border-b border-zinc-100 dark:border-zinc-800">
            <tr><th className={th}>Charger</th><th className={th}>Station</th><th className={th}>Last heartbeat</th><th className={th}>Points</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {cps.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  <span className="font-mono text-xs font-semibold">{c.identity}</span>
                  <span className="block text-xs text-zinc-500">{[c.vendor, c.model, c.firmware_version && `fw ${c.firmware_version}`].filter(Boolean).join(" · ") || c.network_name}</span>
                </td>
                <td className={td}><Link className="hover:underline" href={`/admin/stations/${c.station_id}#evses`}>{c.station_name}</Link></td>
                <td className={`${td} whitespace-nowrap`}>
                  {ago(c.last_heartbeat_at, now)}
                  {c.last_heartbeat_at && <span className="block text-xs text-zinc-500">{formatLocal(c.last_heartbeat_at, "Asia/Kolkata", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })} IST</span>}
                </td>
                <td className={`${td} tabular-nums`}>{c.evse_count} linked{c.charging_count ? ` · ${c.charging_count} charging` : ""}</td>
                <td className={`${td} space-x-1 space-y-1`}>
                  {!c.is_active ? <Pill tone="red">Disabled</Pill> : c.is_online ? <Pill tone="green">Online</Pill> : <Pill>Offline</Pill>}
                  {c.is_simulated && <Pill tone="amber">Simulated</Pill>}
                </td>
                <td className={`${td} text-right`}>
                  <form action={setChargePointActiveAction}>
                    <input type="hidden" name="charge_point_id" value={c.id} />
                    <input type="hidden" name="active" value={c.is_active ? "false" : "true"} />
                    <input type="hidden" name="back" value="/admin/chargers" />
                    <button className={`min-h-10 text-sm font-medium hover:underline ${c.is_active ? "text-rose-600" : "text-energy-700 dark:text-energy-400"}`}>{c.is_active ? "Disable" : "Enable"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
      <section className={`${ui.card} space-y-3`} aria-labelledby="reg-h">
        <div>
          <h2 id="reg-h" className="font-semibold">Register a charger</h2>
          <p className="mt-1 text-sm text-zinc-500">For real OCPP 1.6J chargers that connect through the gateway in <code>tools/ocpp-gateway</code>. Live status shown to drivers comes only from connected chargers.</p>
        </div>
        <RegisterChargerForm stations={stations} />
      </section>
    </div>
  );
}
