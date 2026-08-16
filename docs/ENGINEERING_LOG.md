# Engineering Log

Session-by-session history. Read newest-first; each entry is written so a future session
doesn't have to rediscover the codebase from scratch.

---

## 2026-08-16 — Phase 9: Site comparison "why not" + financial outcomes (this session)

**Starting state:** Phase 8 (financial overrides) just landed — 208/208 tests. The Compare
tab already showed a deterministic "why this site ranks first" narrative
(`explainRanking`) plus a category-score table, but nothing explained WHY a trailing site
trailed, and the comparison table had no financial figures at all.

**Implemented:**
- `lib/scoring/rollup.ts` — `categoryPerformance()` extracted verbatim from a
  `CompareTab`-local `categoryScore()` function (same math, same "independent of
  cross-category redistribution" property) so it can be shared between the Compare tab's
  table and the new explanation function without drifting apart.
- `lib/ai/explain.ts` → `explainWhyNot(analyses, siteId)` — for any non-leading site,
  walks every metric category, calls `categoryPerformance()` for both the target and the
  leader, and emits a strength bullet (target ahead by >5pp) or weakness bullet (target
  behind by >5pp); below that margin, nothing is said — "spread thinly across many
  factors" is the honest answer, not a manufactured bullet. Also compares high-severity
  warning counts for a risk bullet. Deliberately does NOT touch financial data (that's an
  async fetch, out of place in a pure function alongside every other `explain.ts`
  function).
- `components/analysis/CompareTab.tsx` — renders one card per non-leading site from
  `explainWhyNot()`, appends a financial-outcome bullet computed client-side (fetches each
  site's base-case `FinancialScenarioResult` via the `tools` prop, now threaded in from
  `AnalysisWorkspace`), and adds IRR / equity multiple rows to the existing comparison
  table.
- Docs: ROADMAP.md.

**Tests:** 219 passing (up from 208) — 5 new in `tests/scoring/rollup.test.ts`
(weighted average, missing-metric exclusion, cross-category redistribution independence),
6 new in `tests/ai/explain.test.ts` (`explainWhyNot`: null for <2 sites, null for the
leader itself, weakness bullet, strength bullet, risk bullet, "no dominant factor" case).

**Browser verification (Playwright, ephemeral, same pattern as prior phases):** drew two
sites, opened Compare. "Why not Candidate Site B?" card correctly read "0.4 pts behind
Candidate Site A" / "− Weaker site quality (88.8% vs 100.0%)" — matching the visible
category table exactly, as designed. IRR/equity-multiple rows rendered "—" with an
explanatory hint (neither site had a land price entered in this test run). Zero console
errors.

**Known limitations:**
- The financial-outcome bullet only compares base-case IRR — matches the comparison
  table's existing base-case-only choice (full downside/base/upside detail lives in the
  Financials tab), not a new limitation introduced here.
- Category margin (5 percentage points) for a strength/weakness bullet is a CURATED
  threshold choice, not derived from anything — documented here as such.

**Next phase:** Phase 10 (evidence/provenance — data freshness, coverage, conflict
display) is the next item with no new external data dependency. See ROADMAP.md → NEXT.

---

## 2026-08-16 — Phase 8: Financial assumption override controls (this session)

**Starting state:** Phase 7 (weight sliders) just landed — 201/201 tests. Financial engine
already supported `rent_inr_per_sqft_per_month`, `construction_cost_inr_per_sqft`, and
`exit_cap_rate_pct` overrides (`FinancialOverrides`), plus land price via the site detail
panel, but nothing in the UI could set them, and `stabilized_occupancy_pct`/`soft_cost_pct`/
`development_period_months` had no override support in the engine at all yet.

**Implemented:**
- `lib/financial/types.ts` — `FinancialOverrides` extended with the 3 missing fields.
- `lib/financial/engine.ts` — `buildFinancialScenario()` honors all 6 overridable fields
  (land price was already override-aware). Classification flips `CURATED` → `USER_INPUT`
  per-field when that specific field is overridden — untouched fields stay `CURATED`.
  Occupancy override still gets `clamp01()`'d and still has the scenario delta layered on
  top, matching the existing rent/construction-cost/cap-rate pattern exactly (no new
  pattern invented). `development_period_months`'s calculation_note explicitly states it
  drives no output formula yet — checked `computeOutputs()` to confirm this honestly (no
  phased construction draw is modelled anywhere in the engine).
