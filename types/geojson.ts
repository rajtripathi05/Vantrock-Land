/**
 * Minimal GeoJSON types (RFC 7946), scoped to what Vantrock stores.
 *
 * Declared locally rather than pulling in @types/geojson so the domain layer
 * has zero type dependencies and the accepted surface is explicit: we store
 * Point and MultiPolygon, nothing else.
 *
 * ALL coordinates are EPSG:4326 (WGS84 lon, lat) — no exceptions, anywhere.
 */

/** [longitude, latitude] in EPSG:4326. Altitude is deliberately not supported. */
export type Position = [number, number];

/** A closed linear ring. First and last positions must be identical. */
export type LinearRing = Position[];

/**
 * Polygon rings: index 0 is the exterior ring, indices 1..n are holes.
 * Holes are preserved through every transformation in this codebase.
 */
export type PolygonRings = LinearRing[];

export interface PointGeometry {
  type: "Point";
  coordinates: Position;
}

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: PolygonRings;
}

export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: PolygonRings[];
}

/** Geometry types accepted as drawing input from the map. */
export type InputGeometry = PointGeometry | PolygonGeometry | MultiPolygonGeometry;

/**
 * Canonical stored geometry.
 *
 * Every site — polygon, rectangle, or buffered point — is normalized to
 * MultiPolygon before persistence. This mirrors the production column type
 * `geometry(MultiPolygon, 4326)` so exactly one geometry type ever exists.
 */
export type StoredGeometry = MultiPolygonGeometry;

export interface Feature<G = InputGeometry> {
  type: "Feature";
  geometry: G;
  properties: Record<string, unknown> | null;
  id?: string | number;
}

export interface FeatureCollection<G = InputGeometry> {
  type: "FeatureCollection";
  features: Feature<G>[];
}

/** Bounding box as [west, south, east, north]. */
export type BBox = [number, number, number, number];
