/**
 * Nearest-feature queries against point/polyline reference data (OSM roads,
 * POIs, curated anchors).
 *
 * Uses a local tangent-plane projection about the QUERY point — accurate to
 * well under 0.1% for the search radii this module is used at (tens of
 * kilometres, never global). This mirrors the local-projection technique in
 * measure.ts, but re-centred per query rather than per geometry, because here
 * the "origin" is the site, not the feature being measured.
 *
 * This is a STRAIGHT-LINE distance engine, not a routing engine. Every
 * distance produced here must be presented as "straight-line distance" or
 * "ordinary road access proxy" — never as a route distance or truck-routing
 * result (blueprint Phase 4 / Phase 16 rule).
 *
 * PURE MODULE: no I/O, no framework, no storage.
 */

import type { Position } from "@/types/geojson";
import { radiiOfCurvature, toRadians } from "./ellipsoid";

interface LocalProjector {
  (point: Position): [number, number];
}

/** Build a local metre-projection function centred on `origin`. */
function localProjector(origin: Position): LocalProjector {
  const originLatRad = toRadians(origin[1]);
  const { meridional, normal } = radiiOfCurvature(originLatRad);
  const cosLat = Math.cos(originLatRad);
  return (point: Position): [number, number] => {
    const x = toRadians(point[0] - origin[0]) * normal * cosLat;
    const y = toRadians(point[1] - origin[1]) * meridional;
    return [x, y];
  };
}

function distancePointToSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const abLenSq = abx * abx + aby * aby;
  let t = abLenSq === 0 ? 0 : (apx * abx + apy * aby) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * abx;
  const cy = a[1] + t * aby;
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

export interface Polyline {
  coordinates: Position[];
}

export interface NearestPolylineResult<T extends Polyline> {
  feature: T;
  distance_m: number;
}

/**
 * Nearest polyline feature to `point`, by true perpendicular distance to the
 * nearest segment (not nearest vertex).
 *
 * `maxSearchMetres` bounds the search so a site far outside the reference
 * dataset's coverage area returns "not found" rather than a technically-true
 * but meaningless distance to the closest sliver of data thousands of
 * kilometres away.
 */
export function nearestPolyline<T extends Polyline>(
  point: Position,
  features: readonly T[],
  maxSearchMetres: number,
): NearestPolylineResult<T> | null {
  const project = localProjector(point);
  const origin: [number, number] = [0, 0];

  let best: NearestPolylineResult<T> | null = null;

  for (const feature of features) {
    const coords = feature.coordinates;
    for (let i = 0; i < coords.length - 1; i += 1) {
      const a = project(coords[i]!);
      const b = project(coords[i + 1]!);
      // Segments far outside the max radius cannot be the minimum; skip the
      // expensive projection/segment math for them via a cheap bounding check.
      if (
        Math.min(a[0], b[0]) > maxSearchMetres ||
        Math.max(a[0], b[0]) < -maxSearchMetres ||
        Math.min(a[1], b[1]) > maxSearchMetres ||
        Math.max(a[1], b[1]) < -maxSearchMetres
      ) {
        continue;
      }
      const distance = distancePointToSegment(origin, a, b);
      if (distance <= maxSearchMetres && (!best || distance < best.distance_m)) {
        best = { feature, distance_m: distance };
      }
    }
  }

  return best;
}

/**
 * Closest vertex of a polyline to `point` (not the closest point on a
 * segment — the closest existing coordinate). Used as a routing waypoint: a
 * routing engine snaps to the real road network regardless, so the small
 * extra distance versus the true nearest segment point is immaterial and
 * this avoids inverting the local tangent-plane projection.
 */
export function nearestVertex(point: Position, coordinates: readonly Position[]): Position | null {
  if (coordinates.length === 0) return null;
  const project = localProjector(point);
  let best: Position | null = null;
  let bestDistSq = Infinity;
  for (const coordinate of coordinates) {
    const [x, y] = project(coordinate);
    const distSq = x * x + y * y;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = coordinate;
    }
  }
  return best;
}

export interface PointFeature {
  lon: number;
  lat: number;
}

export interface NearestPointResult<T extends PointFeature> {
  feature: T;
  distance_m: number;
}

/** Nearest point feature to `point`, bounded by `maxSearchMetres`. */
export function nearestPoint<T extends PointFeature>(
  point: Position,
  features: readonly T[],
  maxSearchMetres: number,
): NearestPointResult<T> | null {
  const project = localProjector(point);
  let best: NearestPointResult<T> | null = null;

  for (const feature of features) {
    const [x, y] = project([feature.lon, feature.lat]);
    const distance = Math.sqrt(x * x + y * y);
    if (distance <= maxSearchMetres && (!best || distance < best.distance_m)) {
      best = { feature, distance_m: distance };
    }
  }

  return best;
}

/** Count of point features within `radiusMetres` of `point`. */
export function pointsWithinRadius<T extends PointFeature>(
  point: Position,
  features: readonly T[],
  radiusMetres: number,
): T[] {
  const project = localProjector(point);
  const withinRadius: T[] = [];

  for (const feature of features) {
    const [x, y] = project([feature.lon, feature.lat]);
    if (Math.sqrt(x * x + y * y) <= radiusMetres) withinRadius.push(feature);
  }

  return withinRadius;
}
