# Data Sources

Classifications used throughout this document and the app UI:

- **LIVE** — fetched from a live verified API at analysis time. Used for route distance/time
  (see §2a below) — the only LIVE source in this MVP.
- **PRELOADED** — open data ingested ahead of time, timestamped at ingestion.
- **CURATED** — hand-assembled by Vantrock from research/judgement. Not authoritative.
- **DERIVED** — a computed proxy or exact calculation, not an external measurement.
- **MOCK** — placeholder for demonstration. *None in this MVP — see "no fabricated data" rule.*

---

## 1. OpenStreetMap — Pune / Chakan / Talegaon corridor

| Field | Value |
|---|---|
| Name | OpenStreetMap — Pune / Chakan / Talegaon corridor |
| Type | Roads (motorway/trunk/primary/secondary) + industrial/logistics POIs |
| URL | https://www.openstreetmap.org |
| Provider | OpenStreetMap contributors, via the free Overpass API (`overpass-api.de`) |
| Geography | Bounding box `[73.55, 18.45, 74.05, 18.85]` — Pune city, airport, Chakan MIDC, Talegaon MIDC |
| Classification | **PRELOADED** |
| License | Open Database License (ODbL) 1.0 |
| Attribution | © OpenStreetMap contributors |
| Retrieval | Manual: `npm run ingest:osm` runs `ingest/sources/osm/fetch.mjs`, which queries Overpass once and writes `public/data/osm/{roads,pois,manifest}.json`. The running app never calls Overpass — see `lib/data/osm/provider.ts`. |
| Update cadence | On-demand. Re-run the ingest command to refresh; the manifest's `retrieved_at` records when it last ran. |
| Limitations | Crowd-sourced — completeness varies by area. Roads limited to motorway/trunk/primary/secondary (no tertiary/residential, to keep the dataset small — see `ingest/sources/osm/fetch.mjs`). POIs limited to tags relevant to industrial/logistics siting (`landuse=industrial`, `building=warehouse`, `industrial=*`, `railway=station`/`yard`, `aeroway=aerodrome`, `amenity=fuel`, `power=substation`). |
| MVP usage | Backs every `accessibility.*`, `market.*`, and `infrastructure.*` metric in the analysis engine (`lib/analysis/metrics/`). Distances are straight-line (geodesic), computed by `lib/geo/nearest.ts` — never presented as route distances. |
| Snapshot (last ingest) | 5,089 road segments, 683 POIs (314 industrial zones, 136 fuel stations, 85 warehouses, 82 rail stations, 61 power substations, 4 airports, 1 other industrial facility). See `public/data/osm/manifest.json` for the exact counts and timestamp. |

## 2a. OSRM public demo server (route distance/time)

| Field | Value |
|---|---|
| Name | OSRM public demo server |
| Type | Ordinary passenger-vehicle route distance/time from a site to its nearest mapped highway |
| URL | https://router.project-osrm.org |
| Provider | Project OSRM, free public demo instance |
| Classification | **LIVE** — fetched fresh on every analysis run, not cached across sessions |
| License | OSRM engine: BSD 2-Clause. Underlying road network: OpenStreetMap ODbL 1.0. |
| Attribution | Routing: Project OSRM. Road data: © OpenStreetMap contributors. |
| Retrieval | `lib/providers/routing/osrm.ts`, called from `lib/ai/tools.ts` → `AnalysisTools.getSiteAnalysis()` for every site, in the running browser (not a manual ingest step — this is the one exception to "the app never calls a live API," documented here explicitly). |
| Update cadence | Every analysis run (subject to a per-session in-memory cache keyed by origin/destination — see `lib/providers/routing/osrm.ts`). |
| Limitations | **Ordinary passenger-vehicle routing, not truck routing** — OSRM's public demo only serves the `driving` profile; there is no heavy-vehicle profile (turn radii, axle load, height/weight restrictions) without a custom OSRM build this MVP does not have. Always labeled "ORDINARY ROAD ACCESS PROXY" in the metric's `calculation_note`, never "truck route." The public demo server is explicitly for light, non-commercial, low-volume use — not a production SLA (same posture already taken with the OSMF dev tile servers). A production deployment should self-host OSRM — see `docs/MANUAL_ACTIONS.md`. |
| MVP usage | `access.route_distance`, `access.route_time` in `lib/analysis/metrics/accessibility.ts` — route from the site centroid to the nearest vertex of the nearest mapped motorway/trunk/primary road. Degrades to `status: "missing"` (never a thrown error) on network failure, timeout, or no route found — the rest of the site analysis is unaffected. |

## 1a. OpenStreetMap settlement population tags (labour/population proxy)

