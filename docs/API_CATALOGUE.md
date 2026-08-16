# API Catalogue

Only verified, real endpoints are documented here. No invented APIs.

## Currently used

### Overpass API (OpenStreetMap)

| Field | Value |
|---|---|
| Provider | Overpass API, `overpass-api.de` |
| Endpoint | `POST https://overpass-api.de/api/interpreter` |
| Authentication | None — free, keyless |
| Purpose | One-time ingestion of roads + industrial/logistics POIs for the Pune corridor |
| Input | Overpass QL query (bounding box + tag filters) — see `ingest/sources/osm/fetch.mjs` |
| Output | Overpass JSON (`elements[]` of nodes/ways with tags and geometry) |
| Free/paid | Free, subject to the public instance's rate limits (handled with retry/backoff in the ingest script) |
| MVP status | **Used, but only from the manual `npm run ingest:osm` script.** The running application never calls this endpoint — it reads the static JSON snapshot the script produces. |
| Commercial usage notes | The Overpass API's public instance usage policy expects reasonable, infrequent, non-automated query volume — exactly what a manual, occasional ingest script does. Do not add a runtime call to this endpoint. |
| Fallback | None needed — the app degrades to "metric missing" for sites outside the ingested bbox, not a failed request. |
| Environment variable | None — no key required. |

### OSRM public demo server (routing)

| Field | Value |
|---|---|
| Provider | Project OSRM, public demo instance |
| Endpoint | `GET https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}` |
| Authentication | None — free, keyless |
| Purpose | Ordinary passenger-vehicle route distance/time from a site to its nearest mapped highway |
| Input | Two lon/lat waypoints |
| Output | OSRM route JSON (`code`, `routes[].distance`, `routes[].duration`) |
| Free/paid | Free, subject to the public demo instance's light-use policy |
| MVP status | **Used live, from the running application**, at analysis time — see `lib/providers/routing/osrm.ts` and `lib/ai/tools.ts`. This is a deliberate exception to "the app never calls a live API at runtime" (which still holds for Overpass/OSM ingestion): route destinations depend on where the analyst draws a site, so they cannot be pre-ingested the way roads/POIs are. |
| Commercial usage notes | The public demo server is explicitly for light, non-commercial, low-volume use — not a production SLA. A production deployment must self-host OSRM (see `docs/MANUAL_ACTIONS.md`) and swap the base URL in `lib/providers/routing/osrm.ts`; the `RoutingProvider` interface does not change. |
| Fallback | Network failure, timeout (7s), or no route found all resolve to `null` — the caller reports the metric `status: "missing"`, never a thrown error or a fabricated number. |
| Environment variable | None — no key required. |
| Vehicle profile | `driving` (ordinary passenger car). **Not truck routing** — every consumer must label output "ORDINARY ROAD ACCESS PROXY." See "RoutingProvider" below for the truck-routing gap. |

## Basemap tiles (development only)

| Field | Value |
|---|---|
| Provider | OpenStreetMap Foundation raster tile servers (`a/b/c.tile.openstreetmap.org`) |
| Endpoint | `GET https://{a,b,c}.tile.openstreetmap.org/{z}/{x}/{y}.png` |
| Authentication | None |
| Purpose | Development-mode basemap tiles for the map canvas |
| Free/paid | Free, but the OSMF tile usage policy explicitly **does not permit production applications** |
| MVP status | Used in `NEXT_PUBLIC_BASEMAP=osm-dev` (the default). The UI shows a persistent "Development basemap" warning banner. |
| Fallback | `NEXT_PUBLIC_BASEMAP=blank` — zero network, offline-capable, no tiles. |
| Environment variable | `NEXT_PUBLIC_BASEMAP` |
| Production requirement | Must be replaced with a self-hosted PMTiles extract before shipping — see `docs/ROADMAP.md` and `lib/providers/basemap/index.ts`. |

## Not implemented — provider interfaces reserved for future use

