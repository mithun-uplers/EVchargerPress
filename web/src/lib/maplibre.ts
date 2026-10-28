/**
 * Loads MapLibre in the browser and points it at the worker we serve from /public/vendor
 * (copied there by scripts/copy-maplibre-worker.mjs on install, dev and build).
 * Without this, MapLibre 6 requests its worker from /_next/static/chunks/, gets a 404, and the
 * map shows only the raster relief: no roads, labels or charging stations.
 */
export async function loadMaplibre() {
  const maplibre = await import("maplibre-gl");
  maplibre.setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${maplibre.getVersion()}`);
  return maplibre;
}