- `lib/ai/tools.ts` — `getFinancials()` / `getAllFinancialScenarios()` both gained an
  optional `overrides?: FinancialOverrides` parameter, threaded straight into
  `buildFinancialScenario`/`buildAllScenarios`.
- `components/analysis/FinancialsTab.tsx` — a 6-field override form (number inputs,
  `%`-unit fields converted display↔stored-fraction) above the existing downside/base/
  upside table. "Reset to defaults" (shown only when at least one override is active)
  clears the override state; overrides also auto-clear on site change so nothing leaks
  across sites. Scenario comparison itself needed no new work — the 3-column table already
  existed.
- Docs: FINANCIAL_MODEL.md (new "Interactive overrides" section), ROADMAP.md.

**Tests:** 208 passing (up from 201) — 7 new in `tests/financial/engine.test.ts`
(occupancy override + clamp, soft-cost override + RLV effect, development-period override
proven to be a no-op on outputs, classification flip, scenario multiplier still applies on
top of an override), 1 new in `tests/ai/tools.test.ts` (overrides thread through both
tools.ts methods).

**Browser verification (Playwright, ephemeral, same pattern as prior phases):** drew a
site, set a land price, opened Financials, overrode rent to ₹50/sqft/month — NOI rose from
₹2,944 Cr → ₹6,134 Cr (base case) instantly, "Reset to defaults" appeared, clicking it
restored ₹2,944 Cr exactly. Zero console errors.

**Known limitations:**
- Overrides are session-only (component state), not persisted per project or per scenario
  — same category of gap as Phase 7's weight profiles (see ROADMAP.md → NEXT).
- Land price stays edited only via the site detail panel by design — not duplicated into
  the Financials tab's override form, to avoid two controls disagreeing about one value.

