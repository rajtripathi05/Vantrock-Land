/**
 * Geometry validation.
 *
 * Rejects obviously invalid geometry with a SPECIFIC reason. "Invalid
 * geometry" as an error message is useless to an analyst who has just spent a
 * minute tracing a boundary; every failure here says what is wrong.
 *
 * MIGRATION: these checks become a mix of PostGIS ST_IsValid / ST_MakeValid
 * and CHECK constraints (blueprint C2). Both layers keep running — the
 * client-side check gives immediate feedback, the database check is the
 * guarantee.
 *
 * PURE MODULE: no I/O, no framework, no storage.
 */

import type { InputGeometry, MultiPolygonGeometry, Position } from "@/types/geojson";
import { measureArea, countVertices, ringSelfIntersects } from "./measure";

/** Blueprint C2 bounds. A site outside these is a drawing error, not a site. */
export const MIN_SITE_AREA_SQM = 1_000;
export const MAX_SITE_AREA_SQM = 50_000_000;
export const MIN_VERTEX_COUNT = 4;
export const MAX_VERTEX_COUNT = 2_000;

/** Pune / Chakan / Talegaon working area. Advisory only — never a hard reject. */
export const INDIA_BBOX: [number, number, number, number] = [68.0, 6.0, 97.5, 37.5];

export type GeometryIssueCode =
  | "NOT_A_GEOMETRY"
  | "UNSUPPORTED_TYPE"
  | "EMPTY_GEOMETRY"
  | "COORDINATE_OUT_OF_RANGE"
  | "COORDINATE_NOT_FINITE"
  | "RING_TOO_FEW_POINTS"
  | "RING_NOT_CLOSED"
  | "SELF_INTERSECTING"
  | "AREA_TOO_SMALL"
  | "AREA_TOO_LARGE"
  | "TOO_MANY_VERTICES"
  | "OUTSIDE_COVERAGE_AREA"
  | "MULTIPART_GEOMETRY"
  | "HAS_HOLES";

export interface GeometryIssue {
  code: GeometryIssueCode;
  /** "error" blocks the save. "warning" is surfaced but does not block. */
  severity: "error" | "warning";
  message: string;
  details?: Record<string, unknown>;
}

export interface GeometryValidation {
  valid: boolean;
  errors: GeometryIssue[];
  warnings: GeometryIssue[];
}

const error = (
  code: GeometryIssueCode,
  message: string,
  details?: Record<string, unknown>,
): GeometryIssue => ({ code, severity: "error", message, details });

const warning = (
  code: GeometryIssueCode,
  message: string,
  details?: Record<string, unknown>,
): GeometryIssue => ({ code, severity: "warning", message, details });

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validatePosition(position: unknown, issues: GeometryIssue[]): boolean {
  if (!Array.isArray(position) || position.length < 2) {
    issues.push(error("NOT_A_GEOMETRY", "A coordinate must be a [longitude, latitude] pair."));
    return false;
  }
  const [lon, lat] = position as [unknown, unknown];
  if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) {
    issues.push(
      error("COORDINATE_NOT_FINITE", "Coordinates must be finite numbers.", { position }),
    );
    return false;
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    issues.push(
      error(
        "COORDINATE_OUT_OF_RANGE",
        `Coordinate ${lon}, ${lat} is outside the valid EPSG:4326 range.`,
        { position },
      ),
    );
    return false;
  }
  return true;
}

/**
 * Validate raw drawing input, before normalization.
 *
 * Structural checks only — the shape must be well-formed enough to normalize.
 * Area and vertex bounds are checked afterwards, in validateStoredGeometry,
 * because a Point has no area until it has been buffered.
 */
