# Roadmap

Actual Vantrock milestones, not generic software tasks.

## COMPLETE

- **Site selection slice** — create project, draw polygon/rectangle/point, live
  preview measurements, save, reload, select, delete, edit name/land price. Browser-verified
  end to end (Playwright, headless Chromium) including the golden path: draw all three
  geometry types → save → reload → detail panel shows correct area/perimeter/centroid/bbox.
- **Deterministic geometry engine** — geodesic WGS84 area/perimeter/centroid/bbox, validation
  (self-intersection, area bounds, vertex bounds), normalization (Point → buffered circle,
  Polygon/MultiPolygon winding), 65 unit tests.
- **Real OpenStreetMap ingestion** — `npm run ingest:osm` fetches roads (motorway → secondary)
  and industrial/logistics POIs for the Pune/Chakan/Talegaon corridor from the free Overpass
  API, normalizes and caches as static JSON with full provenance. 5,089 road segments, 683
  POIs at last ingest.
- **Nearest-feature spatial queries** — point-to-polyline and point-to-point geodesic
  nearest-neighbour search over the OSM dataset, local tangent-plane projected for accuracy,
  bounded search radius so out-of-coverage sites report "missing" rather than a nonsense
  distance. 8 unit tests.
- **SiteAnalysis engine** — 18 metrics across geography, accessibility, infrastructure,
  market, labour, and climate/hazard categories, every one carrying full provenance
  (`SourceMetadata`: classification, confidence, calculation note, source URL/license).
  Labour and climate report honest "missing" rather than a fabricated proxy. 8 unit tests.
- **Weighted scoring engine** — explainable weighted sum with missing-weight redistribution,
  coverage and confidence reporting, two selectable weight profiles (default,
  accessibility-focused), and a category-reweighting helper for "what if X were weighted
  Y%" questions. 12 unit tests.
- **Site comparison** — side-by-side table across up to 3 sites, category-level rollups,
  metric-level detail with source tooltips, deterministic ranking explanation.
- **Financial underwriting engine** — NOI, GDV, TDC, yield-on-cost, residual land value,
  IRR (bisection solver), equity multiple, three scenarios (downside/base/upside), every
  input classified (USER_INPUT/CURATED/DERIVED/UNKNOWN), UNKNOWN land price propagates to
  null outputs rather than a guessed number. 22 unit tests.
- **Evidence aggregation** — every metric's source deduplicated and citable by ID, with
  "which metrics cite this source" lookup. 3 unit tests.
- **Deterministic AI tool layer** — `get_site_analysis`, `get_site_metrics`,
  `compare_sites`, `get_financials`, `get_evidence`, `get_metric`, all read-only, all
  backed by the deterministic engines above, per-site cached.
- **Analyst assistant** — 5 canned questions (why does the leader rank first, biggest risk,
  driving assumptions, what would flip the ranking, weight-sensitivity), answered entirely
  from tool outputs, no LLM, no API key. 8 unit tests.
- **Investment summary / printable report** — project, mandate, recommendation, top
  strengths/risks, financial snapshot, comparison table, data coverage, sources,
  limitations. Printable via the browser's native print dialog.
- **Full workspace UI** — 7-tab workspace (Map & Sites, Analysis, Compare, Financials,
  Evidence, Analyst, Report), browser-verified end to end including tab-switch survival of
  the map/draw state.
- **RoutingProvider (Phase 1, 2026-08-16)** — `lib/providers/routing/` behind a
  provider-agnostic interface (`getRoute`/`getDistance`/`getDuration`/`getIsochrone`),
  backed by the free, keyless OSRM public demo server. `access.route_distance` /
  `access.route_time` now report a real ordinary-vehicle route from the site centroid to
  the nearest mapped highway instead of permanent "missing" — labeled "ORDINARY ROAD ACCESS
  PROXY" throughout (never truck routing). Wired into scoring
  (`lib/scoring/weights.ts`). Fetched live, client-side, per analysis run — the one
  deliberate exception to "the app never calls a live API," documented in
  `docs/DATA_SOURCES.md` / `docs/API_CATALOGUE.md`. Degrades to "missing" (never a thrown
  error) on network failure, timeout, or out-of-coverage sites. Browser-verified end to end
  (Playwright, headless Chromium): drew a site near Chakan/NH60, route distance resolved to
  a real value (1,961 m, LIVE, 65% confidence), score coverage rose from ~67% to 90%, zero
  console errors. 16 new tests.
