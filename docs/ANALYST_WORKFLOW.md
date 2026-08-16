# Analyst Workflow

The end-to-end journey this MVP supports, and the realistic questions an analyst can ask
at each step.

## 1. Project setup

Open `/`, fill in project name, asset class (Grade-A Logistics / Warehouse / Industrial
Land), target GFA (sq ft), and an optional submarket label. Target GFA drives the
`geo.gfa_adequacy` metric later — it's not decorative.

*"How big does this site need to be for a 500,000 sq ft build-to-suit?"* — answered
implicitly: the target GFA you enter here is what every candidate site's adequacy is
measured against.

## 2. Site selection (Map & Sites tab)

Draw up to as many candidate sites as needed (3 is the benchmark scenario) using Polygon,
Rectangle, or Point (buffered to a circle). Each draft shows a live area/perimeter preview
— the same numbers, computed the same way, that get stored on save. Set a land price
(₹/acre) on each site once you have one; it's optional but unlocks the financial engine.

*"Is this boundary even close to legal minimum/maximum for a candidate site?"* — the
validator rejects (with a specific reason) anything under 1,000 m² or over 50 km², or with
self-intersecting geometry, before it can be saved.

## 3. Analysis (Analysis tab)

Select a site, pick a weight profile preset (Default or Accessibility-Focused) or drag any
of the six category sliders (Site Quality, Accessibility, Infrastructure, Market, Labour,
Climate/Risk) directly — every other category rescales proportionally and the score
recalculates immediately, with no network cost (see step 3a). Read the full metric
breakdown: 18 metrics across geography, accessibility, infrastructure, market, labour, and
climate/hazard, each with its value, classification badge (LIVE / PRELOADED / CURATED /
DERIVED), confidence, and calculation note. Route distance/time (live, from OSRM) and
population-within-catchment (from OSM settlement tags) are both real data as of this
session, not permanently missing.

*"What is this site's suitability score, and why?"* — the score, coverage, and confidence
are shown at the top; every metric contributing to it is listed below with its exact
weight and normalized value.

*"Is this number real or an estimate?"* — every value's classification badge answers that
directly; CURATED and DERIVED values additionally carry an explanatory note.

*"What if accessibility mattered more to this mandate?"* — drag the Accessibility slider;
the score updates instantly, and a "Reset to preset" button is always one click away.

## 3a. A note on route distance and population data

Two metrics call outside this MVP's otherwise fully-preloaded architecture:
`access.route_distance`/`access.route_time` fetch a real route live from the free OSRM
public demo server, and `labour.population_proxy` reads OSM settlement `population` tags
ingested alongside roads/POIs. Both degrade to "missing" (never a fabricated number) when
unavailable — outside the corridor, no nearby OSM road, or the OSRM request fails. See
`docs/DATA_SOURCES.md` for the full provenance of each.

## 4. Comparison (Compare tab)

All saved sites side by side: total score (with a visual bar), coverage, confidence,
category-level rollups, area, land price, base-case IRR/equity multiple, and a
metric-by-metric detail table. A deterministic one-paragraph ranking explanation sits above
the table ("why does the leader rank first"), generated from the same score breakdown shown
below it — never a separate, potentially-inconsistent narrative. Below that, a "Why not
this site?" card for every non-leading site lists the specific categories, risk factors,
and financial outcome where it trails (or leads) the current leader.

*"Which site should we pursue?"* — the top row of the summary table, with the paragraph
above it explaining why in terms of specific metric contributions.

*"Why not Site B?"* — its own card: category-by-category deltas against the leader (e.g.
"Weaker site quality (88.8% vs 100.0%)"), a risk-warning-count comparison, and a financial-
outcome comparison, each traceable to a real number shown elsewhere in the app.

## 5. Underwriting (Financials tab)

Select a site (needs a land price entered in step 2 for the land-cost-dependent rows to
compute). Six assumptions — Rent, Occupancy, Construction Cost, Soft Cost, Exit Cap Rate,
Development Period — are directly editable above the scenario table; an overridden
assumption relabels itself `USER_INPUT` everywhere it's shown, and "Reset to defaults"
clears back to the CURATED base case. Read downside/base/upside scenarios: achievable GFA,
NOI, construction cost, TDC, GDV, yield-on-cost, residual land value, equity, IRR, equity
multiple — plus the full assumption list with classifications below.

*"What does this site pencil at, and how sensitive is that to the downside case?"* —
side-by-side scenario columns answer both halves of that question in one table.

*"What if rent came in 20% lower than our curated assumption?"* — type it into the Rent
override field; all three scenario columns recompute immediately around the new figure.

*"What if I haven't entered a land price yet?"* — a visible warning explains exactly which
outputs are unavailable and why, rather than showing a wrong number.

## 6. Evidence (Evidence tab)

Every source cited anywhere in the selected site's analysis, deduplicated, with provider,
license, attribution, retrieval timestamp, confidence, and which metrics cite it.

*"Where did this number come from?"* — literally the point of this tab.

## 7. Decision support (Analyst tab)

Five deterministic questions, answered from the same tool outputs shown elsewhere:
- Why does the leading site currently rank first?
- What is the biggest risk for the selected site?
- What assumptions drive the selected site's ranking?
- What would make the selected site win?
- What if Accessibility were weighted 35%?

No LLM is called; every answer is a template over already-computed numbers, so it can never
contain a value that isn't traceable back to the Analysis/Compare/Financials tabs.

## 8. Report (Report tab)

The Investment Summary ties every prior step together: recommendation, top strengths, top
risks, financial snapshot, comparison table, data coverage/confidence, sources, and an
explicit limitations section (routing, labour, climate gaps; human-review requirements).
Printable via the browser's native print dialog.

*"I need to hand this to my investment committee."* — this is that document.

## What still requires human judgement

Per the product's own design (not a gap to be closed by more automation): title, legal
status, survey, geotechnical conditions, final zoning interpretation, final market
assumptions, and the investment decision itself. The Investment Summary's Limitations
section states this explicitly on every report generated.