**Next phase:** with Phase 1/2/7/8 all landed, the next highest-leverage items with no new
external data dependency are Phase 9 (comparison "why this site ranks first / why not this
one") and Phase 10 (evidence/provenance conflict display) — both pure UI/engine work over
data that already exists. See ROADMAP.md → NEXT.

---

## 2026-08-16 — Phase 7: Interactive weight-profile controls (this session)

**Starting state:** Phase 2 (labour/population) just landed — 198/198 tests. Weight-profile
selection was preset-only (a dropdown between Default and Accessibility-Focused);
`lib/scoring/reweight.ts` already had the pure `reweightCategory()` engine (used by the
Analyst tab's one canned "what if accessibility were 35%?" question) but no interactive
UI, per ROADMAP.md → IN PROGRESS/PARTIAL.

**Investigated before writing UI code:** traced how a weight-profile change actually flows
to a re-render. Found two real gaps that would have made sliders either broken or
expensive:
1. `useSiteAnalyses`'s refresh effect depended on `[tools, sites...]` only — `tools`
   mutating its internal weight profile via `setWeightProfile()` doesn't change the `tools`
   *reference*, so React had no signal to re-fetch. Switching even the existing preset
   dropdown was silently not recalculating the score (a latent bug, not just a missing
   feature).
2. `AnalysisTools`'s cache key was `${site.id}:${site.updated_at}:${weightProfile.id}` on
   the FULL analysis (metrics + score together) — a slider drag generates many distinct
   derived profile ids, each a cache miss that would have re-run the spatial queries AND
   re-hit the live OSRM demo server on every intermediate slider position.

**Implemented:**
- `lib/scoring/reweight.ts` — `categoryWeight()`/`reweightCategory()` extended to accept a
  category *or an array of categories* as one control (needed because `climate` and
  `hazard` are two separate `MetricCategory` values but the spec's UI asks for one combined
  "Climate/Risk" slider). Fully backward-compatible — existing single-category call sites
  unchanged.
- `lib/ai/tools.ts` — split `cache` into `metricsCache` (keyed by
  `${site.id}:${site.updated_at}`, expensive: spatial queries + live route fetch) and
  `scoredCache` (additionally keyed by `${weightProfile.id}`, cheap: `scoreSite()` only). A
  weight-profile change now only ever reruns the cheap step.
- `components/analysis/useSiteAnalyses.ts` — added an explicit `refreshKey` parameter so a
  weight-profile change (passed as `activeProfile.id` from the caller) has a dependency-array
  signal to actually re-fetch. Fixes gap #1 above for both presets and the new sliders.
- `components/analysis/WeightControls.tsx` — six `<input type="range">` sliders (Site
  Quality, Accessibility, Infrastructure, Market, Labour, Climate/Risk), each reading its
  current share via `categoryWeight()` and deriving a new profile via `reweightCategory()`
  on change. A `field-hint` line explains the redistribution model; a "Reset to preset"
  button (shown only when a custom profile is active) clears back to the selected preset.
- `components/analysis/AnalysisTab.tsx` / `AnalysisWorkspace.tsx` — replaced the single
  `weightProfileId`/`onWeightProfileChange` prop pair with `presetId` (dropdown),
  `activeProfile` (preset or derived-custom, whichever is active), `isCustomProfile`, and
  the three handlers. `activeProfile` flows into both `useAnalysisTools` (so Compare/
  Analyst/Report tabs also reflect the live weights — not just the Analysis tab) and
  `useSiteAnalyses`'s new `refreshKey`.
- `app/globals.css` — `.range` style matching the existing dark theme (accent-colored
  thumb via `accent-color`, not a from-scratch custom slider).

**Tests:** 201 passing (up from 198) — 2 new in `tests/scoring/reweight.test.ts` (category-
group reweighting), 1 new in `tests/ai/tools.test.ts` proving a weight-profile change never
re-fetches the route (spy on `getRoute`, called once across two different profiles) while
the score itself does change.

**Browser verification (Playwright, ephemeral, same pattern as prior phases):** drew a
site, opened Analysis, dragged Accessibility from 24% → 70% via the slider. Score moved
65.9 → 84.1 instantly, all six categories continuously summed to 100%, "Reset to preset"
appeared, zero console errors, zero additional network requests (confirmed no OSRM
re-fetch).

**Known limitations:**
- Custom weight profiles are session-only — not persisted per project (see ROADMAP.md).
- No slider for `geo.site_area` because it's deliberately unweighted (informational only,
  documented in SCORING_MODEL.md) — unaffected by this change.

**Next phase:** Phase 8 (financial assumption UI controls) — same "engine already supports
it, UI doesn't yet" shape as this phase, per ROADMAP.md → NEXT.

---

## 2026-08-16 — Phase 2: Labour/population proxy (this session)

**Starting state:** Phase 1 (routing) just landed — 195/195 tests, coverage typically
~90%. `labour.population_proxy` and `labour.labour_proxy` were both permanently `missing`
(no LabourProvider).

**Investigated:** Census of India district data requires either a manual download (no live
API without an account/key at data.gov.in) or hand-curated figures (risky — would need
CURATED classification with no easy per-town verification). Confirmed via `curl` that
Overpass (already the project's approved free data source) returns real `population` tags
on settlement nodes in the corridor — reusing the existing OSM ingest pipeline rather than
building a second data pipeline for Census, per "reuse existing architecture, smallest
correct change."

**Implemented:**
- `ingest/sources/osm/fetch.mjs` → `PLACES_QUERY` fetches `place=city|town|village|suburb`
  nodes with a `population` tag in the same bbox. `parsePopulation()` only accepts a clean
  integer — malformed tags (`"10lakh"`, `"~50000"`) are discarded, logged, never guessed
  at. Re-ran `npm run ingest:osm` for real: 5,089 roads / 683 POIs (unchanged — confirms no
  regression) + 5 usable places (1 discarded: Ghorpuri, `"10lakh"`).
- `lib/data/osm/types.ts` → `OsmPlace`, `OsmDataset.places`, `manifest.places`.
  `lib/data/osm/provider.ts` fetches `places.json` alongside roads/POIs.
- `lib/analysis/metrics/labour.ts` → `labour.population_proxy` sums population of places
  within a 15 km CURATED catchment radius (`pointsWithinRadius`, already existed in
  `lib/geo/nearest.ts` — no new geometry code needed). Confidence capped at 0.4 (sparse,
  contributor-entered). `labour.labour_proxy` stays explicit `missing` — deliberately NOT
  derived from population via a participation-rate multiplier (see `docs/DECISIONS.md`:
  that would be false sector-specific precision, not a real signal).
- `lib/analysis/sources.ts` → `osmPlaceSource()`.
- Docs: DATA_SOURCES.md (§1a), MANUAL_ACTIONS.md, DECISIONS.md (new entry + amendment to
  the coverage numbers in "No fabricated data"), ROADMAP.md.

**Tests:** 198 passing (up from 195) — 6 new in `tests/analysis/engine.test.ts`: catchment
sum, out-of-radius exclusion, missing-when-nothing-nearby, labour_proxy stays missing even
when population resolves, climate/hazard re-verified still missing.

**Browser verification (Playwright, ephemeral, same pattern as Phase 1):** drew a site near
Chakan, Analysis tab showed "Population within catchment" = real value from the actual
ingested `places.json` (Chakan's 41,100), correctly flagged by the existing
LOW_CONFIDENCE_METRIC warning (0.40 < 0.5 threshold — this UI already existed, no new code
needed to surface it), score coverage 95%, zero console errors.

**Decision:** did not attempt to derive `labour.labour_proxy` from the population figure.
See `docs/DECISIONS.md` for the full reasoning — population is real but saying it measures
"warehouse/logistics labour availability" would not be true no matter what multiplier is
applied.

**Known limitations:**
- Only 5 settlements in the entire corridor carry a usable OSM population tag — most sites
  drawn outside Pune/Chakan/Pimpri-Chinchwad/Wagholi/Hinjawadi's 15 km catchments will still
  see `population_proxy` as missing. Documented as a MANUAL_ACTIONS follow-up (Census
  download would widen this without changing the metric's shape).
- `labour.labour_proxy` remains permanently missing — needs a real labour-market dataset
  (PLFS is the leading free candidate), not a derivation.

**Next phase:** Phase 7/8 (weight-profile and financial UI controls) — highest-leverage
remaining item that needs no new external data, per `docs/ROADMAP.md` → NEXT.

---

## 2026-08-16 — Phase 1: RoutingProvider (this session)

**Starting state:** 179/179 tests passing, typecheck/lint/build clean. `access.route_distance`
/ `access.route_time` were permanently `missing` — no routing provider existed. This was the
top item in ROADMAP.md → NEXT.

**Phase-gate discipline followed:** read ROADMAP/ENGINEERING_LOG/MANUAL_ACTIONS/DATA_SOURCES/
API_CATALOGUE first, then the actual implementation (`lib/analysis/engine.ts`,
`lib/analysis/metrics/accessibility.ts`, `lib/ai/tools.ts`, `lib/geo/nearest.ts`) before
writing anything, per the standing "inspect before you build" rule.

**Implemented:**
- `lib/providers/routing/` — a `RoutingProvider` interface
  (`getRoute`/`getDistance`/`getDuration`/`getIsochrone`) plus one implementation,
  `osrmDemoRoutingProvider`, against the free public OSRM demo server
  (`router.project-osrm.org`, keyless, CORS-open, verified live). `getIsochrone` honestly
  resolves `null` — the public demo has no isochrone endpoint. Network failure/timeout/
  malformed response all degrade to `null`, never a thrown error. In-module route
  memoization to avoid re-hitting the demo server for an unchanged site.
- `lib/geo/nearest.ts` → `nearestVertex()` — closest polyline vertex to a point, used as a
  routing waypoint (a routing engine snaps to the real network regardless, so this avoids
  inverting the tangent-plane projection used elsewhere in the module).
- `lib/analysis/metrics/accessibility.ts` → `findNearestHighway()` exported (was inline),
  and `buildAccessibilityMetrics()` now accepts an optional pre-fetched route outcome —
  same "pre-fetch in the caller, stay pure/sync in the engine" pattern the OSM dataset
  already used. Three distinct states: not attempted (original "no provider" reason),
  attempted-but-unavailable, and a real result — never conflated.
- `lib/analysis/engine.ts` → `runSiteAnalysis()` threads the route outcome through; still
  fully synchronous, still zero I/O of its own.
- `lib/ai/tools.ts` → `AnalysisTools` now takes an optional `routing: RoutingProvider | null`
  dependency (defaults to the OSRM demo provider), and `getSiteAnalysis()` resolves the
  route live (site centroid → nearest highway waypoint) before calling the engine. Wrapped
  in try/catch — a provider throwing never breaks the rest of the analysis.
- `lib/analysis/sources.ts` → `routingSource()` — the first `LIVE`-classified source in
  this MVP (every prior source was PRELOADED/CURATED/DERIVED).
- `lib/scoring/weights.ts` — `access.route_distance` (4%/6%) and `access.route_time`
  (3%/4%) added to both weight profiles, carved out of the existing
  `nearest_road_distance`/`nearest_highway_distance` weights so each profile's total (and
  each category's total) is unchanged — not a rebalancing across categories, just within
  accessibility.
- Docs: DATA_SOURCES.md (§2a, new LIVE source), API_CATALOGUE.md (OSRM endpoint + Routing
  Provider status flip), SCORING_MODEL.md (weight table + redistribution note),
  MANUAL_ACTIONS.md (self-host-OSRM upgrade path + truck-routing paid-provider entry),
  ROADMAP.md.

**Tests:** 195 passing (up from 179) — 16 new: `tests/geo/nearest.test.ts` (`nearestVertex`),
`tests/providers/routing/osrm.test.ts` (8 cases against a stubbed `fetch` — success,
non-ok, no-route, thrown/network error, memoization, isochrone-unsupported, mode-label;
NO real network call, per the project's test-suite rule), `tests/analysis/engine.test.ts`
(route outcome states + a score-integration case proving coverage rises when the route
resolves), `tests/ai/tools.test.ts` (3 cases: provider configured, explicitly disabled,
provider throws).

**Browser verification (Playwright, headless Chromium, ephemeral `npm install --no-save
playwright` — not left in package.json/lock):** created a project, drew a rectangle over
Chakan/NH60, saved it, opened the Analysis tab. Route distance resolved live: **1,961 m,
LIVE classification, 65% confidence, weight 4%**, calculation note correctly reads
"ORDINARY ROAD ACCESS PROXY — ... computed live via OSRM (public demo server)". Score
coverage rose from the previous ~67% ceiling to **90%** (only labour ×2 + climate ×2 still
missing — exactly the expected 10% of weight). Zero console errors across the flow.

**Decision:** route destination is "nearest mapped highway," not an arbitrary hub (Pune
city centre, JNPT direction, etc.) — it directly complements the existing straight-line
`access.nearest_highway_distance` metric (same destination, real-road distance instead of
straight-line), which is more defensible than picking a destination with no existing
metric to anchor against.

**Known limitations:**
- Ordinary-vehicle routing only — see "Truck-specific routing" in MANUAL_ACTIONS.md.
- Public OSRM demo server, not self-hosted — light-use policy, not a production SLA (see
  MANUAL_ACTIONS.md § "Self-host OSRM").
- Route is fetched live per analysis run (in-memory cache only, not persisted) — the one
  deliberate exception to "the app never calls a live API at runtime," documented in
  DATA_SOURCES.md / API_CATALOGUE.md.

**Next phase:** Phase 2 (Labour/population) or Phase 7/8 (weight-profile and financial
UI controls) — see ROADMAP.md → NEXT.

---

## 2026-08-16 — Analysis, scoring, financial, evidence, and AI slices (this session)

**Starting state:** the repository already contained a complete, high-quality local-first
Phase 1 (project creation, map workspace, draw/save/reload, 114 passing tests, clean
typecheck/lint/build). This session verified that foundation, then built everything above
it: the site-intelligence and underwriting product itself.

**Phase gate discipline followed:** inspected the entire existing codebase before writing
any code; ran the full check suite (typecheck/lint/test/build) and a headless-Chromium
browser verification of the Phase 1 golden path (polygon → rectangle → point → save →
reload → detail panel) *before* starting new work, per the project's own "do not continue
if a core regression exists" rule. All passed — no regressions found, no fixes needed to
Phase 1.

**Implemented:**
- Real OpenStreetMap ingestion (`ingest/sources/osm/fetch.mjs`, `npm run ingest:osm`) —
  confirmed outbound network access to the free Overpass API, then fetched real roads and
  industrial/logistics POIs for the Pune/Chakan/Talegaon corridor (5,089 road segments, 683
  POIs), normalized and cached as static JSON with full provenance in
  `public/data/osm/`.
- `lib/geo/nearest.ts` — geodesic point-to-polyline / point-to-point nearest-feature search,
  local tangent-plane projected, bounded search radius.
- `lib/data/osm/` — dataset types and a memoized client-side loader (never called from the
  running app for live data — only the manual ingest script talks to Overpass).
- `lib/analysis/` — the SiteAnalysis engine: 18 metrics across geography, accessibility,
  infrastructure, market, labour, and climate/hazard, each with full `SourceMetadata`
  provenance. Labour and climate metrics honestly report `missing` — no fabricated proxy.
- `lib/scoring/` — deterministic weighted scoring with missing-weight redistribution,
  coverage/confidence reporting, two weight profiles, and a category-reweighting helper.
- `lib/financial/` — NOI/GDV/TDC/yield-on-cost/RLV/IRR/equity-multiple engine, three
  scenarios, every input classified, UNKNOWN land price propagates to null outputs (not a
  guessed number). Bisection IRR solver (unconditionally convergent for this cash-flow
  shape, unlike Newton's method).
- `lib/evidence/` — evidence deduplication and citation-lookup over analysis metrics.
- `lib/ai/tools.ts` + `lib/ai/explain.ts` — the deterministic AI tool layer (6 read-only
  tools) and 5 canned-question analyst-assistant templates. No LLM, no API key, in this
  MVP — by design, not by omission (see `docs/DECISIONS.md`).
- Full UI: a 7-tab workspace (Map & Sites / Analysis / Compare / Financials / Evidence /
  Analyst / Report) wired into the existing `Workspace.tsx` without disturbing the
  original 3-column draw/select layout.
- Full `docs/` suite (this file plus README, MANUAL_ACTIONS, DECISIONS, DATA_SOURCES,
  API_CATALOGUE, FINANCIAL_MODEL, SCORING_MODEL, ANALYST_WORKFLOW, ROADMAP).

**Tests:** 179 passing (up from 114) — 65 new tests across `tests/geo/nearest.test.ts`,
`tests/analysis/`, `tests/scoring/`, `tests/financial/`, `tests/evidence/`, `tests/ai/`.
Zero tests depend on a live network call or an LLM.

**Decisions:** see `docs/DECISIONS.md` for the full reasoning; the headline ones are
"deterministic scoring/financial engines, no LLM in the numbers," "evidence-first AI layer
with no API key required," "straight-line distance never presented as a route," and "real
OpenStreetMap data over synthetic/mock data" (network access was confirmed available, so
there was no reason to settle for a lower-fidelity dataset).

**Bug found and fixed during browser verification:** the Compare tab's per-category score
rollup initially divided each category's *redistributed* contribution by its *nominal*
weight, which could read as >100% for a category when heavy redistribution happened
elsewhere (e.g. labour/climate being fully missing inflates every other category's
effective weight globally, not per-category). Fixed to use nominal weight × normalized
value in both numerator and denominator, making the rollup independent of cross-category
redistribution. See `components/analysis/CompareTab.tsx` → `categoryScore()`.

**Known limitations (see ROADMAP.md for the fuller picture):**
- No routing provider — `access.route_distance`/`access.route_time` are always missing.
- No labour or climate/hazard data source — those 4 metrics are always missing (score
  coverage caps around 67% regardless of site quality, which is the honest signal, not a
  bug).
- Weight-profile and financial-assumption overrides are supported by the engines but not
  yet exposed as interactive UI controls beyond weight-profile *selection* and land price.
- Map re-mounts (and re-fetches basemap tiles) on every switch back to the "Map & Sites"
  tab, since the tab implementation conditionally unmounts it. Correct, not broken — a
  minor performance optimization opportunity (keep it mounted, toggle visibility via CSS
  instead) is noted here rather than fixed, given time constraints this session.

**Verification performed:**
- `npm run check` (typecheck + lint + test): clean, 179/179 passing.
- `npm run build`: clean production build.
- Headless-Chromium (Playwright) end-to-end verification of: project creation → draw
  polygon/rectangle/point → save all three → set land price → Analysis tab (score,
  metrics, warnings render correctly) → Compare tab (ranking, category rollups,
  metric-detail table) → Financials tab (3-scenario table, assumptions) → Evidence tab
  (source citations) → Analyst tab (all 5 canned questions produce correct, consistent
  answers) → Report tab (full investment summary, print button) → back to Map & Sites tab
  (state intact, all 3 sites still present). Zero console errors across the entire flow.

**Next step:** see `docs/ROADMAP.md` → NEXT. The highest-leverage next slice is a
RoutingProvider (removes the two permanently-missing accessibility metrics) or a
Labour/Census data source (removes two permanently-missing labour metrics and raises
score coverage materially for every site).

---

## (prior history)

The repository's git history was not available at the start of this session (not a git
repository), so the Phase 1 foundation's own development history is not recorded here
beyond what's already documented in the code itself — see the extensive inline
documentation in `lib/geo/measure.ts`, `lib/geo/validate.ts`, `components/map/SiteMap.tsx`,
and `types/domain.ts`, which each explain their own design decisions and migration notes
in detail.