export function validateInputGeometry(input: unknown): GeometryValidation {
  const errors: GeometryIssue[] = [];
  const warnings: GeometryIssue[] = [];

  if (typeof input !== "object" || input === null || !("type" in input)) {
    errors.push(error("NOT_A_GEOMETRY", "Expected a GeoJSON geometry object."));
    return { valid: false, errors, warnings };
  }

  const geometry = input as InputGeometry;

  if (geometry.type === "Point") {
    validatePosition(geometry.coordinates, errors);
    return { valid: errors.length === 0, errors, warnings };
  }

  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    errors.push(
      error(
        "UNSUPPORTED_TYPE",
        `Vantrock stores Point, Polygon, and MultiPolygon geometry. Received "${
          (geometry as { type: string }).type
        }".`,
      ),
    );
    return { valid: false, errors, warnings };
  }

  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  if (!Array.isArray(polygons) || polygons.length === 0) {
    errors.push(error("EMPTY_GEOMETRY", "The geometry contains no rings."));
    return { valid: false, errors, warnings };
  }

  for (const rings of polygons) {
    if (!Array.isArray(rings) || rings.length === 0) {
      errors.push(error("EMPTY_GEOMETRY", "A polygon contains no rings."));
      continue;
    }
    for (const ring of rings) {
      if (!Array.isArray(ring)) {
        errors.push(error("NOT_A_GEOMETRY", "A ring must be an array of coordinates."));
        continue;
      }
      if (ring.length < MIN_VERTEX_COUNT) {
        errors.push(
          error(
            "RING_TOO_FEW_POINTS",
            `A boundary needs at least ${MIN_VERTEX_COUNT} points (three corners plus a closing point). This one has ${ring.length}.`,
            { pointCount: ring.length },
          ),
        );
        continue;
      }
      let positionsOk = true;
      for (const position of ring) {
        if (!validatePosition(position, errors)) {
          positionsOk = false;
          break;
        }
      }
      if (!positionsOk) continue;

      const typedRing = ring as Position[];
      if (ringSelfIntersects(typedRing)) {
        errors.push(
          error(
            "SELF_INTERSECTING",
            "The boundary crosses itself. Site boundaries must be simple polygons.",
          ),
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate canonical geometry after normalization.
 *
 * This is where the measurement-dependent bounds live, because they can only
 * be evaluated once a Point has become a polygon.
 */
export function validateStoredGeometry(geometry: MultiPolygonGeometry): GeometryValidation {
  const errors: GeometryIssue[] = [];
  const warnings: GeometryIssue[] = [];

  if (geometry.coordinates.length === 0) {
    errors.push(error("EMPTY_GEOMETRY", "The geometry contains no polygons."));
    return { valid: false, errors, warnings };
  }

  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
        errors.push(error("RING_NOT_CLOSED", "A ring is not closed."));
      }
      if (ringSelfIntersects(ring)) {
        errors.push(
          error("SELF_INTERSECTING", "The boundary crosses itself after normalization."),
        );
      }
    }
  }

  const vertexCount = countVertices(geometry);
  if (vertexCount > MAX_VERTEX_COUNT) {
    errors.push(
      error(
        "TOO_MANY_VERTICES",
        `The boundary has ${vertexCount} points, above the ${MAX_VERTEX_COUNT} limit. Simplify it before saving.`,
        { vertexCount },
      ),
    );
  }

  const area = measureArea(geometry);
  if (area < MIN_SITE_AREA_SQM) {
    errors.push(
      error(
        "AREA_TOO_SMALL",
        `The site measures ${area.toFixed(0)} m², below the ${MIN_SITE_AREA_SQM.toLocaleString()} m² minimum. This is usually an accidental click rather than a boundary.`,
        { area_sqm: area },
      ),
    );
  }
  if (area > MAX_SITE_AREA_SQM) {
    errors.push(
      error(
        "AREA_TOO_LARGE",
        `The site measures ${(area / 1_000_000).toFixed(1)} km², above the ${MAX_SITE_AREA_SQM / 1_000_000} km² maximum for a single candidate site.`,
        { area_sqm: area },
      ),
    );
  }

  if (geometry.coordinates.length > 1) {
    warnings.push(
      warning(
        "MULTIPART_GEOMETRY",
        `This site has ${geometry.coordinates.length} separate parts. Discontiguous sites are supported but are usually a drawing error.`,
        { partCount: geometry.coordinates.length },
      ),
    );
  }

  const holes = geometry.coordinates.reduce((sum, p) => sum + Math.max(0, p.length - 1), 0);
  if (holes > 0) {
    warnings.push(
      warning(
        "HAS_HOLES",
        `This boundary contains ${holes} interior ring${holes === 1 ? "" : "s"}. The excluded area has been subtracted from the site area.`,
        { holeCount: holes },
      ),
    );
  }

  const centre = geometryCentreForCoverage(geometry);
  if (
    centre[0] < INDIA_BBOX[0] ||
    centre[0] > INDIA_BBOX[2] ||
    centre[1] < INDIA_BBOX[1] ||
    centre[1] > INDIA_BBOX[3]
  ) {
    warnings.push(
      warning(
        "OUTSIDE_COVERAGE_AREA",
        "This site lies outside the Indian coverage area. Geometry will be stored, but reference data and analysis are unavailable here.",
      ),
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

function geometryCentreForCoverage(geometry: MultiPolygonGeometry): Position {
  const first = geometry.coordinates[0]?.[0]?.[0];
  return first ?? [0, 0];
}
