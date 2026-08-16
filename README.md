# Vantrock Intelligence

Industrial / logistics / Grade-A warehouse **site intelligence** for the Pune → Chakan →
Talegaon corridor. Draw a candidate site on a map, get a deterministic multi-factor
analysis, compare it against alternatives, underwrite it financially, and generate an
investment summary — all local-first, with zero paid API dependency.

> **Not** a generic GIS tool, a chatbot-with-a-map, or an "AI score" generator. The map is
> the interface; the deterministic analysis/scoring/financial engines are the product.

## Current MVP status

| Slice | Status |
|---|---|
| Project creation, map workspace, draw (polygon/rectangle/point), save/reload | ✅ Complete, browser-verified |
| Deterministic geometry engine (area/perimeter/centroid/bbox, geodesic WGS84) | ✅ Complete, 179 unit tests |
| OpenStreetMap ingestion (real data: roads + industrial/logistics POIs, Pune corridor) | ✅ Complete — see `docs/DATA_SOURCES.md` |
| Site analysis engine (18 metrics across 6 categories, evidence-first) | ✅ Complete |
| Weighted suitability scoring (explainable, redistribution-aware) | ✅ Complete |
| Site comparison (up to 3 sites, deterministic ranking explanation) | ✅ Complete |
| Financial underwriting (NOI/GDV/TDC/YoC/RLV/IRR, 3 scenarios) | ✅ Complete |
| Evidence/provenance (every value traces to a source) | ✅ Complete |
| Analyst assistant (deterministic Q&A, no LLM required) | ✅ Complete |
| Investment summary / printable report | ✅ Complete |
| Routing (real route distance/time, truck routing) | ❌ Not implemented — reports as MISSING |
| Labour/population and climate/hazard data | ❌ Not implemented — reports as MISSING |
| Supabase / Postgres / PostGIS backend | ❌ Not connected — architecture is ready, see below |

See `docs/ROADMAP.md` for the full picture and `docs/ENGINEERING_LOG.md` for session history.

## Architecture

```
UI (React/Next.js)
  → ApiClient (lib/client)               — the only surface UI may call
    → Application services (lib/app)     — validation, business rules
      → Repository interface (lib/repositories/types.ts)
        → IndexedDB (today)  |  Supabase/Postgres/PostGIS (future, not connected)

Analysis stack (independent of the above, called by AnalysisTools):
  lib/geo        — pure geometry (area/perimeter/centroid/nearest-feature), no framework
  lib/data/osm   — preloaded OSM dataset loader (static JSON, no live network calls)
  lib/analysis   — deterministic SiteAnalysis engine (metrics + provenance)
  lib/scoring    — deterministic weighted scoring engine
  lib/financial  — deterministic underwriting engine (NOI/GDV/TDC/IRR/...)
  lib/evidence   — evidence aggregation from metric sources
  lib/ai         — deterministic "tool" layer + template-based analyst answers (no LLM)
```

Boundaries enforced throughout: geometry code has zero React/framework dependency;
financial calculations are independent of AI; the AI layer only *reads* deterministic
tool outputs and can never mutate analytical data or invent a number. See
`docs/DECISIONS.md` for why.

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000, zero configuration required
```

No `.env.local` is required — see `.env.example` for the (all-optional) overrides.

### Refreshing the OpenStreetMap reference data

`public/data/osm/{roads,pois,manifest}.json` is a preloaded snapshot, not a live feed.
To refresh it (occasionally, not part of `npm run dev`/`build`):

```bash
npm run ingest:osm
```

This hits the free, keyless Overpass API once and rewrites the three JSON files. It is a
manual, deliberate step — the running app never calls Overpass itself.

## Commands

```bash
npm run dev         # dev server
npm run build        # production build
npm run start         # run the production build
npm run typecheck     # tsc --noEmit
npm run lint          # eslint .
npm run test           # vitest run (179 tests)
npm run test:watch     # vitest watch mode
npm run check          # typecheck + lint + test
npm run ingest:osm     # refresh public/data/osm/*.json from Overpass
```

## Environment variables

All optional; the app runs with zero configuration. See `.env.example` for the full list
and `docs/MANUAL_ACTIONS.md` if you need to change the persistence driver or basemap.

| Variable | Values | Default | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_PERSISTENCE_DRIVER` | `indexeddb` \| `supabase` | `indexeddb` | `supabase` requires `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` and the migration in `supabase/migrations/` to have been run — see `docs/MANUAL_ACTIONS.md`. |
| `NEXT_PUBLIC_BASEMAP` | `osm-dev` \| `blank` | `osm-dev` | `osm-dev` uses OpenStreetMap raster tiles — development only, not licensed for production. |
| `DEMO_ACCESS_PASSWORD` | any string | unset | Server-side only. Unset = no login gate (local dev). Set in any deployed environment. |
| `AI_PROVIDER` | `demo` \| `openrouter` | `demo` | `openrouter` requires `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`; falls back to `demo` (no key required) if either is missing. |

