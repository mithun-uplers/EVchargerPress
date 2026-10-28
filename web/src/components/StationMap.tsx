"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { describeGeoError } from "@/lib/geolocation";
import { loadMaplibre } from "@/lib/maplibre";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const INDIA = { center: [78.9629, 22.5937] as [number, number], zoom: 4.2 };

/** Draws the round charger pin (emerald circle, white bolt) used for each station. */
function makePinImage(fill = "#437a27", size = 40, ratio = 2) {
  const px = size * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.beginPath();
  const s = size / 40;
  ctx.moveTo(22 * s, 8 * s);
  ctx.lineTo(12 * s, 22 * s);
  ctx.lineTo(19 * s, 22 * s);
  ctx.lineTo(17 * s, 32 * s);
  ctx.lineTo(28 * s, 17 * s);
  ctx.lineTo(21 * s, 17 * s);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  return { image: ctx.getImageData(0, 0, px, px), ratio };
}

function popupContent(p: Record<string, unknown>) {
  // Built with DOM nodes (not HTML strings) so imported names can't inject markup.
  const root = document.createElement("div");
  root.className = "min-w-48 text-zinc-900";
  const title = document.createElement("p");
  title.className = "font-semibold";
  title.textContent = String(p.name ?? "Charging station");
  root.appendChild(title);
  if (p.place) {
    const place = document.createElement("p");
    place.className = "text-xs text-zinc-600";
    place.textContent = String(p.place);
    root.appendChild(place);
  }
  const meta = document.createElement("p");
  meta.className = "mt-1 text-xs text-zinc-600";
  const kw = Number(p.max_kw);
  meta.textContent = [
    kw > 0 ? `Up to ${kw} kW` : "Power not listed",
    p.connectors ? String(p.connectors) : "Connectors not listed",
  ].join(" · ");
  root.appendChild(meta);
  const badge = document.createElement("p");
  badge.className = Number(p.bookable) === 1 ? "mt-1 text-xs font-semibold text-energy-700" : "mt-1 text-xs text-zinc-500";
  badge.textContent = Number(p.bookable) === 1 ? "Online booking available" : "Information only — no online booking";
  root.appendChild(badge);
  if (Number(p.live_total) > 0) {
    const live = document.createElement("p");
    live.className = "mt-1 text-xs font-medium text-energy-800";
    live.textContent = `${Number(p.live_free)} of ${Number(p.live_total)} free · ${Number(p.live_sim) === 1 ? "Simulated" : "Live"}`;
    root.appendChild(live);
  }
  if (p.source === "openstreetmap") {
    const src = document.createElement("p");
    src.className = "mt-1 text-[11px] text-zinc-500";
    src.textContent = "Source: OpenStreetMap";
    root.appendChild(src);
  }
  const link = document.createElement("a");
  link.href = `/stations/${String(p.id)}`;
  link.className = "mt-2 inline-block text-sm font-medium text-energy-700 hover:underline";
  link.textContent = "View details →";
  root.appendChild(link);
  if (Number(p.bookable) === 1) {
    const book = document.createElement("a");
    book.href = `/stations/${String(p.id)}/book`;
    book.className = "ml-3 mt-2 inline-block text-sm font-semibold text-energy-700 hover:underline";
    book.textContent = "Book a slot →";
    root.appendChild(book);
  }
  return root;
}

