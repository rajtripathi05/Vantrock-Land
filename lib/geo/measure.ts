/**
 * THE SINGLE SOURCE OF TRUTH for area, perimeter, and centroid.
 *
 * No other module in this codebase may compute these values. There is exactly
 * one implementation so that there is exactly one number, and so that when the
 * PostGIS implementation arrives there is exactly one place where the two
 * engines have to be reconciled.
 *
 * ===========================================================================
 * MIGRATION MAP — what moves to PostGIS
 * ===========================================================================
 *
 *   measureArea()      -> ST_Area(geom::geography)
 *                         Expected agreement: < 0.02% for sites under ~5 km
 *                         across. Both are ellipsoidal WGS84 measures. This
 *                         implementation uses an ellipsoidal sinusoidal
 *                         (equal-area) projection about the geometry's own
 *                         centre; PostGIS integrates on the spheroid directly.
 *
 *   measurePerimeter() -> ST_Perimeter(geom::geography)
 *                         Expected agreement: < 0.001%. Both use Vincenty-class
 *                         geodesics on WGS84.
 *
 *   measureCentroid()  -> ST_Centroid(geom)
 *                         Expected agreement: EXACT (to floating point). This
 *                         is deliberately the planar area-weighted centroid on
 *                         raw lon/lat degrees, which is precisely what PostGIS
 *                         ST_Centroid does on a geometry (not geography)
 *                         column. Choosing the geodesic centroid here would
 *                         have looked more rigorous and disagreed with
 *                         production forever.
 *
 *   measureBbox()      -> ST_Envelope(geom) / Box2D
 *
 * When the PostGIS slice lands, the golden fixtures in tests/geo/ are run
 * against both engines and the deltas above become enforced assertions.
 *
 * PURE MODULE: no I/O, no framework, no storage.
 */

import type { MultiPolygonGeometry, PolygonRings, Position } from "@/types/geojson";
import type { SiteMeasurements } from "@/types/domain";
import { geodesicDistance, meridianArc, radiiOfCurvature, toRadians } from "./ellipsoid";

/**
 * Project a ring into local metres about an origin, using an ellipsoidal
 * sinusoidal projection.
 *
 * Sinusoidal is an EQUAL-AREA projection: the shoelace area of the projected
 * ring is the true surface area. Each vertex uses the normal radius of
 * curvature at its own latitude, and the north-south coordinate comes from a
 * true meridian arc, so the result is ellipsoidal rather than spherical.
 *
 * Coordinates are measured RELATIVE TO THE ORIGIN, not from the prime
 * meridian. A site 300 m across sitting 7,700 km from the meridian would
 * otherwise force the shoelace sum to difference two ~7.7e6 values to recover
 * a ~300 m edge, discarding roughly five significant digits to floating-point
 * cancellation. Subtracting the origin first keeps the full precision.
 */
function projectRingToLocalMetres(
  ring: readonly Position[],
  originLatRad: number,
  originLonRad: number,
): Position[] {
  const originArc = meridianArc(originLatRad);
  return ring.map(([lon, lat]) => {
    const latRad = toRadians(lat);
    const { normal } = radiiOfCurvature(latRad);
    const x = (toRadians(lon) - originLonRad) * normal * Math.cos(latRad);
    const y = meridianArc(latRad) - originArc;
    return [x, y] as Position;
  });
}

/**
 * Signed planar area of a ring via the shoelace formula.
 * Positive for counter-clockwise, negative for clockwise.
 */
function signedShoelaceArea(ring: readonly Position[]): number {
  const n = ring.length;
  if (n < 4) return 0;
  let sum = 0;
  // Ring is closed, so the last position duplicates the first; iterate over
  // the n-1 distinct edges.
  for (let i = 0; i < n - 1; i += 1) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/** Bounding-box centre of a geometry, in radians. Used as the local origin. */
function projectionOrigin(geometry: MultiPolygonGeometry): { latRad: number; lonRad: number } {
  const bbox = measureBbox(geometry);
  return {
    latRad: toRadians((bbox[1] + bbox[3]) / 2),
    lonRad: toRadians((bbox[0] + bbox[2]) / 2),
  };
}

/**
 * Geodesic area on the WGS84 ellipsoid, in square metres.
 *
 * Exterior rings add, interior rings (holes) subtract. Ring winding order is
 * ignored — we use absolute magnitudes and the ring's structural role — so a
 * polygon drawn clockwise measures the same as one drawn counter-clockwise.
 *
 * MIGRATION: ST_Area(geom::geography)
 */
export function measureArea(geometry: MultiPolygonGeometry): number {
  const origin = projectionOrigin(geometry);
  let total = 0;

  for (const polygon of geometry.coordinates) {
    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
      const ring = polygon[ringIndex]!;
      const projected = projectRingToLocalMetres(ring, origin.latRad, origin.lonRad);
      const ringArea = Math.abs(signedShoelaceArea(projected));
      // Index 0 is the exterior ring; everything after it is a hole.
      total += ringIndex === 0 ? ringArea : -ringArea;
    }
  }

  return Math.max(0, total);
}

/**
 * Geodesic perimeter in metres, summed over every ring including holes.
 *
 * Holes are part of the boundary an analyst would walk, and PostGIS
 * ST_Perimeter counts them, so we count them too.
 *
 * MIGRATION: ST_Perimeter(geom::geography)
 */