No API keys are required to run this MVP locally. See `docs/SECURITY.md` for what's server-only and `docs/AI_ARCHITECTURE.md` for the AI provider contract.

## Current data sources

- **PRELOADED** — OpenStreetMap roads and industrial/logistics POIs for the Pune / Chakan
  / Talegaon corridor, fetched via the free Overpass API and cached as static JSON
  (`public/data/osm/`). See `docs/DATA_SOURCES.md`.
- **CURATED** — a handful of hand-entered orientation anchors (MIDC zones, airport, port)
  for map orientation only, never used in calculation; and the financial/scoring
  assumption defaults (rent, construction cost, cap rate, benchmark bands).
- **DERIVED** — every geometry measurement and every computed proxy (density, compactness,
  GFA adequacy).
- **MISSING (honestly)** — route distance/time (no routing provider), labour/population,
  and climate/hazard. These report as explicit "missing" rather than a fabricated number.

Every value in the UI is labeled with its classification — see `components/ui/Primitives.tsx`
(`ClassificationBadge`) and `docs/DATA_SOURCES.md`.

## Known limitations

- Straight-line distance only — no real routing engine, so "nearest road" is not a route
  distance and must never be read as one.
- No labour or climate/hazard data source is wired in.
- Financial assumptions (rent, cap rate, construction cost) are Vantrock's own curated
  judgement for the corridor, not verified market quotes.
- Local-first only: data lives in the browser's IndexedDB. No multi-device sync, no
  authentication, no backend persistence yet.
- Geometry, financial, and scoring math are unit-tested; the product's *investment
  decision* still requires human review (title, legal, survey, geotechnical, final zoning,
  and market assumptions) — see the Investment Summary's "Limitations" section, rendered
  in the app itself.

## Test commands

```bash
npm run test           # 179 tests: geometry, validation, analysis, scoring, financial, evidence, AI explain templates, app services
```

No test in this suite depends on a live network call or an LLM.

## Deployment notes

Not yet deployed. Two blockers before a production deploy:
1. Swap the `osm-dev` raster basemap for a self-hosted, licence-clean tile source
   (PMTiles is the planned answer — see `docs/ROADMAP.md`).
2. Decide on a persistence backend (continues local-first vs. connects Supabase — see
   `docs/MANUAL_ACTIONS.md` for the exact steps when that decision is made).

## Supabase connection procedure

**Not connected.** When you're ready, follow `docs/MANUAL_ACTIONS.md` → "Connect Supabase"
step by step. Nothing in this codebase will silently start writing to Supabase — the
repository factory (`lib/repositories/index.ts`) throws a clear error if
`NEXT_PUBLIC_PERSISTENCE_DRIVER=supabase` is set before the Supabase repository
implementation exists.

## Future provider setup

Routing, labour/population, and climate/hazard providers are not implemented. See
`docs/API_CATALOGUE.md` for the interfaces they'll need to satisfy and
`docs/MANUAL_ACTIONS.md` for what a future session will need from you (an account, an API
key, a dataset download) to wire one in.

## Documentation index

See `docs/README.md` for the full documentation map.