| Field | Value |
|---|---|
| Name | OSM settlement `population` tags — Pune / Chakan / Talegaon corridor |
| Type | Settlement (city/town/village/suburb) nodes carrying a contributor-entered `population` tag |
| URL | https://www.openstreetmap.org |
| Provider | OpenStreetMap contributors, via the same Overpass ingest as §1 |
| Classification | **PRELOADED** |
| License | Open Database License (ODbL) 1.0 |
| Retrieval | Part of `npm run ingest:osm` (`PLACES_QUERY` in `ingest/sources/osm/fetch.mjs`) → `public/data/osm/places.json`. Only nodes with a clean integer `population` value are kept — malformed tags (e.g. `"10lakh"`, `"~50000"`) are discarded, never guessed at. |
| Limitations | **Sparse coverage** — most villages in the corridor carry no population tag at all (5 of ~hundreds of settlement nodes in the last ingest). **No per-node source citation or recency guarantee** — a contributor may have copied a Census of India figure, an estimate, or an outdated number; OSM does not standardize this. This is why the metric confidence is capped at 0.4 and the UI's low-confidence warning fires on every site that has it. |
| MVP usage | `labour.population_proxy` in `lib/analysis/metrics/labour.ts` — sum of population for settlements within a 15 km CURATED catchment radius of the site centroid. Explicitly labeled **POPULATION PROXY**, never presented as an official census total or a workforce measurement. `labour.labour_proxy` (sector-specific labour availability) is NOT derived from this — see the "Missing data" table below for why. |
| Snapshot (last ingest) | 5 settlement nodes with a usable population figure: Pune (3,115,431), Pimpri-Chinchwad (1,729,320), Wagholi (33,400), Chakan (41,100), Hinjawadi (11,459). 1 node discarded (`Ghorpuri`, population tag `"10lakh"` — not a clean integer). |

## 2. Vantrock curated orientation anchors

| Field | Value |
|---|---|
| Name | Pune corridor orientation anchors |
| Type | 7 hand-entered points (MIDC zones, Pune airport, Pune city centre, JNPT port, an NH-48 interchange) |
| URL | none |
| Provider | Vantrock (hand-entered) |
| Geography | Pune / Chakan / Talegaon corridor |
| Classification | **CURATED** |
| License | Internal demo data |
| Attribution | Vantrock curated demo dataset |
| Retrieval | One-time, hand-entered in `data/reference/anchors.ts` |
| Update cadence | Manual edit only |
| Limitations | Approximate coordinates, not survey-grade, not verified. |
| MVP usage | Map orientation labels only (`showAnchors` toggle in the workspace). **Never used in any calculation** — enforced by keeping this module entirely separate from `lib/analysis`. Superseded by the OpenStreetMap ingestion above once that covers the same points; kept for now because it renders even when the OSM overlay is off. |

## 3. Vantrock geometry engine (site measurements)

| Field | Value |
|---|---|
| Name | Vantrock geometry engine |
| Type | Area, perimeter, centroid, bbox, vertex/hole counts, shape compactness |
| Provider | Vantrock (`lib/geo/measure.ts`, `lib/geo/nearest.ts`) |
| Classification | **DERIVED** (exact calculation, not an estimate — confidence 1.0) |
| Retrieval | Computed once at site save time; never recomputed during render |
| Limitations | Geodesic (WGS84 ellipsoid) — matches PostGIS `geography` to documented tolerances (see `lib/geo/measure.ts` migration notes). Straight-line distances only. |
| MVP usage | `geo.*` metrics, and the base for every accessibility/infrastructure distance query. |

## 4. Financial and scoring assumption defaults

| Field | Value |
|---|---|
| Name | Grade-A logistics underwriting & scoring assumptions (rent, construction cost, cap rate, occupancy, benchmark bands, category weights) |
| Provider | Vantrock analytical judgement |
| Classification | **CURATED** |
| Retrieval | Hand-set in `lib/financial/engine.ts` (`BASE_ASSUMPTIONS`) and `lib/scoring/weights.ts` / `lib/analysis/benchmarks.ts` |
| Limitations | Not verified market quotes. Every UI surface that shows one of these values displays its `CURATED` classification and a note explaining it is an assumption, not a fact. Analyst-editable per site (land price) or per weight profile; rent/construction-cost/cap-rate overrides are supported by the engine (`FinancialOverrides`) though not yet exposed as UI controls beyond the site's land price — see ROADMAP.md. |
| MVP usage | `lib/financial/engine.ts` scenario builder; `lib/scoring/weights.ts` default and accessibility-focused weight profiles. |

## 5. Missing data (honestly reported, not fabricated)

| Metric | Why it's missing | Where it's documented |
|---|---|---|
| `access.route_distance`, `access.route_time` | Usually available now (see §2a) — reports missing only when the site is outside OSM highway coverage, or the OSRM public demo server request fails/times out. | `lib/analysis/metrics/accessibility.ts` |
| `labour.population_proxy` | Usually available now (see §1a) — reports missing only when no OSM-tagged settlement falls within the 15 km catchment radius. | `lib/analysis/metrics/labour.ts` |
| `labour.labour_proxy` | No sector-specific labour-market data source is integrated. Deriving one from population alone (e.g. a generic participation-rate multiplier) would be false precision dressed as a real signal, not an honest improvement — see `docs/DECISIONS.md`. Candidate real source: PLFS (Periodic Labour Force Survey) district data, or a paid labour-market dataset. | `lib/analysis/metrics/labour.ts` |
| `climate.flood_exposure_proxy`, `climate.extreme_heat_days` | No free hazard/climate data source is integrated (candidates: India-WRIS, Bhuvan hazard atlas, IMD normals). | `lib/analysis/metrics/climate.ts` |

Every one of these reports `status: "missing"`, `raw_value: null`, `normalized_value: null`
— never a zero, never an invented number. See `lib/analysis/metric.ts` (`missingMetric`).

## Future / not-yet-integrated sources

See `docs/API_CATALOGUE.md` for the provider interfaces these will need to satisfy, and
`docs/MANUAL_ACTIONS.md` for what a human needs to do to wire one in (account, API key,
dataset download).
