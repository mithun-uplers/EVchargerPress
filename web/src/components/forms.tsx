"use client";

import { useEffect, useRef } from "react";
import { ui } from "@/lib/ui";

/** For client components; server components should import `ui.input` from "@/lib/ui". */
export const inputCls = ui.input;

export function FormMessage({ state }: { state: { error?: string; ok?: string } | null }) {
  if (state?.error)
    return (
      <p role="alert" className={ui.error}>
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className={ui.ok}>
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
        : "bg-energy-600 text-white shadow-sm hover:bg-energy-700";
  return (
    <button disabled={pending} className={`min-h-11 rounded-xl px-5 text-sm font-semibold transition disabled:opacity-60 ${cls}`}>
      {pending ? "Saving…" : children}
    </button>
  );
}
