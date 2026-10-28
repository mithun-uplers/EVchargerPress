"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { describeGeoError } from "@/lib/geolocation";

export function NearMeButton() {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = params.has("lat");

  function go() {
    setErr(null);
    if (active) {
      const p = new URLSearchParams(params);
      p.delete("lat");
      p.delete("lng");
      router.push(`/?${p}`);
      return;
    }
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      setErr(describeGeoError());
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = new URLSearchParams(params);
        p.set("lat", pos.coords.latitude.toFixed(5));
        p.set("lng", pos.coords.longitude.toFixed(5));
        setBusy(false);
        router.push(`/?${p}`);
      },
      (e) => {
        setBusy(false);
        setErr(describeGeoError(e.code));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset transition ${
          active
            ? "bg-energy-600 text-white ring-energy-600"
            : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700"
        }`}
      >
        {busy ? "Locating…" : active ? "Nearest first ✕" : "Near me"}
      </button>
      {err && (
        <p role="alert" className="max-w-sm rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          {err}
        </p>
      )}
    </div>
  );
}
