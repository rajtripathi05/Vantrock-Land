# Scoring Model

Implemented in `lib/scoring/engine.ts` (the weighted sum + redistribution logic) and
`lib/analysis/metrics/*.ts` (the metrics and their benchmark bands). Unit-tested in
`tests/scoring/` and `tests/analysis/`.

## Formula

```
TOTAL SCORE = Σ (effective_weight_i × normalized_value_i)   for every metric with status "ok"
```

Where `effective_weight_i` redistributes the weight of every excluded (missing /
low-confidence / conflicted) metric proportionally across the metrics that DO have data:

```
available_weight     = Σ weight_i  for metrics with status "ok"
redistribution_factor = total_profile_weight / available_weight
effective_weight_i    = weight_i × redistribution_factor      (for included metrics only)
```

**Why redistribute instead of scoring the missing metric as 0:** a site is not punished
twice for the same gap — once by exclusion, once by a score that can never reach 1.0. The
separate `coverage` field (below) is what tells the analyst how much of that score is
backed by real data, so a high score built on thin coverage never reads identically to one
built on complete data.

`coverage = available_weight / total_profile_weight` — the fraction of total weight backed
by an "ok" metric.

`confidence` — the effective-weight-weighted average of each included metric's own
`confidence` field (how much that specific data point can be trusted, independent of
whether it was available at all).

## Categories and default weights

Default profile: `lib/scoring/weights.ts` → `DEFAULT_WEIGHT_PROFILE`. Sums to 1.0.

| Category | Metric | Weight | Direction | Benchmark band (0 → 1) |
|---|---|---|---|---|
| Site / Land Quality | `geo.gfa_adequacy` | 8% | benefit | Achievable GFA ÷ target GFA, clamped `[0,1]` (ratio ≥ 1 scores full marks) |
| Site / Land Quality | `geo.shape_regularity` | 4% | benefit | Polsby–Popper compactness: 1 at 0.20 (poor/elongated) → 1.0 at 0.75 (near-circular) |
| Accessibility | `access.nearest_road_distance` | 7% | cost | 1.0 at 0 m → 0 at 1,500 m |
| Accessibility | `access.nearest_highway_distance` | 10% | cost | 1.0 at 0 m → 0 at 8,000 m |
| Accessibility | `access.route_distance` | 4% | cost | 1.0 at 0 m → 0 at 10,000 m. Live route to the nearest highway (§ below) |
| Accessibility | `access.route_time` | 3% | cost | 1.0 at 0 min → 0 at 20 min. Live route to the nearest highway |
| Market | `market.poi_count_2km` | 5% | benefit | 0 at 0 count → 1.0 at 40 count |
| Market | `market.industrial_poi_count_2km` | 8% | benefit | 0 at 0 count → 1.0 at 15 count |
| Market | `market.industrial_density_proxy` | 7% | benefit | 0 at 0/km² → 1.0 at 4/km² |
| Infrastructure | `infra.nearest_rail` | 10% | cost | 1.0 at 2,000 m → 0 at 25,000 m |
| Infrastructure | `infra.nearest_airport` | 8% | cost | 1.0 at 5,000 m → 0 at 60,000 m |
| Infrastructure | `infra.nearest_power_substation` | 8% | cost | 1.0 at 1,500 m → 0 at 15,000 m |
| Infrastructure | `infra.industrial_cluster_proximity` | 8% | cost | 1.0 at 500 m → 0 at 10,000 m |
| Labour | `labour.population_proxy` | 5% | benefit | **Always missing in this MVP** — excluded, weight redistributed |
| Labour | `labour.labour_proxy` | 2% | benefit | **Always missing** |
| Climate/Hazard | `climate.flood_exposure_proxy` | 2% | cost | **Always missing** |
| Climate/Hazard | `climate.extreme_heat_days` | 1% | cost | **Always missing** |