- **Labour/population proxy (Phase 2, 2026-08-16)** — `ingest/sources/osm/fetch.mjs`
  extended to also fetch OSM settlement nodes carrying a `population` tag
  (`public/data/osm/places.json`; malformed tags like `"10lakh"` are discarded, never
  guessed at). `labour.population_proxy` sums population within a 15 km CURATED catchment
  radius of the site, labeled POPULATION PROXY, confidence capped at 0.4 (sparse,
  contributor-entered coverage — the UI's low-confidence warning fires automatically).
  `labour.labour_proxy` stays honestly missing — deriving a sector-specific figure from
  population via a generic participation-rate multiplier would be false precision, not a
  real signal (see `docs/DECISIONS.md`). Browser-verified: a site near Chakan resolved
  population 41,100 from the real ingested data, score coverage 95%, zero console errors.
  6 new tests.
- **Interactive weight-profile controls (Phase 7, 2026-08-16)** — six category sliders
  (Site Quality, Accessibility, Infrastructure, Market, Labour, Climate/Risk — the latter
  spanning both the `climate` and `hazard` metric categories) in the Analysis tab
  (`components/analysis/WeightControls.tsx`), backed by the existing
  `lib/scoring/reweight.ts` (extended to accept a category *group*, not just a single
  category — needed for the combined Climate/Risk control). Dragging a slider derives a new
  profile and recalculates the score immediately; every other category rescales
  proportionally so the total always stays 100%. A "Reset to preset" control returns to the
  selected named profile. **Performance fix alongside this:** `AnalysisTools` (`lib/ai/tools.ts`)
  now caches metrics and score separately — a weight-profile change (including every
  intermediate slider position during a drag) only reruns the cheap `scoreSite()` step,
  never repeats the spatial queries or re-hits the live OSRM routing provider. Also fixed a
  latent gap where switching the weight-profile *preset* dropdown didn't trigger a
  re-render at all (`useSiteAnalyses` had no dependency on the profile). Browser-verified:
  dragging Accessibility from 24% to 70% moved a real site's score from 65.9 to 84.1
  instantly, all six sliders summed to 100% throughout, zero console errors. 5 new tests
  (2 for the category-group reweighting, 1 proving the route is never re-fetched on rescore).
- **Financial assumption override controls (Phase 8, 2026-08-16)** — the Financials tab
  now exposes 6 editable inputs (Rent, Occupancy, Construction Cost, Soft Cost, Exit Cap
  Rate, Development Period) above the downside/base/upside scenario table
  (`components/analysis/FinancialsTab.tsx`); `FinancialOverrides` (`lib/financial/types.ts`)
  extended with the 3 previously-unsupported fields (occupancy, soft cost, development
  period — rent/construction-cost/cap-rate overrides already existed), all threaded through
  `lib/ai/tools.ts` → `getFinancials`/`getAllFinancialScenarios`. An overridden assumption
  flips from `CURATED` to `USER_INPUT` in both the input form and the assumptions table, and
  scenario deltas (downside/upside) still layer on top of the override, same as the
  existing rent/cost/cap-rate overrides. "Reset to defaults" clears back to the CURATED
  base case, and overrides reset automatically when a different site is selected (no
  cross-site leakage). Development period is explicitly documented (in the UI, not just
  the docs) as not yet driving any output formula — honest about the limitation rather than
  implying it does something it doesn't. Scenario comparison already existed
  (side-by-side downside/base/upside table) — no new work needed there. Browser-verified:
  NOI moved 2,944 → 6,134 Cr (base case) on a rent override, reset restored it exactly,
  zero console errors. 8 new tests.
- **Site comparison "why not" + financial outcomes (Phase 9, 2026-08-16)** — the Compare
  tab now renders a deterministic "Why not this site?" card for every non-leading site,
  built from `lib/ai/explain.ts` → `explainWhyNot()`: category-by-category strength/
  weakness bullets (e.g. "Weaker site quality (88.8% vs 100.0%)") plus a risk bullet
  (high-severity warning count vs the leader), each traceable to a real
  `categoryPerformance()` delta or warning count — never an invented judgement. The
  category rollup itself was extracted from a CompareTab-local function into
  `lib/scoring/rollup.ts` so the Compare tab's category columns and the "why not" bullets
  can never silently disagree. The comparison table also gained two new rows — IRR and
  equity multiple (base case) — fetched per site via `AnalysisTools.getFinancials()`; the
  Compare tab appends its own financial-outcome bullet (e.g. "Worse financial outcome (IRR
  X% vs Y%)") to each "why not" card after that fetch, kept out of the pure `explain.ts`
  module since it needs an async fetch the other explain functions don't. "Why this site
  ranks first" already existed (`explainRanking`, shown above the table) — no new work
  needed there. Browser-verified with two real sites: card correctly read "Weaker site
  quality (88.8% vs 100.0%)", IRR/equity multiple rows rendered (showing "—" with an
  explanatory hint for sites with no land price entered), zero console errors. 11 new
  tests (5 for `categoryPerformance`, 6 for `explainWhyNot`).
