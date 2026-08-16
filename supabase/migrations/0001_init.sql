-- Vantrock Intelligence — initial schema
--
-- Mirrors the domain types in types/domain.ts exactly (see lib/repositories/types.ts
-- for the interface this schema backs, and lib/repositories/indexeddb/db.ts for the
-- IndexedDB shape this replaces field-for-field).
--
-- Scope: only what the current repository interfaces need (projects, sites).
-- Analysis runs / metrics / scores / financial scenarios / evidence / reports are
-- NOT created here — they are computed deterministically on read today (see
-- lib/analysis, lib/scoring, lib/financial, lib/evidence) and have no repository
-- interface yet. Adding tables for them now would be schema speculation ahead of
-- an actual persistence need. Extend this file (or add 0002_*.sql) when a future
-- phase gives analysis runs a repository contract.

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id text primary key,
  owner_id text not null,
  name text not null,
  asset_class text not null check (asset_class in ('grade_a_logistics', 'warehouse', 'industrial_land')),
  target_gfa_sqft numeric not null,
  region_label text,
  working_srid integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists projects_created_at_idx on public.projects (created_at desc);

-- ---------------------------------------------------------------------------
-- sites
-- ---------------------------------------------------------------------------

create table if not exists public.sites (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('drawn_polygon', 'drawn_rectangle', 'point_buffer')),
  -- Canonical geometry. Always MultiPolygon, always EPSG:4326 — matches
  -- types/domain.ts StoredGeometry exactly. use_srid 4326 lon/lat, matching
  -- every other coordinate in this codebase (never web-mercator).
  geom geometry(MultiPolygon, 4326) not null,
  -- Generated GeoJSON mirror of `geom`, so PostgREST can select it directly
  -- (`geom_geojson`) without a server-side RPC round trip. `geom` remains the
  -- single source of truth; this column can never drift from it.
  geom_geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  -- point_origin / buffer_radius_m only populated when source_type = 'point_buffer'.
  point_origin geometry(Point, 4326),
  point_origin_geojson jsonb generated always as (
    case when point_origin is null then null else st_asgeojson(point_origin)::jsonb end
  ) stored,
  buffer_radius_m numeric,
  -- SiteMeasurements — computed once in lib/geo/measure.ts at write time, never
  -- recomputed in SQL. Stored verbatim as jsonb rather than generated columns so
  -- the repository never has to reconcile two independent area/perimeter engines.
  measurements jsonb not null,
  land_price_per_acre_inr numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sites_project_id_idx on public.sites (project_id);
create index if not exists sites_created_at_idx on public.sites (created_at desc);
create index if not exists sites_geom_idx on public.sites using gist (geom);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- This MVP has no per-user auth yet (see docs/DECISIONS.md — the demo access
-- gate is a shared server-side password, not Supabase Auth). RLS is enabled
-- with a single permissive policy scoped to the anon role, matching the
-- "single-tenant demo behind a server-side gate" posture documented in
-- docs/MANUAL_ACTIONS.md. Tighten to `owner_id = auth.uid()` once real
-- per-analyst Supabase Auth is added (see docs/ROADMAP.md → LATER).

alter table public.projects enable row level security;
alter table public.sites enable row level security;

drop policy if exists "projects_demo_access" on public.projects;
create policy "projects_demo_access" on public.projects
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "sites_demo_access" on public.sites;
create policy "sites_demo_access" on public.sites
  for all
  to anon, authenticated
  using (true)
  with check (true);