export function measurePerimeter(geometry: MultiPolygonGeometry): number {
  let total = 0;
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        total += geodesicDistance(ring[i]!, ring[i + 1]!);
      }
    }
  }
  return total;
}

/**
 * Area-weighted centroid in EPSG:4326.
 *
 * Planar shoelace centroid on lon/lat degrees, which matches PostGIS
 * ST_Centroid(geometry) exactly. Holes are subtracted with negative weight.
 *
 * Falls back to the mean of all vertices for degenerate (zero-area) input, so
 * this never returns NaN.
 *
 * MIGRATION: ST_Centroid(geom)
 */
export function measureCentroid(geometry: MultiPolygonGeometry): Position {
  // Work relative to the bounding-box centre. The shoelace cross product
  // differences two products of absolute lon/lat (~1,385 for Pune) to recover
  // a quantity of order 1e-5, which discards about eight significant digits.
  // Shifting the origin first keeps the result accurate to full precision.
  const bbox = measureBbox(geometry);
  const originLon = (bbox[0] + bbox[2]) / 2;
  const originLat = (bbox[1] + bbox[3]) / 2;
  const shift = (p: Position): Position => [p[0] - originLon, p[1] - originLat];

  let areaSum = 0;
  let cxSum = 0;
  let cySum = 0;

  for (const polygon of geometry.coordinates) {
    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
      const ring = polygon[ringIndex]!.map(shift);
      const signed = signedShoelaceArea(ring);
      if (signed === 0) continue;

      let cx = 0;
      let cy = 0;
      for (let i = 0; i < ring.length - 1; i += 1) {
        const a = ring[i]!;
        const b = ring[i + 1]!;
        const cross = a[0] * b[1] - b[0] * a[1];
        cx += (a[0] + b[0]) * cross;
        cy += (a[1] + b[1]) * cross;
      }
      cx /= 6 * signed;
      cy /= 6 * signed;

      // Use magnitude weighting and the ring's structural role, so winding
      // order cannot flip the result.
      const weight = ringIndex === 0 ? Math.abs(signed) : -Math.abs(signed);
      areaSum += weight;
      cxSum += cx * weight;
      cySum += cy * weight;
    }
  }

  if (areaSum === 0) {
    let count = 0;
    let lonSum = 0;
    let latSum = 0;
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          lonSum += lon;
          latSum += lat;
          count += 1;
        }
      }
    }
    return count === 0 ? [0, 0] : [lonSum / count, latSum / count];
  }

  // Shift back into absolute coordinates.
  return [cxSum / areaSum + originLon, cySum / areaSum + originLat];
}

/** Bounding box as [west, south, east, north]. MIGRATION: ST_Envelope(geom) */
export function measureBbox(geometry: MultiPolygonGeometry): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        if (lon < west) west = lon;
        if (lon > east) east = lon;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
    }
  }

  if (!Number.isFinite(west)) return [0, 0, 0, 0];
  return [west, south, east, north];
}

/** Total position count across all rings. MIGRATION: ST_NPoints(geom) */
export function countVertices(geometry: MultiPolygonGeometry): number {
  let total = 0;
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) total += ring.length;
  }
  return total;
}

/** Number of interior rings across all polygons. MIGRATION: ST_NumInteriorRings */
export function countHoles(geometry: MultiPolygonGeometry): number {
  let total = 0;
  for (const polygon of geometry.coordinates) {
    total += Math.max(0, polygon.length - 1);
  }
  return total;
}

/**
 * Compute the complete measurement set in one pass.
 *
 * This is the ONLY function the application layer calls. Sites are measured
 * once, at write time, and the stored values are what every downstream
 * consumer reads. Nothing recomputes geometry during a render.
 */
export function measureGeometry(geometry: MultiPolygonGeometry): SiteMeasurements {
  return {
    area_sqm: measureArea(geometry),
    perimeter_m: measurePerimeter(geometry),
    centroid: { type: "Point", coordinates: measureCentroid(geometry) },
    bbox: measureBbox(geometry),
    vertex_count: countVertices(geometry),
    hole_count: countHoles(geometry),
  };
}

/**
 * Does a closed ring intersect itself?
 *
 * Adjacent edges are allowed to touch at their shared vertex; anything else
 * counts as an intersection. Runs O(n^2), which is fine against the 2,000
 * vertex cap enforced by the validator.
 *
 * MIGRATION: ST_IsValid(geom) / ST_IsValidReason(geom)
 */
export function ringSelfIntersects(ring: readonly Position[]): boolean {
  const edgeCount = ring.length - 1;
  if (edgeCount < 4) return false;

  for (let i = 0; i < edgeCount; i += 1) {
    for (let j = i + 1; j < edgeCount; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === edgeCount - 1);
      if (adjacent) continue;
      if (segmentsIntersect(ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!)) return true;
    }
  }
  return false;
}

function orientation(p: Position, q: Position, r: Position): number {
  const value = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(value) < 1e-14) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(p: Position, q: Position, r: Position): boolean {
  return (
    q[0] <= Math.max(p[0], r[0]) &&
    q[0] >= Math.min(p[0], r[0]) &&
    q[1] <= Math.max(p[1], r[1]) &&
    q[1] >= Math.min(p[1], r[1])
  );
}

function segmentsIntersect(p1: Position, q1: Position, p2: Position, q2: Position): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

/** Re-exported so callers have one import site for geometry maths. */
export type { PolygonRings };
