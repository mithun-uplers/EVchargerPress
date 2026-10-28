"use client";

import { useState } from "react";

export function LocationFields() {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function useMine() {
    if (!navigator.geolocation) return setMsg("Location not supported in this browser.");
    setMsg("Locating…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        setMsg(null);
      },
      () => setMsg("Couldn't get your location — enter it manually."),
    );
  }

  const input =
    "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Latitude
          <input name="lat" required inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="12.9716" className={input} />
        </label>
        <label className="text-sm font-medium">
          Longitude
          <input name="lng" required inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="77.5946" className={input} />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={useMine} className="text-sm font-medium text-energy-700 hover:underline dark:text-energy-400">
          Use my current location
        </button>
        {msg && <span className="text-xs text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
}
