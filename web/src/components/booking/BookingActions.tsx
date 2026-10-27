"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { cancelAction, checkInAction, confirmAction, type ActionState } from "@/app/bookings/actions";

function Feedback({ state }: { state: ActionState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
      {state.error}
    </p>
  );
}

/** Counts down a hold and refreshes the page when it lapses. */
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= 0) router.refresh();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt, router]);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, "0");
  return (
    <span className="tabular-nums" aria-live="off">
      {m}:{s}
    </span>
  );
}

export function ConfirmButton({ reference }: { reference: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(confirmAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="reference" value={reference} />
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-emerald-600 px-5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
        {pending ? "Confirming…" : "Confirm booking"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function CheckInButton({ reference }: { reference: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(checkInAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="reference" value={reference} />
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-emerald-600 px-5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
        {pending ? "Checking in…" : "I’ve arrived — check in"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function CancelForm({ reference, feeNote }: { reference: string; feeNote: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(cancelAction, null);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 w-full rounded-lg px-5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:ring-rose-500/30 dark:hover:bg-rose-500/10">
        Cancel booking
      </button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-lg border border-rose-200 p-3 dark:border-rose-500/30">
      <input type="hidden" name="reference" value={reference} />
      <p className="text-sm">{feeNote}</p>
      <label className="block text-sm font-medium">
        Reason (optional)
        <input name="reason" maxLength={300} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
      </label>
      <div className="flex gap-2">
        <button disabled={pending} className="min-h-11 flex-1 rounded-lg bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
          {pending ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg px-4 text-sm ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700">
          Keep it
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
