# Manual Actions Required

This file lists everything that needs a human — an account, an API key, a manual
dashboard click, a command run by hand. **Nothing in this MVP is currently blocked** — the
app runs with zero configuration — but read Priority 1 before you assume a feature is
"missing" rather than "waiting on you."

Checkboxes track what's been done in *your* environment, not this session's. They start
unchecked regardless of what this session verified.

---

## PRIORITY 0 — MUST DO

None right now. `npm install && npm run dev` runs the full application with zero
configuration. Come back to this section if a future session adds something that blocks
the app from running.

---

## PRIORITY 1 — IMPORTANT

### Action: Refresh the OpenStreetMap reference data periodically

**Why:** `public/data/osm/{roads,pois,manifest}.json` is a snapshot from the time
`npm run ingest:osm` was last run (see `public/data/osm/manifest.json` →
`retrieved_at` for the exact timestamp). OpenStreetMap is community-edited and improves
over time in this corridor; a stale snapshot isn't wrong, just not maximally current.

**Exact steps:**
1. Open a terminal in the repository root.
2. Run: `npm run ingest:osm`
3. Wait for it to finish (typically under a minute; it retries automatically if the public
   Overpass API is briefly rate-limited).
4. Confirm the output ends with a line like `Wrote 5089 roads, 683 POIs to
   .../public/data/osm`.

**Where to click:** nowhere — this is a terminal command, not a UI action.

**What value to enter:** nothing — no parameters needed.

**What file to edit:** none, unless you want to change the geographic bounding box or the
road/POI tag filters, both defined near the top of `ingest/sources/osm/fetch.mjs`.

**How to verify:** open `public/data/osm/manifest.json` and check `retrieved_at` is recent,
then load the app and confirm the Analysis tab still shows accessibility/market/
infrastructure metrics for a site in the corridor.

**Done when:** the manifest's `retrieved_at` reflects today (or whenever you last ran it).

- [ ] Refreshed OSM data (optional — only needed if you want the latest OSM edits)

---

### Action: Connect Supabase (when you're ready to leave local-first mode)

**Why:** the repository architecture is built for this swap
(`lib/repositories/types.ts`), but it is **deliberately not connected** — the project brief
requires explicit manual authorization before any Supabase connection happens. Doing this
today would replace browser-local storage with a real hosted Postgres database — a
meaningful, semi-irreversible step, not something to do casually.

