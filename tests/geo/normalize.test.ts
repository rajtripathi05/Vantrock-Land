import { describe, expect, it } from "vitest";
import {
  bufferPointToPolygon,
  closeRing,
  DEFAULT_POINT_BUFFER_RADIUS_M,
  normalizeToMultiPolygon,
} from "@/lib/geo/normalize";
import { measureArea, measureCentroid } from "@/lib/geo/measure";
import { geodesicDistance } from "@/lib/geo/ellipsoid";
import { graticuleRing, SITE_WITH_HOLE } from "../fixtures/geometry";

describe("closeRing", () => {
  it("closes an open ring", () => {
    const closed = closeRing([
      [73.8, 18.7],
      [73.9, 18.7],
      [73.9, 18.8],
    ]);
    expect(closed).toHaveLength(4);
    expect(closed[0]).toEqual(closed[3]);
  });

  it("leaves an already-closed ring alone", () => {
    const ring = graticuleRing(73.8567, 18.7606, 73.8597, 18.76347);
    expect(closeRing(ring)).toHaveLength(ring.length);
  });
});

describe("normalizeToMultiPolygon", () => {
  it("wraps a Polygon into a MultiPolygon", () => {
    const result = normalizeToMultiPolygon({
      type: "Polygon",
      coordinates: [graticuleRing(73.8567, 18.7606, 73.8597, 18.76347)],
    });
    expect(result.geometry.type).toBe("MultiPolygon");
    expect(result.geometry.coordinates).toHaveLength(1);
    expect(result.pointOrigin).toBeNull();
  });

  it("preserves interior rings", () => {
    const result = normalizeToMultiPolygon({
      type: "Polygon",
      coordinates: SITE_WITH_HOLE.coordinates[0]!,
    });
    expect(result.geometry.coordinates[0]).toHaveLength(2);
  });

  it("orients the exterior ring counter-clockwise and holes clockwise", () => {
    const result = normalizeToMultiPolygon({
      type: "Polygon",
      coordinates: SITE_WITH_HOLE.coordinates[0]!,
    });
    const [exterior, hole] = result.geometry.coordinates[0]!;
    expect(signedArea(exterior!)).toBeGreaterThan(0);
    expect(signedArea(hole!)).toBeLessThan(0);
  });

  it("closes an unclosed ring", () => {
    const result = normalizeToMultiPolygon({
      type: "Polygon",
      coordinates: [
        [
          [73.8567, 18.7606],
          [73.8597, 18.7606],
          [73.8597, 18.76347],
          [73.8567, 18.76347],
        ],
      ],
    });
    const ring = result.geometry.coordinates[0]![0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("removes consecutive duplicate positions", () => {
    const result = normalizeToMultiPolygon({
      type: "Polygon",
      coordinates: [
        [
          [73.8567, 18.7606],
          [73.8567, 18.7606],
          [73.8597, 18.7606],
          [73.8597, 18.76347],
          [73.8567, 18.7606],
        ],
      ],
    });
    expect(result.geometry.coordinates[0]![0]).toHaveLength(4);
  });

  it("buffers a Point into a polygon and records the origin", () => {
    const result = normalizeToMultiPolygon({
      type: "Point",
      coordinates: [73.8567, 18.7606],
    });
    expect(result.geometry.type).toBe("MultiPolygon");
    expect(result.pointOrigin).toEqual([73.8567, 18.7606]);
    expect(result.bufferRadiusMetres).toBe(DEFAULT_POINT_BUFFER_RADIUS_M);
    expect(measureArea(result.geometry)).toBeGreaterThan(0);
  });

  it("honours a custom buffer radius", () => {
    const result = normalizeToMultiPolygon(
      { type: "Point", coordinates: [73.8567, 18.7606] },
      { bufferRadiusMetres: 500 },
    );
    expect(result.bufferRadiusMetres).toBe(500);
    // Circle area: pi * r^2, minus a small polygonal-approximation shortfall.
    const expected = Math.PI * 500 * 500;
    expect(measureArea(result.geometry) / expected).toBeGreaterThan(0.995);
    expect(measureArea(result.geometry) / expected).toBeLessThanOrEqual(1);
  });
});

describe("bufferPointToPolygon", () => {
  it("places every vertex at the requested radius", () => {
    const centre: [number, number] = [73.8567, 18.7606];
    const circle = bufferPointToPolygon(centre, 250);
    const ring = circle.coordinates[0]![0]!;
    for (const vertex of ring) {
      expect(geodesicDistance(centre, vertex)).toBeCloseTo(250, 1);
    }
  });

  it("keeps its centroid at the origin point", () => {
    const centre: [number, number] = [73.8567, 18.7606];
    const [lon, lat] = measureCentroid(bufferPointToPolygon(centre, 250));
    expect(lon).toBeCloseTo(centre[0], 5);
    expect(lat).toBeCloseTo(centre[1], 5);
  });
});

function signedArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}
