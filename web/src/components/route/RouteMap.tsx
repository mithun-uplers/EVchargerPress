"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Route line with start, end and planned charging stops. */
export function RouteMap({ line, stops, straight }: { line: [number, number][]; stops: { lngLat: [number, number]; label: string }[]; straight: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !el.current) return;
      const m = new maplibre.Map({ container: el.current, style: STYLE_URL, attributionControl: { compact: true } });
      map = m;
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      const bounds = line.reduce((b, c) => b.extend(c), new maplibre.LngLatBounds(line[0], line[0]));
      m.fitBounds(bounds, { padding: 40, duration: 0 });
      // The basemap style references a few icons it doesn't ship; supply a transparent 1×1 image
      // instead of logging "Image could not be loaded" warnings to the console.
      m.on("styleimagemissing", (e: { id: string }) => {
        if (!m.hasImage(e.id)) m.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      m.on("load", () => {
        m.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } } });
        m.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#ffffff", "line-width": 8 }, layout: { "line-cap": "round", "line-join": "round" } });
        m.addLayer({
          id: "route", type: "line", source: "route",
          paint: { "line-color": "#437a27", "line-width": 5, ...(straight ? { "line-dasharray": [2, 2] } : {}) },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        const add = (lngLat: [number, number], cls: string, text: string) => {
          const d = document.createElement("div");
          d.className = cls;
          d.textContent = text;
          new maplibre.Marker({ element: d }).setLngLat(lngLat).addTo(m);
        };
        add(line[0], "grid h-7 w-7 place-items-center rounded-full bg-zinc-900 text-xs font-bold text-white ring-2 ring-white", "A");
        add(line.at(-1)!, "grid h-7 w-7 place-items-center rounded-full bg-zinc-900 text-xs font-bold text-white ring-2 ring-white", "B");
        stops.forEach((s, i) => add(s.lngLat, "grid h-8 w-8 place-items-center rounded-full bg-charge-400 text-sm font-bold text-zinc-900 ring-2 ring-white shadow", String(i + 1)));
      });
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [line, stops, straight]);
  return <div ref={el} role="img" aria-label="Map of the route and charging stops" className="h-72 w-full overflow-hidden rounded-2xl bg-zinc-100 sm:h-96 dark:bg-zinc-800" />;
}