None of the following are called anywhere in this codebase today. They are named here so a
future session implements against a documented contract rather than guessing.

### RoutingProvider (route distance, route time) — IMPLEMENTED (ordinary vehicle only)

- **Purpose:** real route distance/time between a site and the road network.
- **Implementation:** `lib/providers/routing/types.ts` (interface: `getRoute()`,
  `getDistance()`, `getDuration()`, `getIsochrone()`) and `lib/providers/routing/osrm.ts`
  (the OSRM public demo server — free, keyless). `lib/providers/routing/index.ts` is the
  factory a self-hosted or commercial provider swaps in later without touching any caller.
- **Where it plugs in:** `lib/ai/tools.ts` → `AnalysisTools.getSiteAnalysis()` fetches the
  route live, then passes the result into the still-synchronous, still-I/O-free
  `runSiteAnalysis()` (`lib/analysis/engine.ts`) — the same "pre-fetch, then pass a pure
  value in" pattern already used for the OSM dataset. `access.route_distance` /
  `access.route_time` in `lib/analysis/metrics/accessibility.ts`.
- **What it is NOT:** truck routing. OSRM's public demo only serves the `driving` profile —
  no turn-radius, axle-load, or height/weight restriction data. Every output is labeled
  "ORDINARY ROAD ACCESS PROXY" in its `calculation_note`. Real truck routing (e.g. Mappls
  enterprise, paid) remains a future, explicitly-authorized addition — see
  `docs/MANUAL_ACTIONS.md`.
- **Isochrones:** `getIsochrone()` exists in the interface for a future isochrone-capable
  provider but always resolves `null` today — the OSRM public demo has no isochrone
  endpoint.
- **MVP status:** IMPLEMENTED (2026-08-16). See `docs/ENGINEERING_LOG.md`.

### LabourProvider (population / workforce proxy)

- **Purpose:** a defensible labour-availability signal for the `labour.*` metrics.
- **Candidate free source:** Census of India district-level population/workforce data.
- **Where it plugs in:** `lib/analysis/metrics/labour.ts`.
- **MVP status:** NOT IMPLEMENTED.

### HazardProvider / ClimateProvider (flood, heat, rainfall)

- **Purpose:** real climate/hazard data for the `climate.*` and `hazard.*` metrics.
- **Candidate free sources:** India-WRIS flood layers, Bhuvan hazard atlas, IMD gridded
  rainfall/temperature normals.
- **Where it plugs in:** `lib/analysis/metrics/climate.ts`.
- **MVP status:** NOT IMPLEMENTED.

### MarketDataProvider (leasing comps, absorption, competitive supply)

- **Purpose:** real market-depth data to replace the OSM-POI-count density proxy in
  `lib/analysis/metrics/market.ts`.
- **Candidate sources:** PropStack, CRE Matrix (both paid/commercial — **do not integrate
  without explicit authorization**, per the cost constraint in this project's brief).
- **MVP status:** NOT IMPLEMENTED. Current proxy is honestly labeled `DERIVED`, not `LIVE`.

### GeocodingProvider

- **Purpose:** address-to-coordinate lookup, if a free-text address entry point is ever
  added (today, sites are drawn directly on the map — no geocoding is needed).
- **MVP status:** NOT IMPLEMENTED, not currently needed.

### ElevationProvider

- **Purpose:** site elevation / grading cost proxy.
- **MVP status:** NOT IMPLEMENTED. Not prioritized for the current metric set.

## Anthropic / LLM API

**Not used anywhere in this MVP.** The Analyst tab (`components/analysis/AnalystTab.tsx`,
`lib/ai/explain.ts`) is fully deterministic and template-based — see `docs/DECISIONS.md`
for why. If a real model provider is configured in a future session, `docs/MANUAL_ACTIONS.md`
is where the exact steps (API key, environment variable, security warning) belong — none of
which apply yet because no such integration exists in this codebase.
