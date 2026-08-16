/**
 * Vantrock Intelligence — shared domain types.
 *
 * These mirror the production schema in the engineering blueprint (section C)
 * so that connecting Supabase later is a repository swap, not a domain rewrite.
 * Field names are snake_case to match the eventual Postgres columns exactly.
 *
 * Types for ANALYSIS (Metric, SiteAnalysis, Score) are defined here even
 * though analysis is not implemented in this slice. Defining them now fixes
 * the contract that the scoring, financial, and evidence slices must satisfy.
 */

import type { PointGeometry, StoredGeometry } from "./geojson";

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * How much a value can be relied upon.
 *
 * This drives UI badging. A CURATED, DERIVED, or MOCK value is never rendered
 * as a plain number — it always carries a visible qualifier.
 */
export type SourceClassification =
  /** Fetched from an authoritative API at analysis time. */
  | "LIVE"
  /** Ingested open data, timestamped at ingestion. */
  | "PRELOADED"
  /** Hand-assembled by Vantrock from research. Not authoritative. */
  | "CURATED"
  /** A computed proxy, not a measurement. Not authoritative. */
  | "DERIVED"
  /** Placeholder for demonstration. Never authoritative. */
  | "MOCK";

/**
 * Attached to every value that enters the system from outside a pure
 * calculation. Provenance lives in the return type so it cannot be forgotten.
 */
export interface SourceMetadata {
  source_id: string;
  name: string;
  provider: string;
  source_url: string;
  license: string;
  attribution: string;
  classification: SourceClassification;
  /** When the underlying data was current. Null when genuinely unknown. */
  data_timestamp: string | null;
  /** When Vantrock retrieved it. ISO 8601. */
  retrieved_at: string;
  /** 0..1 */
  confidence: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export type AssetClass = "grade_a_logistics" | "warehouse" | "industrial_land";

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  grade_a_logistics: "Grade-A Logistics",
  warehouse: "Warehouse",
  industrial_land: "Industrial Land",
};

export interface Project {
  id: string;
  /** Reserved for Supabase auth.uid(). Local mode uses a fixed local owner. */
  owner_id: string;
  name: string;
  asset_class: AssetClass;
  /** Target gross floor area for the development programme, in square feet. */
  target_gfa_sqft: number;
  /** Display label only. Never used in calculation logic. */
  region_label: string | null;
  /**
   * Projected working SRID, derived from the project's geographic centre.
   * Used only for buffer and simplify operations; all measurement is geodesic.
   */
  working_srid: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  asset_class: AssetClass;
  target_gfa_sqft: number;
  region_label?: string | null;
}

// ---------------------------------------------------------------------------
// Site
// ---------------------------------------------------------------------------

/** How the analyst produced the site boundary. */
export type SiteSourceType = "drawn_polygon" | "drawn_rectangle" | "point_buffer";

export const SITE_SOURCE_TYPE_LABELS: Record<SiteSourceType, string> = {
  drawn_polygon: "Drawn polygon",
  drawn_rectangle: "Drawn rectangle",
  point_buffer: "Point with radius",
};

/**
 * Deterministic measurements of a site boundary.
 *
 * SINGLE SOURCE OF TRUTH. Computed exactly once, in lib/geo/measure.ts, at
 * write time — never recomputed in a component, a selector, or a render pass.
 *
 * MIGRATION NOTE: in production these become generated columns backed by
 * PostGIS (see lib/geo/measure.ts for the per-field mapping). The stored shape
 * does not change; only the engine that fills it does.
 */
export interface SiteMeasurements {
  /** Geodesic area on the WGS84 ellipsoid, square metres. */
  area_sqm: number;
  /** Geodesic length of all rings including holes, metres. */
  perimeter_m: number;
  /** Area-weighted centroid, EPSG:4326. */
  centroid: PointGeometry;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  /** Total position count across all rings. Used for complexity guards. */
  vertex_count: number;
  /** Number of interior rings (holes) preserved across all polygons. */
  hole_count: number;
}

