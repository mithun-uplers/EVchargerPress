import Link from "next/link";
import type { ReactNode } from "react";
import {
  addConnectorAction,
  deleteStationAction,
  removeConnectorAction,
  saveEvseAction,
  saveHoursAction,
  saveRulesAction,
  saveTariffAction,
  updateStationAction,
} from "@/app/admin/actions";
import { AdminHeader, Flash, Pill } from "@/components/admin/AdminUI";
import { StationFields } from "@/components/admin/StationForm";
import { WEEKDAYS, formatLocal, formatMoney } from "@/lib/format";
import { CONNECTOR_TYPES } from "@/lib/types";
import { ui } from "@/lib/ui";
import type { StationDetail } from "@/server/admin";


const RULES: { key: string; label: string; hint: string; def: number }[] = [
  { key: "min_duration_min", label: "Shortest booking (min)", hint: "Multiple of the slot step", def: 30 },
  { key: "max_duration_min", label: "Longest booking (min)", hint: "Up to 720", def: 120 },
  { key: "buffer_min", label: "Gap after each booking (min)", hint: "Time to unplug and leave", def: 10 },
  { key: "lead_time_min", label: "Book at least (min) ahead", hint: "", def: 15 },
  { key: "max_advance_days", label: "Book up to (days) ahead", hint: "1–90", def: 14 },
  { key: "hold_minutes", label: "Hold a slot for (min)", hint: "While the driver confirms", def: 10 },
  { key: "free_cancel_until_min", label: "Free cancellation until (min before)", hint: "Then the reservation fee applies", def: 60 },
  { key: "check_in_early_min", label: "Check-in opens (min before)", hint: "", def: 15 },
  { key: "no_show_grace_min", label: "No-show after (min late)", hint: "", def: 15 },
  { key: "max_active_per_user", label: "Active bookings per driver", hint: "1–20", def: 3 },
];
const PRICES: { key: string; label: string; unit: string }[] = [
  { key: "energy_kwh", label: "Energy", unit: "per kWh" },
  { key: "time_min", label: "Time", unit: "per minute" },
  { key: "session_fixed", label: "Session fee", unit: "per session" },
  { key: "reservation_fixed", label: "Reservation fee", unit: "per booking, paid on confirm" },
  { key: "idle_min", label: "Idle fee", unit: "per minute after charging ends" },
];
const LIVE_TONE: Record<string, "green" | "amber" | "red" | "zinc" | "blue"> = {
  available: "green", charging: "blue", preparing: "amber", finishing: "amber", reserved: "amber", suspended_ev: "amber", suspended_evse: "amber", unavailable: "zinc", faulted: "red",
};

