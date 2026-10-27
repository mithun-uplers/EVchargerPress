"use client";

import { useActionState, useMemo, useState } from "react";
import { holdSlot, type ActionState } from "@/app/bookings/actions";
import type { Slot } from "@/lib/booking-types";
import { formatTime } from "@/lib/format";

type Props = {
  stationId: string;
  timeZone: string;
  durationMin: number;
  slots: Slot[];
  evses: { id: string; label: string; max_power_kw: number | null; connectors: string[] }[];
  back: string;
  signedIn: boolean;
};

export function SlotPicker({ stationId, timeZone, durationMin, slots, evses, back, signedIn }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(holdSlot, null);
  const [selected, setSelected] = useState<{ evseId: string; start: string; end: string } | null>(null);
  // One key per selected slot: a double click or a retry after a network blip reuses it,
  // so the server returns the same hold instead of creating a second one.
  // (Created on selection, in the browser, so server and client renders match.)
  const [key, setKey] = useState("");

  const byEvse = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) map.set(s.evse_id, [...(map.get(s.evse_id) ?? []), s]);
    return map;
  }, [slots]);

  function choose(evseId: string, s: Slot) {
    setSelected({ evseId, start: s.slot_start, end: s.slot_end });
    setKey(crypto.randomUUID());
  }

  const bookable = evses.filter((e) => byEvse.has(e.id));

  return (
    <div className="space-y-6">
      {bookable.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="font-medium">No free slots for this day and duration.</p>
          <p className="mt-1 text-sm text-zinc-500">Try another day or a shorter duration.</p>
        </div>
      ) : (
        bookable.map((e) => (
          <section key={e.id} aria-labelledby={`evse-${e.id}`} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`evse-${e.id}`} className="font-medium">
                {e.label}
              </h3>
              <p className="text-xs text-zinc-500">
                {[e.max_power_kw ? `${Number(e.max_power_kw)} kW` : null, e.connectors.join(", ") || null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div role="radiogroup" aria-label={`Start times on ${e.label}`} className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {byEvse.get(e.id)!.map((s) => {
                const active = selected?.evseId === e.id && selected.start === s.slot_start;
                return (
                  <button
                    key={s.slot_start}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => choose(e.id, s)}
                    className={`min-h-11 rounded-lg border px-2 py-2 text-sm tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                      active
                        ? "border-emerald-600 bg-emerald-600 font-semibold text-white"
                        : "border-zinc-300 hover:border-emerald-500 hover:bg-emerald-50 dark:border-zinc-700 dark:hover:bg-emerald-500/10"
                    }`}
                  >
                    {formatTime(s.slot_start, timeZone)}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      <form action={formAction} className="sticky bottom-3 z-10 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <input type="hidden" name="station_id" value={stationId} />
        <input type="hidden" name="evse_id" value={selected?.evseId ?? ""} />
        <input type="hidden" name="start_at" value={selected?.start ?? ""} />
        <input type="hidden" name="duration_min" value={durationMin} />
        <input type="hidden" name="idempotency_key" value={key} />
        <input type="hidden" name="back" value={back} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" aria-live="polite">
            {selected ? (
              <>
                <span className="font-medium">
                  {evses.find((e) => e.id === selected.evseId)?.label} · {formatTime(selected.start, timeZone)}–{formatTime(selected.end, timeZone)}
                </span>
                <span className="block text-xs text-zinc-500">You’ll review the price and cancellation rules before confirming.</span>
              </>
            ) : (
              <span className="text-zinc-500">Select a start time.</span>
            )}
          </p>
          <button
            disabled={!selected || pending}
            className="min-h-11 rounded-lg bg-emerald-600 px-5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Holding…" : signedIn ? "Hold this slot" : "Sign in to book"}
          </button>
        </div>
        {state?.error && (
          <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}