export function StationMap({ initialCenter }: { initialCenter?: [number, number] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    let map: MapLibreMap | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: AbortController | null = null;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const maplibre = await loadMaplibre();
      if (cancelled || !containerRef.current) return;

      map = new maplibre.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: initialCenter ?? INDIA.center,
        zoom: initialCenter ? 12 : INDIA.zoom,
        attributionControl: false,
      });
      const m = map;
      // If the map never finishes loading (blocked tiles, worker or WebGL problems), say so instead of showing an empty map.
      watchdog = setTimeout(() => setStalled(true), 20000);
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      const geo = new maplibre.GeolocateControl({
        positionOptions: { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
        trackUserLocation: false,
        showAccuracyCircle: true,
      });
      geo.on("error", (e) => setNotice(describeGeoError(e.code)));
      geo.on("geolocate", () => setNotice(null));
      m.addControl(geo, "bottom-right");
      m.addControl(
        new maplibre.AttributionControl({
          compact: true,
          customAttribution: "Charger data © OpenStreetMap contributors (ODbL)",
        }),
        "bottom-left",
      );

      const load = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const b = m.getBounds();
          abort?.abort();
          abort = new AbortController();
          try {
            const res = await fetch(
              `/api/stations?bbox=${[b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(4)).join(",")}`,
              { signal: abort.signal },
            );
            if (!res.ok) throw new Error(String(res.status));
            const fc = await res.json();
            (m.getSource("stations") as GeoJSONSource | undefined)?.setData(fc);
            setCount(fc.features.length);
            setLoadError(false);
          } catch (err) {
            if ((err as Error).name !== "AbortError") setLoadError(true);
          }
        }, 300); // debounce while panning
      };

      // The basemap style references a few icons it doesn't ship; supply a transparent 1×1 image
      // instead of logging "Image could not be loaded" warnings to the console.
      m.on("styleimagemissing", (e: { id: string }) => {
        if (!m.hasImage(e.id)) m.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      m.on("load", () => {
        clearTimeout(watchdog);
        setStalled(false);
        const pin = makePinImage("#437a27");
        m.addImage("pin-bookable", pin.image, { pixelRatio: pin.ratio });
        const info = makePinImage("#64748b");
        m.addImage("pin-info", info.image, { pixelRatio: info.ratio });
        m.addSource("stations", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterRadius: 45,
          clusterMaxZoom: 11,
        });
        m.addLayer({
          id: "clusters",
          type: "circle",
          source: "stations",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#355f20",
            "circle-opacity": 0.9,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26, 200, 32],
          },
        });
        m.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "stations",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13 },
          paint: { "text-color": "#ffffff" },
        });
        m.addLayer({
          id: "station-pins",
          type: "symbol",
          source: "stations",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": ["case", ["==", ["get", "bookable"], 1], "pin-bookable", "pin-info"],
            "symbol-sort-key": ["case", ["==", ["get", "bookable"], 1], 1, 0],
            "icon-size": 0.8,
            "icon-allow-overlap": true,
            "text-field": ["step", ["zoom"], "", 11, ["get", "name"]],
            "text-font": ["Noto Sans Bold"],
            "text-size": 12,
            "text-anchor": "left",
            "text-offset": [1.4, 0],
            "text-max-width": 10,
            "text-optional": true,
          },
          paint: { "text-color": "#1f2937", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
        });

        m.on("click", "clusters", async (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          const src = m.getSource("stations") as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
          const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
          m.easeTo({ center: [lng, lat], zoom });
        });
        m.on("click", "station-pins", (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
          new maplibre.Popup({ offset: 16, maxWidth: "280px" })
            .setLngLat([lng, lat])
            .setDOMContent(popupContent(f.properties))
            .addTo(m);
        });
        for (const layer of ["clusters", "station-pins"]) {
          m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
        }

        load();
        m.on("moveend", load);
      });
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(watchdog);
      abort?.abort();
      map?.remove();
    };
  }, [initialCenter]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="Map of charging stations" role="region" />
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
        {count !== null && (
          <span className="pointer-events-auto rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-zinc-700 shadow">
            {count} station{count === 1 ? "" : "s"} in view
          </span>
        )}
        <span className="pointer-events-auto flex items-center gap-3 rounded-full bg-white/95 px-3 py-1 text-xs text-zinc-700 shadow">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-energy-600" />Bookable</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-500" />Info only</span>
        </span>
        {stalled && (
          <span role="alert" className="pointer-events-auto max-w-xs rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 shadow">
            The map didn’t finish loading, so stations can’t be shown. Refresh the page, or use List view.
          </span>
        )}
        {loadError && (
          <span className="pointer-events-auto rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 shadow">
            Couldn’t load stations. Move the map to retry.
          </span>
        )}
      </div>
      {notice && (
        <div role="alert" className="absolute inset-x-3 bottom-20 mx-auto max-w-md rounded-xl bg-white p-4 text-sm text-zinc-800 shadow-lg">
          <p className="font-medium">Location unavailable</p>
          <p className="mt-1 text-zinc-600">{notice}</p>
          <button onClick={() => setNotice(null)} className="mt-2 text-sm font-medium text-energy-700">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