function Section({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`${ui.card} scroll-mt-20 space-y-4`}>
      <div>
        <h2 id={`${id}-h`} className="font-semibold">{title}</h2>
        {note && <p className="mt-1 text-sm text-zinc-500">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Check({ ok, label, href }: { ok: boolean; label: string; href: string }) {
  return (
    <li>
      <a href={href} className="flex min-h-10 items-center gap-2 text-sm hover:underline">
        <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-energy-600 text-white" : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700"}`}>{ok ? "✓" : "–"}</span>
        <span className={ok ? "" : "text-zinc-500"}>{label}</span>
        <span className="sr-only">{ok ? "(done)" : "(missing)"}</span>
      </a>
    </li>
  );
}

const hidden = (id: string) => <input type="hidden" name="station_id" value={id} />;
const hhmm = (t: string) => t.slice(0, 5);

export function StationManageView({ d, sp }: { d: StationDetail; sp: Record<string, string | string[] | undefined> }) {
  const { station: s, evses, connectors, hours, rules, tariff, chargePoints } = d;
  const tz = s.time_zone;
  const bookableEvses = evses.filter((e) => e.is_bookable && e.is_active).length;
  const ready = { evses: bookableEvses > 0, hours: hours.length > 0, rules: !!rules, tariff: !!tariff };
  const isBookable = ready.evses && ready.hours && ready.rules && ready.tariff;
  const byDay = new Map(hours.map((h) => [h.weekday, h]));
  const price = (k: string) => tariff?.components.find((c) => c.type === k)?.price_minor;

  return (
    <div className="space-y-5">
      <AdminHeader
        title={s.name}
        subtitle={<>{[s.address, s.city].filter(Boolean).join(", ")} · {s.data_source === "openstreetmap" ? "From OpenStreetMap" : s.data_source === "demo" ? "Demo station" : "Added by EVChargePress"}</>}
        actions={
          <>
            <Link href={`/stations/${s.id}`} className={ui.btnLight}>View public page</Link>
            <Link href="/admin/stations" className={ui.btnLight}>All stations</Link>
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        {isBookable ? <Pill tone="green">Taking bookings</Pill> : <Pill>Not bookable yet</Pill>}
        {s.is_verified ? <Pill tone="blue">Verified{s.verified_at ? ` · ${formatLocal(s.verified_at, tz, { day: "numeric", month: "short", year: "numeric" })}` : ""}</Pill> : <Pill tone="amber">Not verified</Pill>}
        {s.is_demo && <Pill>Demo data</Pill>}
      </div>
      <Flash sp={sp} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-5">
          <Section id="details" title="Station details">
            <form action={updateStationAction} className="space-y-4">
              {hidden(s.id)}
              <StationFields s={s} />
              <button className={ui.btn}>Save details</button>
            </form>
          </Section>

          <Section id="evses" title="Charging points" note="Each charging point (EVSE) is one place a car can charge. Only active, bookable points take bookings.">
            {evses.length === 0 && <p className="text-sm text-zinc-500">No charging points yet.</p>}
            <ul className="space-y-3">
              {evses.map((e) => (
                <li key={e.id} className="rounded-xl p-3 ring-1 ring-zinc-200 dark:ring-zinc-800">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{e.label}</span>
                    {e.live_status ? (
                      <Pill tone={LIVE_TONE[e.live_status] ?? "zinc"}>
                        {e.live_status.replaceAll("_", " ")}{e.live_is_simulated ? " · simulated" : ""}
                      </Pill>
                    ) : (
                      <Pill>No live status</Pill>
                    )}
                    {e.live_status_at && <span className="text-xs text-zinc-500">as of {formatLocal(e.live_status_at, tz, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", hourCycle: "h23" })}</span>}
                  </div>
                  <EvseForm stationId={s.id} e={e} chargePoints={chargePoints} />
                </li>
              ))}
            </ul>
            <details className="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-energy-700 dark:text-energy-400">Add a charging point</summary>
              <div className="pt-2"><EvseForm stationId={s.id} chargePoints={chargePoints} suggestUid={`E${evses.length + 1}`} /></div>
            </details>
          </Section>

          <Section id="connectors" title="Connectors" note="Plug types drivers see and match against their car.">
            {connectors.length === 0 ? (
              <p className="text-sm text-zinc-500">No connectors.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {connectors.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{c.type}</span>
                      {c.power_kw ? ` · ${Number(c.power_kw)} kW` : ""} · ×{c.quantity}
                      <span className="text-zinc-500"> · {c.evse_id ? `on ${evses.find((e) => e.id === c.evse_id)?.label ?? "charging point"}` : "not linked to a charging point"}</span>
                    </span>
                    <form action={removeConnectorAction}>
                      {hidden(s.id)}
                      <input type="hidden" name="connector_id" value={c.id} />
                      <button className="min-h-10 px-2 text-sm font-medium text-rose-600 hover:underline">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addConnectorAction} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_5rem_1fr_auto] sm:items-end">
              {hidden(s.id)}
              <label className="text-xs font-medium">Type
                <select name="type" defaultValue="CCS2" className={ui.input}>{CONNECTOR_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              </label>
              <label className="text-xs font-medium">kW<input name="power_kw" inputMode="decimal" className={ui.input} /></label>
              <label className="text-xs font-medium">Qty<input name="quantity" inputMode="numeric" defaultValue="1" className={ui.input} /></label>
              <label className="text-xs font-medium">Charging point
                <select name="evse_id" defaultValue="" className={ui.input}>
                  <option value="">Not linked</option>
                  {evses.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
              </label>
              <button className={`${ui.btnLight} col-span-2 sm:col-span-1`}>Add connector</button>
            </form>
          </Section>

          <Section id="hours" title="Opening hours" note={`Station local time (${tz}). Bookings are only offered inside these hours. Use 24:00 for midnight.`}>
            <form action={saveHoursAction} className="space-y-2">
              {hidden(s.id)}
              {WEEKDAYS.map((day, i) => {
                const h = byDay.get(i);
                return (
                  <div key={day} className="grid grid-cols-[5.5rem_1fr_1fr] items-center gap-2">
                    <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                      <input type="checkbox" name={`d${i}_open`} defaultChecked={hours.length === 0 || !!h} className="h-5 w-5 accent-energy-600" />
                      {day}
                    </label>
                    <input name={`d${i}_from`} defaultValue={h ? hhmm(h.opens_at) : "00:00"} pattern="([01]\d|2[0-3]):[0-5]\d" aria-label={`${day} opens`} className={`${ui.input} mt-0`} />
                    <input name={`d${i}_to`} defaultValue={h ? (hhmm(h.closes_at) === "00:00" ? "24:00" : hhmm(h.closes_at)) : "24:00"} pattern="([01]\d|2[0-3]):[0-5]\d|24:00" aria-label={`${day} closes`} className={`${ui.input} mt-0`} />
                  </div>
                );
              })}
              <p className="text-xs text-zinc-500">One opening span per day. Untick a day to close it.</p>
              <button className={ui.btn}>Save hours</button>
            </form>
          </Section>

          <Section id="rules" title="Booking rules" note={rules ? undefined : "Not set yet — saving these defaults lets the station take bookings."}>
            <form action={saveRulesAction} className="space-y-4">
              {hidden(s.id)}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">Slot step (min)
                  <select name="slot_step_min" defaultValue={String(rules?.slot_step_min ?? 15)} className={ui.input}>
                    {[5, 10, 15, 20, 30, 60].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </label>
                {RULES.map((r) => (
                  <label key={r.key} className="text-sm font-medium">
                    {r.label}
                    <input name={r.key} inputMode="numeric" defaultValue={String(rules?.[r.key] ?? r.def)} className={ui.input} />
                    {r.hint && <span className="mt-0.5 block text-xs font-normal text-zinc-500">{r.hint}</span>}
                  </label>
                ))}
              </div>
              <button className={ui.btn}>Save rules</button>
            </form>
          </Section>

          <Section
            id="tariff"
            title="Tariff"
            note={tariff ? <>Current: <strong>{tariff.name}</strong> since {formatLocal(tariff.valid_from, tz, { day: "numeric", month: "short", year: "numeric" })} · tax {tariff.tax_rate_bp / 100}% {tariff.tax_mode}. Publishing a new tariff replaces it for new bookings; existing bookings keep their quoted price.</> : "No tariff yet — the station can’t be booked without one."}
          >
            {tariff && (
              <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                {tariff.components.map((c) => (
                  <li key={c.type} className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
                    <span className="text-zinc-500">{PRICES.find((p) => p.key === c.type)?.label ?? c.type}</span>{" "}
                    <span className="font-semibold">{formatMoney(c.price_minor, tariff.currency)}</span>{" "}
                    <span className="text-xs text-zinc-500">{PRICES.find((p) => p.key === c.type)?.unit}</span>
                  </li>
                ))}
              </ul>
            )}
            <form action={saveTariffAction} className="space-y-3">
              {hidden(s.id)}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <label className="text-sm font-medium sm:col-span-2">Name<input name="name" defaultValue={tariff?.name ?? "Standard"} maxLength={80} className={ui.input} /></label>
                <label className="text-sm font-medium">Currency
                  <select name="currency" defaultValue={tariff?.currency ?? "INR"} className={ui.input}><option>INR</option></select>
                </label>
                <label className="text-sm font-medium">Tax %<input name="tax_rate" inputMode="decimal" defaultValue={String((tariff?.tax_rate_bp ?? 1800) / 100)} className={ui.input} /></label>
                <label className="text-sm font-medium sm:col-span-4">Prices are
                  <select name="tax_mode" defaultValue={tariff?.tax_mode ?? "exclusive"} className={ui.input}>
                    <option value="exclusive">Before tax (tax added on top)</option>
                    <option value="inclusive">Tax included</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {PRICES.map((p) => {
                  const v = price(p.key);
                  return (
                    <label key={p.key} className="text-sm font-medium">
                      {p.label} (₹ {p.unit})
                      <input name={p.key} inputMode="decimal" placeholder="Leave empty if not charged" defaultValue={v !== undefined ? String(v / 100) : ""} className={ui.input} />
                    </label>
                  );
                })}
              </div>
              <button className={ui.btn}>Publish tariff</button>
            </form>
          </Section>

          <section aria-labelledby="danger-h" className="rounded-2xl p-4 ring-1 ring-rose-200 sm:p-5 dark:ring-rose-500/30">
            <h2 id="danger-h" className="font-semibold text-rose-700 dark:text-rose-300">Delete station</h2>
            <p className="mt-1 text-sm text-zinc-500">Removes the station with its charging points, connectors, hours, tariffs, check-ins and reviews. Stations with bookings can’t be deleted — set their charging points inactive instead.</p>
            <details className="mt-3">
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-rose-600">I want to delete this station</summary>
              <form action={deleteStationAction} className="mt-2 flex flex-wrap items-end gap-2">
                {hidden(s.id)}
                <label className="text-sm font-medium">Type DELETE to confirm<input name="confirm" autoComplete="off" required className={ui.input} /></label>
                <button className="min-h-11 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-700">Delete station</button>
              </form>
            </details>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className={ui.card} aria-labelledby="ready-h">
            <h2 id="ready-h" className="font-semibold">Ready for bookings?</h2>
            <ul className="mt-2">
              <Check ok={ready.evses} label={`Bookable charging point${bookableEvses === 1 ? "" : "s"} (${bookableEvses})`} href="#evses" />
              <Check ok={ready.hours} label="Opening hours" href="#hours" />
              <Check ok={ready.rules} label="Booking rules" href="#rules" />
              <Check ok={ready.tariff} label="Published tariff" href="#tariff" />
            </ul>
            <p className="mt-2 text-xs text-zinc-500">{isBookable ? "Drivers can book this station." : "Complete every step to open bookings."}</p>
          </section>
          <nav aria-label="On this page" className={`${ui.card} hidden text-sm lg:block`}>
            {[["details", "Details"], ["evses", "Charging points"], ["connectors", "Connectors"], ["hours", "Opening hours"], ["rules", "Booking rules"], ["tariff", "Tariff"]].map(([h, l]) => (
              <a key={h} href={`#${h}`} className="flex min-h-9 items-center text-zinc-600 hover:text-energy-700 dark:text-zinc-300">{l}</a>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}

type Evse = StationDetail["evses"][number];

function EvseForm({ stationId, e, chargePoints, suggestUid }: { stationId: string; e?: Evse; chargePoints: { id: string; identity: string }[]; suggestUid?: string }) {
  return (
    <form action={saveEvseAction} className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="station_id" value={stationId} />
      {e && <input type="hidden" name="evse_id" value={e.id} />}
      <label className="text-xs font-medium">ID<input name="evse_uid" required maxLength={64} defaultValue={e?.evse_uid ?? suggestUid} className={ui.input} /></label>
      <label className="text-xs font-medium">Label<input name="label" required maxLength={60} defaultValue={e?.label ?? ""} placeholder="DC-1" className={ui.input} /></label>
      <label className="text-xs font-medium">Max kW<input name="max_power_kw" inputMode="decimal" defaultValue={e?.max_power_kw != null ? String(Number(e.max_power_kw)) : ""} className={ui.input} /></label>
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="is_bookable" defaultChecked={e?.is_bookable ?? true} className="h-5 w-5 accent-energy-600" />Bookable</label>
        {e && <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={e.is_active} className="h-5 w-5 accent-energy-600" />Active</label>}
      </div>
      <label className="col-span-2 text-xs font-medium">Linked charger (OCPP)
        <select name="charge_point_id" defaultValue={e?.charge_point_id ?? ""} className={ui.input}>
          <option value="">None — no live status</option>
          {chargePoints.map((c) => <option key={c.id} value={c.id}>{c.identity}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">OCPP connector #<input name="ocpp_connector_id" inputMode="numeric" defaultValue={e?.ocpp_connector_id != null ? String(e.ocpp_connector_id) : ""} placeholder="1" className={ui.input} /></label>
      <button className={ui.btnLight}>{e ? "Save" : "Add charging point"}</button>
    </form>
  );
}
