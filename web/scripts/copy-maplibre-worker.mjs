// Copies MapLibre's web worker into public/ so the browser can load it from our own origin.
// MapLibre 6 otherwise looks for the worker next to its bundled chunk under /_next/static,
// where Next.js/Turbopack never puts it, and the map can't parse vector tiles or station data.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve("maplibre-gl/package.json"));
const { version } = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
const outDir = path.resolve(import.meta.dirname, "../public/vendor");
mkdirSync(outDir, { recursive: true });
copyFileSync(path.join(pkgDir, "dist/maplibre-gl-worker.mjs"), path.join(outDir, "maplibre-gl-worker.mjs"));
console.log(`maplibre-gl ${version} worker → public/vendor/maplibre-gl-worker.mjs`);
