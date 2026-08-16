/**
 * OsmDataset loader.
 *
 * Reads the preloaded snapshot from /public/data/osm/*.json as static assets
 * — never a live Overpass call from the running app (blueprint Phase 3: the
 * app must work with zero network access beyond its own origin). The
 * ingestion script (ingest/sources/osm/fetch.mjs) is the only thing that ever
 * talks to Overpass, and it runs manually, ahead of time.
 *
 * Fetched lazily and memoized in-module, not bundled into the JS chunk: the
 * roads file is ~1.8 MB, which belongs in a lazily-fetched static asset, not
 * the initial page load (blueprint Phase 16 — no huge datasets loaded
 * unnecessarily).
 */

import type { OsmDataset, OsmManifest, OsmPlace, OsmPoi, OsmRoad } from "./types";

const BASE_PATH = "/data/osm";

let cached: Promise<OsmDataset> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Load (and memoize) the OSM dataset.
 *
 * Callers must be on the client — like getDb() in the IndexedDB layer, this
 * is guarded explicitly so a server-render reaching it fails with a clear
 * message rather than an opaque "fetch is not defined".
 */
export function loadOsmDataset(): Promise<OsmDataset> {
  if (cached) return cached;

  if (typeof fetch === "undefined") {
    return Promise.reject(
      new Error("The OSM dataset can only be loaded in the browser."),
    );
  }

  cached = (async () => {
    const [manifest, roads, pois, places] = await Promise.all([
      fetchJson<OsmManifest>(`${BASE_PATH}/manifest.json`),
      fetchJson<OsmRoad[]>(`${BASE_PATH}/roads.json`),
      fetchJson<OsmPoi[]>(`${BASE_PATH}/pois.json`),
      fetchJson<OsmPlace[]>(`${BASE_PATH}/places.json`),
    ]);
    return { manifest, roads, pois, places };
  })();

  // Do not memoize a failed load — a transient network error should not
  // permanently poison every future analysis run in the session.
  cached.catch(() => {
    cached = null;
  });

  return cached;
}

/** Test-only: force the next loadOsmDataset() call to refetch. */
export function resetOsmDatasetForTests(): void {
  cached = null;
}

/** Whether a position falls inside the ingested dataset's bounding box. */
export function isWithinOsmCoverage(manifest: OsmManifest, lon: number, lat: number): boolean {
  const [west, south, east, north] = manifest.bbox;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}
