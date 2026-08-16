# Decisions

Architectural choices and the reasoning behind them. When a decision changes, add a new
entry with OLD / NEW / WHY / IMPACT rather than editing history away.

## MapLibre GL JS + Terra Draw for the map

**Decision:** MapLibre (open-source, no API key) for rendering, Terra Draw + its MapLibre
adapter for drawing/editing.
**Why:** Zero-cost, zero-key mapping is a hard MVP constraint. MapLibre is the maintained
open fork of Mapbox GL JS pre-license-change; Terra Draw is a maintained, framework-agnostic
drawing library with first-class MapLibre support.
**Impact:** No vendor lock-in, but two known lifecycle interactions had to be solved
explicitly (see below) rather than "just working."

## Terra Draw / MapLibre lifecycle: style swap must not destroy the draw session

**Decision:** `SiteMap.tsx` guards the basemap-swap effect with `appliedBasemapIdRef` so
`map.setStyle()` only fires on an *actual* basemap change, not on the initial
`mapLoaded: false → true` transition.
**Why:** `setStyle()` tears down every source and layer, including the ones Terra Draw just
created moments earlier in the same `load` handler. Without the guard, the map's own startup
sequence looked like a basemap change and destroyed the fresh Terra Draw session,
surfacing as `setData` errors on a removed source.
**Impact:** Basemap switching (OSM ↔ Offline) works without disturbing an in-progress draw.

## Terra Draw rectangle mode: `click-drag`, not the library default

**Decision:** `TerraDrawRectangleMode` is explicitly configured with
`drawInteraction: "click-drag"`.
**Why:** Terra Draw's default rectangle interaction is click-move-click, but the workspace's
own tool hint documents rectangles as a click-and-drag gesture. Configuring the mode to
match is simpler and more honest than changing the UI copy to match an unfamiliar gesture.
**Impact:** Rectangle drawing matches its own on-screen instructions; browser-verified.

## Terra Draw polygon closing-point handling

**Decision:** the map's `change` handler only runs its "keep only the latest feature"
dedup logic when Terra Draw is in `select` mode.
**Why:** Terra Draw emits `update` events continuously while a polygon is still being
drawn (including for its own closing-point marker features). Running the dedup logic
against those in-progress events fought Terra Draw's own bookkeeping and corrupted the
draw session.
**Impact:** Polygon drawing (including the closing click) works reliably; validated in
this session's browser verification (draw → save → reload → 3/3 site types confirmed).

## Local-first with IndexedDB, Supabase reserved but not connected