export interface Site {
  id: string;
  project_id: string;
  name: string;
  source_type: SiteSourceType;
  /** Canonical geometry. Always MultiPolygon, always EPSG:4326. */
  geometry: StoredGeometry;
  /** Present only when source_type is "point_buffer". */
  point_origin: PointGeometry | null;
  /** Present only when source_type is "point_buffer". Metres. */
  buffer_radius_m: number | null;
  measurements: SiteMeasurements;
  /** Analyst-supplied. Null until entered — never defaulted to a number. */
  land_price_per_acre_inr: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSiteInput {
  project_id: string;
  name: string;
  source_type: SiteSourceType;
  /** Point, Polygon, or MultiPolygon. Normalized to MultiPolygon on save. */
  geometry: import("./geojson").InputGeometry;
  /** Required when geometry is a Point. Metres. */
  buffer_radius_m?: number;
  land_price_per_acre_inr?: number | null;
  notes?: string | null;
}

export interface UpdateSiteInput {
  name?: string;
  land_price_per_acre_inr?: number | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Analysis — NOT IMPLEMENTED IN THIS SLICE
//
// Defined now so the scoring, routing, financial, and evidence slices have a
// fixed target. Nothing in this phase produces these values.
// ---------------------------------------------------------------------------

export type MetricCategory =
  | "geography"
  | "accessibility"
  | "infrastructure"
  | "market"
  | "labour"
  | "climate"
  | "hazard";

export type MetricDirection = "benefit" | "cost" | "neutral";

export type MetricStatus = "ok" | "missing" | "low_confidence" | "conflicted";

export interface Metric {
  key: string;
  label: string;
  category: MetricCategory;
  /** null means genuinely missing. NEVER imputed to 0 or a midpoint. */
  raw_value: number | null;
  raw_text: string | null;
  unit: string;
  direction: MetricDirection;
  /** 0..1, normalized against an absolute benchmark band. */
  normalized_value: number | null;
  /** 0..1 */
  confidence: number;
  status: MetricStatus;
  /** Mandatory. Names the exact function, CRS, and feature involved. */
  calculation_note: string;
  /** Populated only when sources conflicted. */
  resolution_note: string | null;
  source: SourceMetadata;
  evidence_ids: string[];
}

export interface ScoreBreakdownEntry {
  metric_key: string;
  weight: number;
  normalized_value: number | null;
  contribution: number;
  status: MetricStatus;
}

export interface SiteScore {
  total: number;
  score_config_id: string;
  config_name: string;
  /** Fraction of total weight backed by real data. */
  coverage: number;
  confidence: number;
  breakdown: ScoreBreakdownEntry[];
  excluded_metrics: Array<{
    metric_key: string;
    reason: MetricStatus;
    weight_redistributed: number;
  }>;
}

export type WarningSeverity = "low" | "medium" | "high";

export interface AnalysisWarning {
  code: string;
  severity: WarningSeverity;
  metric_key?: string;
  message: string;
}

export interface SiteAnalysis {
  run: {
    id: string;
    site_id: string;
    status: "pending" | "complete" | "failed";
    engine_version: string;
    started_at: string;
    completed_at: string | null;
    coverage: number;
  };
  site: Site;
  metrics: Metric[];
  score: SiteScore | null;
  warnings: AnalysisWarning[];
}

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "GEOMETRY_INVALID"
  | "AREA_OUT_OF_BOUNDS"
  | "VERTEX_COUNT_OUT_OF_BOUNDS"
  | "NOT_FOUND"
  | "STORAGE_UNAVAILABLE"
  | "NOT_IMPLEMENTED"
  | "AI_PROVIDER_ERROR";

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Every application-layer call returns this envelope instead of throwing.
 *
 * Errors are values, so a failure has to be handled explicitly at the call
 * site rather than escaping into a React error boundary. This is the same
 * shape the HTTP layer will serialize once Supabase lands.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export const ok = <T,>(value: T): Result<T> => ({ ok: true, value });

export const err = <T = never,>(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Result<T> => ({ ok: false, error: { code, message, details } });
