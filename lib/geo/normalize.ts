/**
 * Geometry normalization — everything becomes a MultiPolygon.
 *
 * The production column is `geometry(MultiPolygon, 4326)`, so exactly one
 * geometry type ever reaches storage. A rectangle is a polygon; a dropped
 * point becomes a geodesic circle. Downstream code never branches on shape.
 *
 * PURE MODULE: no I/O, no framework, no storage.
 */

import type {
  InputGeometry,
  LinearRing,
  MultiPolygonGeometry,
  PolygonRings,
  Position,
} from "@/types/geojson";
import { destinationPoint } from "./ellipsoid";

/** Default radius applied when an analyst drops a point instead of drawing. */
export const DEFAULT_POINT_BUFFER_RADIUS_M = 250;

/** Segments used to approximate a circle. 72 keeps the area error under 0.13%. */
const CIRCLE_SEGMENTS = 72;

/** Round to ~1 cm at the equator. Removes float noise from map interactions. */
const COORDINATE_PRECISION = 7;

function roundCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_PRECISION;
  return Math.round(value * factor) / factor;
}

function roundPosition(position: Position): Position {
  return [roundCoordinate(position[0]), roundCoordinate(position[1])];
}

/**
 * Close a ring if the drawing library left it open.
 *
 * Terra Draw closes its rings, but geometry also arrives from tests, fixtures,
 * and eventually imports, so we do not assume it.
 */
export function closeRing(ring: readonly Position[]): LinearRing {
  if (ring.length === 0) return [];
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  const closed = first[0] === last[0] && first[1] === last[1];
  const result = ring.map(roundPosition);
  if (!closed) result.push(roundPosition(first));
  return result;
}

/**
 * Remove consecutive duplicate positions, which the shoelace and geodesic
 * routines treat as zero-length edges.
 */
function dedupeConsecutive(ring: LinearRing): LinearRing {
  if (ring.length < 2) return ring;
  const out: Position[] = [ring[0]!];
  for (let i = 1; i < ring.length; i += 1) {
    const previous = out[out.length - 1]!;
    const current = ring[i]!;
    if (previous[0] !== current[0] || previous[1] !== current[1]) out.push(current);
  }
  return out;
}

function normalizeRing(ring: readonly Position[]): LinearRing {
  return closeRing(dedupeConsecutive(closeRing(ring)));
}

/**
 * Enforce RFC 7946 winding: exterior rings counter-clockwise, holes clockwise.
 *
 * Measurement is winding-independent by design, but MapLibre and PostGIS both
 * behave better with canonical orientation, and it makes stored geometry
 * comparable byte-for-byte across sessions.
 */
function enforceWinding(rings: PolygonRings): PolygonRings {
  return rings.map((ring, index) => {
    const shouldBeCounterClockwise = index === 0;
    const isCounterClockwise = signedArea(ring) > 0;
    return isCounterClockwise === shouldBeCounterClockwise ? ring : [...ring].reverse();
  });
}

function signedArea(ring: readonly Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/**
 * Build a geodesic circle around a point.
 *
 * MIGRATION: ST_Buffer(pt::geography, radius_m) — or project to the working
 * UTM SRID, buffer, project back. Both produce a polygon approximation; the
 * segment count is the only thing that differs.
 */
export function bufferPointToPolygon(
  centre: Position,
  radiusMetres: number,
  segments: number = CIRCLE_SEGMENTS,
): MultiPolygonGeometry {
  const ring: Position[] = [];
  for (let i = 0; i < segments; i += 1) {
    const bearing = (360 * i) / segments;
    ring.push(roundPosition(destinationPoint(centre, bearing, radiusMetres)));
  }
  ring.push(ring[0]!);
  return {
    type: "MultiPolygon",
    coordinates: [enforceWinding([ring])],
  };
}

export interface NormalizeOptions {
  /** Radius applied when the input is a Point. */
  bufferRadiusMetres?: number;
}

export interface NormalizeResult {
  geometry: MultiPolygonGeometry;
  /** Set when a Point was buffered, so the origin can be preserved on the Site. */
  pointOrigin: Position | null;
  bufferRadiusMetres: number | null;
}

/**
 * Convert any accepted drawing output into canonical stored geometry.
 *
 * Holes are preserved throughout — a polygon drawn with an interior ring keeps
 * that ring, and the area calculation subtracts it.
 */
export function normalizeToMultiPolygon(
  input: InputGeometry,
  options: NormalizeOptions = {},
): NormalizeResult {
  if (input.type === "Point") {
    const radius = options.bufferRadiusMetres ?? DEFAULT_POINT_BUFFER_RADIUS_M;
    const centre = roundPosition(input.coordinates);
    return {
      geometry: bufferPointToPolygon(centre, radius),
      pointOrigin: centre,
      bufferRadiusMetres: radius,
    };
  }

  const polygons: PolygonRings[] =
    input.type === "Polygon" ? [input.coordinates] : input.coordinates;

  const normalized = polygons
    .map((rings) => enforceWinding(rings.map(normalizeRing).filter((ring) => ring.length >= 4)))
    .filter((rings) => rings.length > 0);

  return {
    geometry: { type: "MultiPolygon", coordinates: normalized },
    pointOrigin: null,
    bufferRadiusMetres: null,
  };
}