**Exact steps (when you decide to do this):**
1. Open the [Supabase Dashboard](https://supabase.com/dashboard) and either open your
   existing project or create a new one.
2. In the project, go to **Database → Extensions**, search for `postgis`, and enable it.
3. Go to **SQL Editor**, and run a migration that creates the schema described in
   `docs/DECISIONS.md` → "Local-first with IndexedDB, Supabase reserved but not connected"
   (tables: `projects`, `sites`, and eventually `roads`, `pois`, `infrastructure`,
   `hazards`, `metrics`, `analysis_runs`, `scores`, `scenarios`, `sources`, `evidence`,
   `reports` — use `geometry(MultiPolygon, 4326)` / PostGIS `geography` columns per the
   migration notes already written in `lib/geo/measure.ts`). **This migration does not
   exist yet in this repository — writing it is the first implementation step, not
   something to copy-paste from here.**
4. In **Project Settings → API**, copy the **Project URL** and the **anon/public key**.
5. Create `.env.local` in the repository root (copy from `.env.example`) and set:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<your Project URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
   NEXT_PUBLIC_PERSISTENCE_DRIVER=supabase
   ```
   Both `NEXT_PUBLIC_*` variables are safe for the browser (anon key is meant to be
   public, protected by Row Level Security — do not use the `service_role` key here or
   anywhere under `app/`).
6. **This will not work yet** — `lib/repositories/index.ts` and `lib/client/index.ts`
   currently throw a deliberate error for the `supabase` driver, because the Supabase
   repository implementation itself doesn't exist in this codebase yet. Implementing it
   (a `createSupabaseRepositories()` matching `RepositoryBundle`) is a follow-up
   engineering task, not a configuration step.

**Security warning:** never put a `service_role` key in any `NEXT_PUBLIC_*` variable or
anywhere under `app/` — it bypasses Row Level Security and must stay server-only.

**Test command:** once the repository implementation exists, `npm run dev` and check the
header's status line reads `local · supabase · N projects` instead of `local · indexeddb ·
N projects`.

**How to verify it worked:** create a project in the UI, then check the Supabase Dashboard
→ **Table Editor** → `projects` table shows the new row.

**Done when:** the header status line shows the `supabase` driver and data appears in the
Supabase Table Editor after creating a project in the app.

- [ ] Created/selected a Supabase project
- [ ] Enabled the PostGIS extension
- [ ] Wrote and ran the initial schema migration
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
- [ ] Set `NEXT_PUBLIC_PERSISTENCE_DRIVER=supabase`
- [ ] Implemented `createSupabaseRepositories()` (engineering task, not a config step)
- [ ] Verified: header shows `supabase` driver and rows appear in the Table Editor

---

## PRIORITY 2 — OPTIONAL

### Action: Configure a real LLM provider for the Analyst tab

**Why:** the Analyst tab is currently fully deterministic (template-based, `lib/ai/`) and
requires no API key at all — this is by design, not a placeholder waiting on a key (see
`docs/DECISIONS.md`). Only do this if you specifically want model-generated prose *in
addition to* the deterministic tool outputs.

**Where to get a key:** https://console.anthropic.com (Anthropic API keys — the "Claude
Pro" subscription does **not** include API credits; API usage is billed separately).

**Exact environment variable name:** not yet defined in this codebase — a future session
adding this integration should introduce `ANTHROPIC_API_KEY` (server-only — never
`NEXT_PUBLIC_ANTHROPIC_API_KEY`, since that would ship the key to every browser).

**What `.env.local` line to add:**
```
ANTHROPIC_API_KEY=sk-ant-...
```

**Whether it belongs in browser or server:** **server only.** It must never be prefixed
`NEXT_PUBLIC_` and must never be imported into any file under `app/` that runs in the
browser. It would need a Next.js Route Handler (server-side) to keep it off the client.

**Security warning:** never commit this key. `.env.local` is already gitignored — verify
with `git check-ignore .env.local` before committing anything.

**Test command:** none yet — this integration doesn't exist in the codebase. Implementing
it is an engineering task (see `docs/API_CATALOGUE.md` → "Anthropic / LLM API").

**Done when:** not applicable until the integration is built.

- [ ] Obtained an Anthropic API key
- [ ] (Engineering task, not yet done) Implemented a server-side route handler that uses it

---

## FUTURE / PRODUCTION

### Self-hosted PMTiles basemap (before any production deploy)

**Why:** `NEXT_PUBLIC_BASEMAP=osm-dev` (the current default) uses OpenStreetMap's free
raster tile servers, whose usage policy explicitly does not permit production
applications. The UI already shows a persistent "Development basemap" warning for exactly
this reason.

**What to do:** generate a PMTiles extract of the Pune corridor (via
[protomaps.com](https://protomaps.com) or the open-source `planetiler`/`pmtiles` tools),
upload it to Supabase Storage (once Supabase is connected) or any static host, and add a
third case to `lib/providers/basemap/index.ts` that points at it. This is an engineering
task with a clear target, not a configuration step — no action item to check off yet.

- [ ] Generated a PMTiles extract of the corridor
- [ ] Hosted it (Supabase Storage or equivalent)
- [ ] Added the basemap case in `lib/providers/basemap/index.ts`
- [ ] Set `NEXT_PUBLIC_BASEMAP` to the new option and removed the dev-only warning

### Self-host OSRM (upgrade from the free public demo server)

**Current state:** `access.route_distance` / `access.route_time` already work — Phase 1
(2026-08-16) wired in `lib/providers/routing/osrm.ts` against the free, keyless OSRM
*public demo server* (`router.project-osrm.org`). No action needed for continued local/dev
use. This entry is only for a production deployment, where the demo server's light-use
policy (no SLA, rate-limited, not for commercial volume) becomes a real constraint.

**Why:** the public demo server can rate-limit or block high-volume/production traffic
without notice — the same posture already documented for the OSMF dev tile servers.

**Exact steps:**
1. Provision a small server/container (the free tiers of Fly.io, Render, or a low-cost VPS
   are all sufficient — OSRM's memory footprint for the India extent is a few GB).
2. Download an India OSM extract (e.g. from Geofabrik: `download.geofabrik.de/asia/india.html`)
   and run OSRM's standard `extract` → `partition` → `customize` pipeline with the `car`
   profile (`osrm-extract`, `osrm-partition`, `osrm-customize` — see
   https://github.com/Project-OSRM/osrm-backend for the exact Docker commands).
3. Run `osrm-routed` against the processed extract, exposed on a stable URL.
4. In `lib/providers/routing/osrm.ts`, change `OSRM_BASE_URL` from
   `https://router.project-osrm.org` to your self-hosted instance's URL. Everything else —
   the `RoutingProvider` interface, `lib/ai/tools.ts`, the metric builders — is unchanged.
5. Update `usageWarning` in the same file (it can become `null` once self-hosted, since the
   light-use caveat no longer applies).

**How to verify:** `npm run dev`, draw a site in the Pune corridor, check the Analysis
tab's "Route distance to highway" metric shows your self-hosted provider's `id`/`label` in
its source (Evidence tab), not `osrm_demo_v1`.

**Done when:** production traffic no longer depends on `router.project-osrm.org`.

- [ ] Provisioned a server/container
- [ ] Built an OSRM India extract with the car profile
- [ ] Deployed `osrm-routed` behind a stable URL
- [ ] Updated `OSRM_BASE_URL` in `lib/providers/routing/osrm.ts`
- [ ] Verified: Evidence tab shows the new provider id, not `osrm_demo_v1`

### Truck-specific routing (Mappls enterprise, paid)

See `docs/API_CATALOGUE.md` → "RoutingProvider" for why ordinary-vehicle OSRM routing is
not a substitute for real truck routing (turn radii, axle load, height/weight
restrictions). Only pursue this with explicit authorization — it is a paid, commercial
integration, out of scope for the zero-paid-API constraint this MVP otherwise holds to.

- [ ] Authorized a paid truck-routing provider (e.g. Mappls enterprise)
- [ ] Implemented a second `RoutingProvider` alongside the OSRM one, `mode: "truck"`
- [ ] Confirmed the UI never conflates truck output with the existing ordinary-vehicle
      "ORDINARY ROAD ACCESS PROXY" metrics

### Climate/hazard data source

See `docs/API_CATALOGUE.md` → "HazardProvider / ClimateProvider" for candidate free
sources (India-WRIS, Bhuvan, IMD). Typically requires downloading a public dataset rather
than an API key — document the exact download URL, target file, and destination path here
once a session commits to one. Not yet started — see `docs/ROADMAP.md` → Phase 3.

- [ ] Chose and downloaded a climate/hazard data source
- [ ] Wired it into `lib/analysis/metrics/climate.ts`
- [ ] Updated `docs/DATA_SOURCES.md` with the new source's provenance

### Broader population coverage / sector-specific labour data source

**Current state:** `labour.population_proxy` already works — Phase 2 (2026-08-16) wired
it against OSM settlement `population` tags (`ingest/sources/osm/fetch.mjs` →
`public/data/osm/places.json`). No action needed for continued use; this entry is for
widening coverage beyond OSM's sparse tagging (5 settlements in the whole corridor today)
and for `labour.labour_proxy`, which still has no data source.

**Why:** OSM population tags are real but sparse and contributor-entered (no per-node
source citation, inconsistent recency). A Census of India town/village population table
would cover far more settlements with an authoritative source. `labour.labour_proxy`
(sector-specific logistics/warehouse labour availability) needs an actual labour-market
dataset — population alone cannot honestly stand in for it (see `docs/DECISIONS.md`).

**Exact steps (when a session commits to this):**
1. Download the Census of India 2011 (or later, if published) Primary Census Abstract for
   Pune district — available from https://censusindia.gov.in as CSV/XLS, no account or key
   required.
2. Add it as a new curated dataset under `data/reference/` (following the existing pattern
   in `data/reference/anchors.ts`) or extend the OSM ingest output with a merge step —
   whichever keeps `lib/analysis/metrics/labour.ts`'s consumption shape (`{lon, lat,
   population}[]`) unchanged.
3. For `labour.labour_proxy`: identify a real labour-market source (PLFS — Periodic Labour
   Force Survey — district-level participation/employment data is the leading free
   candidate: https://mospi.gov.in). Do not derive it from population alone.
4. Update `docs/DATA_SOURCES.md` with the new source's exact provenance before wiring it
   into the metric builder.

**How to verify:** `npm run dev`, check a site far from Pune/Chakan/Pimpri-Chinchwad (where
OSM population coverage is currently sparse) now shows `labour.population_proxy` as `ok`
instead of `missing`.

**Done when:** `labour.population_proxy` coverage no longer depends solely on OSM's 5
tagged settlements, and/or `labour.labour_proxy` has moved off the always-missing list.

- [ ] Downloaded a Census of India population dataset for the corridor
- [ ] Merged it into the `{lon, lat, population}` shape `labour.ts` already consumes
- [ ] Chose and downloaded a sector-specific labour-market data source for `labour_proxy`
- [ ] Updated `docs/DATA_SOURCES.md` with the new source's provenance

### Supabase Row Level Security / authentication

Once Supabase is connected (Priority 1 above) and the app has real users, enable RLS
policies anchored on `projects.owner_id` (already present in the schema design, currently
always `"local-analyst"`) and add real authentication. Not needed for the current
single-analyst local-first MVP.

- [ ] Added Supabase Auth
- [ ] Enabled RLS on `projects` and `sites`, policy: `owner_id = auth.uid()`
