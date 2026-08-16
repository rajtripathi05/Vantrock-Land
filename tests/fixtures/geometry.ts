/**
 * Golden geometry fixtures.
 *
 * The rectangles here are GRATICULE CELLS — bounded by two meridians and two
 * parallels — which means their true ellipsoidal area has an exact closed-form
 * solution (see `graticuleCellArea` below). That gives the area tests an
 * INDEPENDENT reference rather than checking our implementation against
 * itself.
 *
 * These same fixtures are the ones that will be run against PostGIS when the
 * production engine lands, so the two can be compared on identical input.
 */

import type { MultiPolygonGeometry, PolygonRings, Position } from "@/types/geojson";
import { WGS84_A, WGS84_E2 } from "@/lib/geo/ellipsoid";

/** Chakan MIDC area — the initial MVP submarket. */
export const CHAKAN_ORIGIN: Position = [73.8567, 18.7606];

export function graticuleRing(
  west: number,
  south: number,
  east: number,
  north: number,
): Position[] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

export function multiPolygon(...polygons: PolygonRings[]): MultiPolygonGeometry {
  return { type: "MultiPolygon", coordinates: polygons };
}

/**
 * Exact area of a lon/lat graticule cell on the WGS84 ellipsoid, in m².
 *
 * Closed-form integral of the ellipsoidal area element
 *   dA = a²(1-e²)·cosφ / (1-e²sin²φ)² dφ dλ
 * evaluated between the cell's parallels and multiplied by its longitude span.
 *
 * This is an INDEPENDENT reference implementation, used only in tests. It
 * shares no code path with lib/geo/measure.ts beyond the ellipsoid constants.
 */
export function graticuleCellArea(
  west: number,
  south: number,
  east: number,
  north: number,
): number {
  const e = Math.sqrt(WGS84_E2);
  const zone = (latDegrees: number): number => {
    const phi = (latDegrees * Math.PI) / 180;
    const sinPhi = Math.sin(phi);
    return (
      sinPhi / (2 * (1 - WGS84_E2 * sinPhi * sinPhi)) +
      Math.log((1 + e * sinPhi) / (1 - e * sinPhi)) / (4 * e)
    );
  };
  const deltaLambda = ((east - west) * Math.PI) / 180;
  return WGS84_A * WGS84_A * (1 - WGS84_E2) * deltaLambda * (zone(north) - zone(south));
}

// ---------------------------------------------------------------------------
// Named fixtures
// ---------------------------------------------------------------------------

/** ~25 acres at Chakan — the size band a 500,000 sq ft warehouse needs. */
export const CHAKAN_SITE_BOUNDS = {
  west: 73.8567,
  south: 18.7606,
  east: 73.8597,
  north: 18.76347,
} as const;

export const CHAKAN_SITE: MultiPolygonGeometry = multiPolygon([
  graticuleRing(
    CHAKAN_SITE_BOUNDS.west,
    CHAKAN_SITE_BOUNDS.south,
    CHAKAN_SITE_BOUNDS.east,
    CHAKAN_SITE_BOUNDS.north,
  ),
]);

/**
 * A site with an interior exclusion — verifies holes are subtracted.
 *
 * The hole is deliberately CONCENTRIC with the outer ring (both centred on
 * 73.85820, 18.762035) so that centroid tests can assert the hole does not
 * move the centre. An off-centre hole legitimately shifts the centroid, which
 * would make that assertion meaningless.
 */
export const SITE_HOLE_BOUNDS = {
  west: 73.8577,
  south: 18.761535,
  east: 73.8587,
  north: 18.762535,
} as const;

export const SITE_WITH_HOLE: MultiPolygonGeometry = multiPolygon([
  graticuleRing(
    CHAKAN_SITE_BOUNDS.west,
    CHAKAN_SITE_BOUNDS.south,
    CHAKAN_SITE_BOUNDS.east,
    CHAKAN_SITE_BOUNDS.north,
  ),
  graticuleRing(
    SITE_HOLE_BOUNDS.west,
    SITE_HOLE_BOUNDS.south,
    SITE_HOLE_BOUNDS.east,
    SITE_HOLE_BOUNDS.north,
  ),
]);

/** Two disjoint parcels — verifies multipart areas sum. */
export const MULTIPART_SITE: MultiPolygonGeometry = multiPolygon(
  [graticuleRing(73.8567, 18.7606, 73.8597, 18.76347)],
  [graticuleRing(73.8667, 18.7706, 73.8697, 18.77347)],
);

/** A bow-tie. The classic invalid boundary. */
export const SELF_INTERSECTING_RING: Position[] = [
  [73.8567, 18.7606],
  [73.8597, 18.76347],
  [73.8597, 18.7606],
  [73.8567, 18.76347],
  [73.8567, 18.7606],
];

/** Below the 1,000 m² floor — an accidental click, not a site. */
export const TINY_SITE: MultiPolygonGeometry = multiPolygon([
  graticuleRing(73.8567, 18.7606, 73.85675, 18.76065),
]);

/** Above the 50 km² ceiling — a mis-drag, not a candidate site. */
export const HUGE_SITE: MultiPolygonGeometry = multiPolygon([
  graticuleRing(73.0, 18.0, 74.0, 19.0),
]);
