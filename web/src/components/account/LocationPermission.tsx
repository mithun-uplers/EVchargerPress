"use client";

import { useState } from "react";
import { describeGeoError } from "@/lib/geolocation";

/** Asks the browser for location permission during onboarding and reports the result. */
export function LocationPermission() {
  const [state, setState] = useState<"idle" | "asking" | "granted" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  function ask() {
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      setState("error");
      setMsg(describeGeoError());
      return;
    }
    setState("asking");
    navigator.geolocation.getCurrentPosition(
      () => setState("granted"),
      (e) => {
        setState("error");
        setMsg(describeGeoError(e.code));
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }
  return (
    <div className="space-y-2">
      <input type="hidden" name="share_location" value={state === "granted" ? "on" : ""} />
      {state === "granted" ? (
        <p role="status" className="text-sm font-medium text-energy-700 dark:text-energy-400">Location allowed — “Near me” will work on this device.</p>
      ) : (
        <button type="button" onClick={ask} disabled={state === "asking"} className="min-h-11 rounded-lg px-4 text-sm font-medium ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 disabled:opacity-60 dark:ring-zinc-700 dark:hover:bg-zinc-800">
          {state === "asking" ? "Waiting for your browser…" : "Allow location"}
        </button>
      )}
      {msg && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{msg}</p>}
    </div>
  );
}
