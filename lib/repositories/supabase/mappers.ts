/**
 * Row <-> domain conversion for the Supabase backend.
 *
 * Pure and network-free by design, so the row-shape/domain-shape mapping can
 * be unit tested without a live Supabase project (see
 * tests/repositories/supabase/mappers.test.ts). The repository classes in
 * ./index.ts are the only callers.
 */

import type {
  AssetClass,
  Project,
  Site,
  SiteMeasurements,
  SiteSourceType,
} from "@/types/domain";
import type { MultiPolygonGeometry, PointGeometry } from "@/types/geojson";

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  asset_class: string;
  target_gfa_sqft: number;
  region_label: string | null;
  working_srid: number;
  created_at: string;
  updated_at: string;
}

export function projectToRow(project: Project): ProjectRow {
  return {
    id: project.id,
    owner_id: project.owner_id,
    name: project.name,
    asset_class: project.asset_class,
    target_gfa_sqft: project.target_gfa_sqft,
    region_label: project.region_label,
    working_srid: project.working_srid,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}

export function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    asset_class: row.asset_class as AssetClass,
    target_gfa_sqft: Number(row.target_gfa_sqft),
    region_label: row.region_label,
    working_srid: row.working_srid,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Row shape as selected via `select("*, geom_geojson:geom::json, point_origin_geojson:point_origin::json")`
 * — PostgREST/PostGIS returns geometry columns as GeoJSON text when cast this
 * way, avoiding a second round trip through ST_AsGeoJSON in application code.
 */
export interface SiteRow {
  id: string;
  project_id: string;
  name: string;
  source_type: string;
  geom_geojson: MultiPolygonGeometry;
  point_origin_geojson: PointGeometry | null;
  buffer_radius_m: number | null;
  measurements: SiteMeasurements;
  land_price_per_acre_inr: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Insert/update payload shape — geometry goes in as GeoJSON text, cast server-side. */
export interface SiteWriteRow {
  id: string;
  project_id: string;
  name: string;
  source_type: string;
  geom: string;
  point_origin: string | null;
  buffer_radius_m: number | null;
  measurements: SiteMeasurements;
  land_price_per_acre_inr: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function siteToWriteRow(site: Site): SiteWriteRow {
  return {
    id: site.id,
    project_id: site.project_id,
    name: site.name,
    source_type: site.source_type,
    geom: JSON.stringify(site.geometry),
    point_origin: site.point_origin ? JSON.stringify(site.point_origin) : null,
    buffer_radius_m: site.buffer_radius_m,
    measurements: site.measurements,
    land_price_per_acre_inr: site.land_price_per_acre_inr,
    notes: site.notes,
    created_at: site.created_at,
    updated_at: site.updated_at,
  };
}

export function rowToSite(row: SiteRow): Site {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    source_type: row.source_type as SiteSourceType,
    geometry: row.geom_geojson,
    point_origin: row.point_origin_geojson,
    buffer_radius_m: row.buffer_radius_m,
    measurements: row.measurements,
    land_price_per_acre_inr: row.land_price_per_acre_inr,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
