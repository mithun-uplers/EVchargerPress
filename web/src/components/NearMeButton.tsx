"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function NearMeButton() {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = params.has("lat");

  function go() {
    if (active) {
      const p = new URLSearchParams(params);
      p.delete("lat");
      p.delete("lng");
      router.push(`/?${p}`);
      return;
    }
    if (!navigator.geolocation) return setErr("Location not supported");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = new URLSearchParams(params);
        p.set("lat", pos.coords.latitude.toFixed(5));
        p.set("lng", pos.coords.longitude.toFixed(5));
        setBusy(false);
        router.push(`/?${p}`);
      },
      () => {
        setBusy(false);
        setErr("Couldn't get your location");
      },
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={go}
        className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset transition ${
          active
            ? "bg-emerald-600 text-white ring-emerald-600"
            : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700"
        }`}
      >
        {busy ? "Locating…" : active ? "Sorted by distance ✕" : "Near me"}
      </button>
      {err && <span className="text-xs text-rose-600">{err}</span>}
    </div>
  );
}