- **219 automated tests, 0 lint errors, 0 type errors, clean production build.**

## IN PROGRESS / PARTIAL

None right now — see COMPLETE below for the two items that were here (weight-profile and
financial-override UI controls, both landed 2026-08-16).

## NEXT

1. **Financial assumption override UI controls** — surface `FinancialOverrides`
   (rent/construction-cost/cap-rate) as interactive inputs in the Financials tab, with
   downside/base/upside scenario comparison. See Phase 8.
2. **Sector-specific labour data source** — `labour.population_proxy` is real now (Phase
   2); `labour.labour_proxy` still needs an actual labour-market dataset (PLFS district
   data is the leading free candidate) to move beyond permanently missing.
3. **Climate/hazard data source** — India-WRIS flood layers or Bhuvan hazard atlas.
4. **Weight-profile persistence** — the interactive sliders (Phase 7) are in-memory per
   session; persisting a custom profile per project would need a new IndexedDB store +
   repository method, following the exact pattern in `lib/repositories/`.
5. **Self-hosted OSRM** — the public demo server used for Phase 1 routing is free but
   explicitly light-use-only; a production deployment should self-host OSRM (see
   `docs/MANUAL_ACTIONS.md`) and swap `lib/providers/routing/osrm.ts`'s base URL. The
   interface does not change.
6. **Broader population coverage** — only 5 settlement nodes in the corridor carry a
   usable OSM population tag today; a Census of India town/village table (downloaded, not
   live) would widen coverage well beyond OSM's sparse tagging without changing the
   `labour.population_proxy` metric shape, just its source.

## LATER

- **Production basemap** — replace the OSM-dev raster tiles (development-only per OSMF
  policy) with a self-hosted PMTiles extract of the Pune corridor, served from Supabase
  Storage once that's connected. See `docs/MANUAL_ACTIONS.md`.
- **Supabase / Postgres / PostGIS backend** — the repository interface, domain types
  (snake_case fields matching the intended schema), and geometry-engine migration notes are
  all already written for this swap. Not connected — see `docs/MANUAL_ACTIONS.md`.
- **Authentication / RLS** — `owner_id` and the `listByOwner` query path exist specifically
  so Supabase RLS has something to anchor to later, without a schema change.
- **PDF export** — currently print-to-PDF via the browser; a dedicated PDF library is
  explicitly out of scope until there's a real reason beyond decoration.
- **Real LLM-backed analyst** — the deterministic tool layer (`lib/ai/tools.ts`) is
  designed so a real model provider can be added as an additional consumer of the same
  tools, without changing the tools themselves. Needs an Anthropic API key — see
  `docs/MANUAL_ACTIONS.md` when that's authorized.
- **Truck-specific routing** — Mappls enterprise truck routing (paid) is the leading
  candidate to replace the ordinary-vehicle OSRM routing shipped in Phase 1; must never be
  conflated with ordinary-vehicle routing in the UI.
- **Nationwide (or multi-corridor) expansion** — re-run `npm run ingest:osm` with a new
  bounding box and add a new curated assumption set per corridor; the engines themselves
  have no hardcoded geography.
