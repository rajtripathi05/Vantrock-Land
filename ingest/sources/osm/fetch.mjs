#!/usr/bin/env node
/**
 * OpenStreetMap ingestion — Pune / Chakan / Talegaon corridor.
 *
 * Fetches major roads and industrial/logistics-relevant points of interest
 * from the public Overpass API and writes them as normalized, provenance-
 * stamped JSON under public/data/osm/. These files are the PRELOADED data
 * source the analysis engine (lib/analysis) queries at runtime — nothing in
 * the app makes a live Overpass call.
 *
 * Run manually: `npm run ingest:osm`. Not part of the build; the app must
 * work from the last-committed snapshot with zero network access.
 *
 * Classification: PRELOADED (blueprint rule 51). Source: OpenStreetMap
 * contributors, ODbL 1.0, via the free/keyless Overpass API.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "public", "data", "osm");

// West, South, East, North — covers Pune city, the airport, Chakan MIDC,
// and Talegaon MIDC. Advisory only; sites outside it simply get no OSM
// context (see lib/analysis warnings).
const BBOX = { west: 73.55, south: 18.45, east: 74.05, north: 18.85 };
const OVERPASS_BBOX = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const ROADS_QUERY = `
[out:json][timeout:120];
(
  way["highway"~"^(motorway|trunk|primary|secondary)(_link)?$"](${OVERPASS_BBOX});
);
out geom;
`;

// Tags relevant to industrial/logistics site context: warehousing, industrial
// land, rail freight, air freight, fuel for heavy vehicles, power supply.
const POI_QUERY = `
[out:json][timeout:120];
(
  node["landuse"="industrial"](${OVERPASS_BBOX});
  way["landuse"="industrial"](${OVERPASS_BBOX});
  node["building"="warehouse"](${OVERPASS_BBOX});
  way["building"="warehouse"](${OVERPASS_BBOX});
  node["industrial"](${OVERPASS_BBOX});
  way["industrial"](${OVERPASS_BBOX});
  node["railway"="station"](${OVERPASS_BBOX});
  way["railway"="yard"](${OVERPASS_BBOX});
  node["aeroway"="aerodrome"](${OVERPASS_BBOX});
  way["aeroway"="aerodrome"](${OVERPASS_BBOX});
  node["amenity"="fuel"](${OVERPASS_BBOX});
  node["power"="substation"](${OVERPASS_BBOX});
  way["power"="substation"](${OVERPASS_BBOX});
);
out center tags;
`;

// Settlement nodes carrying a `population` tag — self-reported by OSM
// contributors, often (not always) sourced from the Census of India. Used
// as a POPULATION PROXY for the labour metrics (lib/analysis/metrics/labour.ts),
// never as an official census figure or a workforce measurement.
const PLACES_QUERY = `
[out:json][timeout:120];
(
  node["place"~"^(city|town|village|suburb)$"]["population"](${OVERPASS_BBOX});
);
out body;
`;

async function overpassFetch(query, attempt = 1) {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*",
      "User-Agent": "vantrock-intelligence-mvp/0.1 (local ingestion script; contact: local-dev)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  const text = await response.text();

  const rateLimited = !response.ok || /rate_limited|Too Many Requests/i.test(text);
  if (rateLimited) {
    console.log(`  DEBUG status=${response.status} bodyStart=${text.slice(0, 300)}`);
    if (attempt >= 4) throw new Error(`Overpass rate-limited after ${attempt} attempts.`);
    const waitMs = attempt * 20_000;
    console.log(`  Overpass busy (attempt ${attempt}), waiting ${waitMs / 1000}s…`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return overpassFetch(query, attempt + 1);
  }

  try {
    return JSON.parse(text);
  } catch (cause) {
    console.log(`  DEBUG JSON parse failed. status=${response.status} bodyStart=${text.slice(0, 300)}`);
    throw cause;
  }
}

/**
 * OSM `population` tags are free-text, contributor-entered, and frequently
 * malformed (e.g. "10lakh", "~50000", "50,000 (2011)"). Only a clean integer
 * is trustworthy enough to sum into a metric — anything else is discarded
 * rather than guessed at, per the no-fabrication rule.
 */