`geo.site_area` is computed and shown but carries **no weight** — it's informational
context, not a scored factor (a bigger site isn't inherently "better"; `gfa_adequacy`
already captures whether it's big *enough*).

Route distance/time (`access.route_distance`, `access.route_time`) are now fetched live
from the OSRM public demo server (Phase 1 routing, 2026-08-16) — a real ordinary-vehicle
route from the site centroid to the nearest mapped highway, not a straight line. They carry
weight like any other metric and fall back to the standard missing-weight redistribution
(no special-casing) when the site is outside OSM coverage or the OSRM request fails/times
out. See `docs/DATA_SOURCES.md` § "OSRM public demo server" and
`docs/API_CATALOGUE.md` § "RoutingProvider" for the full provenance and the
"ordinary-vehicle, not truck" caveat.

A second profile, **Accessibility-Focused** (`ACCESSIBILITY_FOCUSED_WEIGHT_PROFILE`), shifts
weight toward the four accessibility metrics (12% + 20% + 6% + 4% = 42% vs. the default's
24%) for mandates where last-mile transit time dominates the investment case. Both profiles
are selectable in the Analysis tab as presets.

### Interactive category weight controls (Phase 7, 2026-08-16)

Beyond picking a preset, the Analysis tab exposes six sliders — one per scored category
(Site Quality, Accessibility, Infrastructure, Market, Labour, Climate/Risk) —
`components/analysis/WeightControls.tsx`. Moving a slider calls
`lib/scoring/reweight.ts` → `reweightCategory(profile, metrics, category, newShare)`: the
target category is set to the requested share and every other category's weight scales
down proportionally, so the total always stays exactly 100%. "Climate/Risk" is a *group*
control spanning both the `climate` and `hazard` metric categories (`reweightCategory` and
`categoryWeight` both accept a single category or an array — extended for this, not
rewritten). The derived profile becomes the active scoring profile immediately; a "Reset to
preset" button returns to the selected named profile.

This reuses the exact same deterministic function the Analyst tab's "what would flip the
ranking?" canned question already used for one-off what-ifs — the sliders are a UI, not a
new calculation. Selecting a category's current share always reads back through
`categoryWeight()`, so the sliders and the score breakdown can never disagree.

**Performance note:** `lib/ai/tools.ts` caches each site's *metrics* (expensive: spatial
queries, plus the live OSRM route fetch) separately from its *score* (cheap: a weighted
sum). A weight-profile change — including every intermediate position while dragging a
slider — only ever re-runs `scoreSite()`, never the metrics computation. Dragging a slider
does not generate network traffic.

Custom weight profiles are session-only (not persisted to a project) — see
`docs/ROADMAP.md` → NEXT.

## Benchmark bands: where they come from

All bands are Vantrock's own analytical judgement for Grade-A industrial/logistics siting
in the Pune corridor — **CURATED**, documented in `lib/analysis/metrics/*.ts` next to each
metric, not a regulatory or market-derived standard. They are deliberately simple linear
ramps (`lib/analysis/benchmarks.ts` → `normalizeLinear`): below the "good" edge normalizes
to 1, beyond the "poor" edge normalizes to 0, clamped in between.

## Missing-data handling

A metric with `status !== "ok"` (missing, low_confidence, or conflicted) is:
1. Excluded from the weighted sum (its weight is redistributed, not zeroed).
2. Listed in `SiteScore.excluded_metrics` with its reason and the weight that was
   redistributed away from it.
3. Still shown in the Analysis tab's metric list, visibly marked (never silently dropped).

## Coverage and confidence

Both are always shown alongside the total score:
- **Coverage** answers "how much of the weighting is backed by real data?"
- **Confidence** answers "how much do I trust the data that IS there?"

A score of 62% built on 90% coverage is a materially different claim than the same 62%
built on 40% coverage — the UI never shows one without the other.

## Worked example

For a site where every metric is "ok" except the four always-missing ones (labour ×2,
climate ×2 — 8% of total weight):

```
available_weight = 1.00 − 0.08 = 0.92
redistribution_factor = 1.00 / 0.92 ≈ 1.087
```

Every included metric's effective weight is ~8.7% higher than its nominal weight, and the
total score is computed from those effective weights — see
`tests/scoring/engine.test.ts` → "redistributes weight away from a missing metric" for the
exact mechanics on a minimal fixture.
