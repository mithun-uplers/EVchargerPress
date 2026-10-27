"use client";

import { useEffect, useRef } from "react";

export const inputCls =
  "mt-1 block w-full min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function FormMessage({ state }: { state: { error?: string; ok?: string } | null }) {
  if (state?.error)
    return (
      <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
        {state.ok}
      </p>
    );
  return null;
}

/** Hidden field with the browser's UTC offset, so the server can read datetime-local values correctly. */
export function TzOffsetField() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.value = String(new Date().getTimezoneOffset());
  }, []);
  return <input ref={ref} type="hidden" name="tz_offset" defaultValue="" />;
}

export function SubmitButton({ pending, children, variant = "primary" }: { pending: boolean; children: React.ReactNode; variant?: "primary" | "danger" | "secondary" }) {
  const cls =
    variant === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700"
      : variant === "secondary"
        ? "ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800"
        : "bg-emerald-600 text-white hover:bg-emerald-700";
  return (
    <button disabled={pending} className={`min-h-11 rounded-lg px-5 text-sm font-medium disabled:opacity-60 ${cls}`}>
      {pending ? "Saving…" : children}
    </button>
  );
}