function parsePopulation(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function poiCategory(tags) {
  if (tags.aeroway === "aerodrome") return "airport";
  if (tags.railway === "station") return "rail_station";
  if (tags.railway === "yard") return "rail_yard";
  if (tags.building === "warehouse") return "warehouse";
  if (tags.landuse === "industrial") return "industrial_zone";
  if (tags.amenity === "fuel") return "fuel_station";
  if (tags.power === "substation") return "power_substation";
  if (tags.industrial) return "industrial_facility";
  return "other";
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const retrievedAt = new Date().toISOString();

  console.log("Fetching major roads (motorway/trunk/primary/secondary)…");
  const roadsRaw = await overpassFetch(ROADS_QUERY);
  const roads = roadsRaw.elements
    .filter((el) => el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 2)
    .map((way) => ({
      id: `way/${way.id}`,
      highway: way.tags?.highway ?? "unknown",
      name: way.tags?.name ?? null,
      ref: way.tags?.ref ?? null,
      oneway: way.tags?.oneway === "yes",
      coordinates: way.geometry.map((p) => [p.lon, p.lat]),
    }));
  console.log(`  ${roads.length} road segments.`);

  // Overpass rate limits by IP; wait between the two queries rather than
  // firing back-to-back.
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("Fetching industrial/logistics points of interest…");
  const poisRaw = await overpassFetch(POI_QUERY);
  const pois = poisRaw.elements
    .map((el) => {
      const coords = el.type === "node" ? { lon: el.lon, lat: el.lat } : el.center;
      if (!coords) return null;
      return {
        id: `${el.type}/${el.id}`,
        category: poiCategory(el.tags ?? {}),
        name: el.tags?.name ?? null,
        lon: coords.lon,
        lat: coords.lat,
      };
    })
    .filter((poi) => poi !== null && poi.category !== "other");
  console.log(`  ${pois.length} points of interest.`);

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("Fetching settlement population (place nodes with a population tag)…");
  const placesRaw = await overpassFetch(PLACES_QUERY);
  const places = placesRaw.elements
    .map((node) => {
      const population = parsePopulation(node.tags?.population);
      if (population === null) return null;
      return {
        id: `node/${node.id}`,
        place: node.tags?.place ?? "village",
        name: node.tags?.name ?? null,
        population,
        lon: node.lon,
        lat: node.lat,
      };
    })
    .filter((place) => place !== null);
  const discarded = placesRaw.elements.length - places.length;
  console.log(
    `  ${places.length} places with a usable population figure` +
      (discarded > 0 ? ` (${discarded} discarded — non-numeric population tag).` : "."),
  );

  const categoryCounts = {};
  for (const poi of pois) categoryCounts[poi.category] = (categoryCounts[poi.category] ?? 0) + 1;

  const highwayCounts = {};
  for (const road of roads) highwayCounts[road.highway] = (highwayCounts[road.highway] ?? 0) + 1;

  const manifest = {
    source_id: "osm_pune_chakan_talegaon_v1",
    name: "OpenStreetMap — Pune / Chakan / Talegaon corridor",
    provider: "OpenStreetMap contributors, via Overpass API (overpass-api.de)",
    source_url: "https://www.openstreetmap.org",
    license: "Open Database License (ODbL) 1.0",
    attribution: "© OpenStreetMap contributors",
    classification: "PRELOADED",
    geography: "Pune / Chakan / Talegaon, Maharashtra, India",
    bbox: [BBOX.west, BBOX.south, BBOX.east, BBOX.north],
    format: "Normalized JSON (derived from Overpass API JSON)",
    data_timestamp: retrievedAt,
    retrieved_at: retrievedAt,
    version: 1,
    roads: { count: roads.length, by_class: highwayCounts, file: "roads.json" },
    pois: { count: pois.length, by_category: categoryCounts, file: "pois.json" },
    places: { count: places.length, file: "places.json" },
    notes:
      "Preloaded snapshot. Re-run `npm run ingest:osm` to refresh. The application " +
      "never calls Overpass at request time. `places[].population` is a contributor-entered " +
      "OSM tag (POPULATION PROXY) — not an official census figure.",
  };

  await writeFile(path.join(OUT_DIR, "roads.json"), JSON.stringify(roads));
  await writeFile(path.join(OUT_DIR, "pois.json"), JSON.stringify(pois));
  await writeFile(path.join(OUT_DIR, "places.json"), JSON.stringify(places));
  await writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\nWrote ${roads.length} roads, ${pois.length} POIs, ${places.length} places to ${OUT_DIR}`);
  console.log("Road classes:", highwayCounts);
  console.log("POI categories:", categoryCounts);
}

main().catch((error) => {
  console.error("Ingestion failed:", error);
  process.exit(1);
});