**Decision:** all persistence goes through a `RepositoryBundle` interface
(`lib/repositories/types.ts`), backed today by IndexedDB, with domain types already using
`snake_case` field names matching the eventual Postgres schema.
**Why:** The brief is explicit — no Supabase connection without manual authorization, but
the architecture must make that swap a repository implementation, not a rewrite. Domain
types (`types/domain.ts`) were written once against the *production* shape (per the
project's engineering blueprint) rather than against IndexedDB's shape, specifically so
connecting Supabase later doesn't touch a single service or component.
**Impact:** `lib/repositories/index.ts` and `lib/client/index.ts` both throw a clear error
if `NEXT_PUBLIC_PERSISTENCE_DRIVER=supabase` is set — a hard failure rather than a silent
fallback to local storage, because believing you're writing to Supabase while writing to
the browser is a far worse outcome than a crash. See MANUAL_ACTIONS.md for the connection
procedure when it's time.

## Deterministic scoring and financial engines — no LLM in the numbers

**Decision:** `lib/scoring`, `lib/financial`, and every metric builder in `lib/analysis` are
pure, deterministic TypeScript with zero AI involvement anywhere in the calculation path.
**Why:** Explicit project rule — "Do not let the LLM produce scores," "financial formulas
must be pure deterministic code." An LLM is non-reproducible and unauditable for numbers an
analyst will underwrite a real acquisition against.
**Impact:** Every number in the app is unit-tested (179 tests) and reproducible by hand
from `docs/SCORING_MODEL.md` / `docs/FINANCIAL_MODEL.md`. The AI layer (`lib/ai/`) only
*reads* these outputs and formats them into sentences — see the next decision.

## Evidence-first, deterministic AI layer — no LLM API key required

**Decision:** the "Analyst" tab (`lib/ai/explain.ts`, `components/analysis/AnalystTab.tsx`)
answers a fixed set of canned questions by templating over the same
analysis/scoring/financial outputs shown elsewhere in the UI. No Anthropic (or any) API key
is required for this MVP.
**Why:** The brief explicitly forbids assuming Claude Pro includes API credits, and forbids
"faking AI" — a chatbot wrapper that quietly hardcodes responses would violate that. The
alternative chosen instead is a *real* deterministic system: `lib/ai/tools.ts` exposes the
same tool functions (`get_site_analysis`, `compare_sites`, `get_financials`,
`get_evidence`, `get_metric`) a future LLM integration would call, and
`lib/ai/explain.ts` is what a template-based (or eventually model-based) layer builds
sentences from. Swapping in a real model later is additive — the tool contract doesn't
change.
**Impact:** Zero cost, zero external dependency, fully testable
(`tests/ai/explain.test.ts`), and answers can never contain an invented number because
they're built from values that were already computed and displayed elsewhere.

## Straight-line distance, never presented as a route

**Decision:** every accessibility/infrastructure distance in this MVP
(`lib/geo/nearest.ts`) is geodesic straight-line distance. Route distance and route time
are explicit `missing` metrics, not straight-line numbers relabeled.
**Why:** Explicit project rule — "Ordinary vehicle routing is NOT equivalent to heavy-truck
routing... If truck-specific constraints are unavailable, explicitly label the metric." No
routing provider is implemented yet, so the honest answer is "missing," not a
straight-line proxy dressed up as a route.
**Impact:** An analyst comparing two sites near a river or rail crossing won't be misled
into thinking straight-line distance reflects actual drive distance. See
`docs/API_CATALOGUE.md` → RoutingProvider for the future integration path.

## No fabricated data — missing means missing

**Decision:** labour and climate/hazard metrics report `status: "missing"`,
`raw_value: null` rather than a fabricated proxy.
**Why:** Explicit project rule — a proxy invented for this MVP with no real basis is worse
than an honest gap. A density-of-residential-POIs "labour proxy" was considered and
rejected for exactly this reason (see `lib/analysis/metrics/labour.ts` comment).
**Impact:** The suitability score's `coverage` field is visibly less than 100% for every
site in this MVP. As of the initial session, 6 of 18 metrics (route distance, route time,
both labour metrics, both climate metrics) were always missing, capping coverage around
67% regardless of site quality. **Update (2026-08-16):** route distance/time (Phase 1) and
`labour.population_proxy` (Phase 2) now resolve to real data for most sites in the OSM
coverage area, raising the typical ceiling to ~90-95% — but only for sites where that data
actually exists (outside coverage, or with no nearby population-tagged settlement, they
still honestly report missing). `labour.labour_proxy` and both climate/hazard metrics
remain always missing. The signal stays correct and honest either way — coverage reflects
what data actually exists for *this* site, never a fixed floor.

## Real OpenStreetMap data over synthetic/mock data

**Decision:** rather than hand-writing a small "curated" or "mock" dataset for
accessibility/market/infrastructure metrics, this session built a real ingestion pipeline
(`ingest/sources/osm/fetch.mjs`) against the free Overpass API and shipped the resulting
snapshot as PRELOADED data.
**Why:** The project brief prioritizes "PRELOAD + CACHE + NORMALIZE + QUERY over runtime
scraping" and explicitly ranks real OSM roads/POIs above curated/mock data. Network access
to the public Overpass API was confirmed available in this environment, so there was no
reason to settle for a lower-fidelity synthetic dataset.
**Impact:** Accessibility and market metrics reflect the real, current road network and
industrial footprint of the corridor (5,089 road segments, 683 POIs at last ingest), not a
handful of hand-picked points. Re-running `npm run ingest:osm` refreshes it.

## OSRM public demo server for routing — a deliberate, documented exception to "no live API calls"

**Decision (2026-08-16, supersedes part of "Straight-line distance, never presented as a
route" below):** `access.route_distance` / `access.route_time` now fetch a real route live,
client-side, from the free OSRM public demo server (`lib/providers/routing/osrm.ts`),
rather than staying permanently `missing`.
**Why:** A routing engine cannot be pre-ingested like roads/POIs — the destination (the
analyst's drawn site) is not known ahead of time, so "preload once, query locally" doesn't
apply the way it does for OSM. The alternative (staying permanently missing) was strictly
worse once a free, keyless, real routing engine was confirmed reachable. The straight-line
rule itself is unchanged: `lib/geo/nearest.ts` distances are still never relabeled as
routes — this decision adds a second, genuinely different measurement alongside them, not
a reinterpretation of the first.
**Impact:** This is the one deliberate exception to "the app never calls a live API at
runtime" (which still holds for OSM/Overpass). Documented explicitly in
`docs/DATA_SOURCES.md` § "OSRM public demo server" and `docs/API_CATALOGUE.md` so a future
session doesn't mistake it for a violation of the no-live-API pattern. Output is always
labeled "ORDINARY ROAD ACCESS PROXY" — ordinary passenger vehicle, not truck routing.
Network failure degrades to `missing`, never a thrown error or a fabricated number.

## OSM settlement population tags for the labour proxy — real sparse data over a derived multiplier

**Decision (2026-08-16):** `labour.population_proxy` sums OSM `population` tags for
settlements within a 15 km catchment of the site. `labour.labour_proxy` (sector-specific
labour availability) stays explicit `missing` — it is NOT derived from the population
figure via a participation-rate multiplier or similar.
**Why:** Population data via OSM tags is real (not fabricated) but sparse and
contributor-entered — an honest proxy, confidence capped at 0.4, and the existing
low-confidence warning UI surfaces it on every site automatically. Multiplying that number
by a generic labour-force-participation rate to produce a second "labour availability"
figure would launder the same weak population signal into a more confident-looking,
sector-specific number — false precision, not an honest improvement. The explicit project
rule ("missing is more honest than invented") applies here even though a *number* could
technically be produced; the bar is whether the number means what its label claims.
**Impact:** One of the two labour metrics now has real data instead of being permanently
missing; the other stays honestly missing until a real labour-market dataset (e.g. PLFS
district data) is integrated — see `docs/ROADMAP.md` → NEXT.

## Pune / Chakan / Talegaon geography, Grade-A logistics use case

**Decision:** the OSM ingestion bounding box, the default weight profile, the financial
assumption defaults, and the curated anchor list are all specific to this corridor and
asset class.
**Why:** Explicit initial-scope instruction — build for one geography and one use case
first, without baking that geography into the architecture as a hardcoded assumption. See
`lib/geo/ellipsoid.ts` → `utmSridFor()`, which derives the correct UTM zone for *any*
position rather than hardcoding Pune's.
**Impact:** Expanding to a second geography means re-running the ingest script with a new
bounding box and adding a new curated assumption set — not rewriting the engines.
