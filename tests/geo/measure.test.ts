import { describe, expect, it } from "vitest";
import {
  countHoles,
  countVertices,
  measureArea,
  measureBbox,
  measureCentroid,
  measureGeometry,
  measurePerimeter,
  ringSelfIntersects,
} from "@/lib/geo/measure";
import { geodesicDistance } from "@/lib/geo/ellipsoid";
import { sqmToAcres, sqmToSqft } from "@/lib/geo/units";
import {
  CHAKAN_SITE,
  CHAKAN_SITE_BOUNDS,
  graticuleCellArea,
  graticuleRing,
  MULTIPART_SITE,
  multiPolygon,
  SELF_INTERSECTING_RING,
  SITE_HOLE_BOUNDS,
  SITE_WITH_HOLE,
} from "../fixtures/geometry";

describe("measureArea — against an independent closed-form reference", () => {
  it("matches the exact ellipsoidal area of a site-sized graticule cell to within 0.02%", () => {
    const { west, south, east, north } = CHAKAN_SITE_BOUNDS;
    const expected = graticuleCellArea(west, south, east, north);
    const actual = measureArea(CHAKAN_SITE);
    const relativeError = Math.abs(actual - expected) / expected;

    expect(relativeError).toBeLessThan(0.0002);
  });

  it("stays within 0.1% for a 5 km cell, documenting the projection's limit", () => {
    // The local sinusoidal projection degrades as the polygon grows, because
    // meridians curve in the projection while the shoelace treats edges as
    // straight. This test pins the size at which that matters, so a future
    // change cannot silently widen the gap with PostGIS.
    const expected = graticuleCellArea(73.8, 18.7, 73.85, 18.75);
    const actual = measureArea(multiPolygon([graticuleRing(73.8, 18.7, 73.85, 18.75)]));
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.001);
  });

  it("reports the Chakan fixture as roughly 25 acres", () => {
    // Sanity anchor in the units an analyst actually uses.
    const acres = sqmToAcres(measureArea(CHAKAN_SITE));
    expect(acres).toBeGreaterThan(24);
    expect(acres).toBeLessThan(26);
  });

  it("subtracts interior rings", () => {
    const outer = graticuleCellArea(
      CHAKAN_SITE_BOUNDS.west,
      CHAKAN_SITE_BOUNDS.south,
      CHAKAN_SITE_BOUNDS.east,
      CHAKAN_SITE_BOUNDS.north,
    );
    const hole = graticuleCellArea(
      SITE_HOLE_BOUNDS.west,
      SITE_HOLE_BOUNDS.south,
      SITE_HOLE_BOUNDS.east,
      SITE_HOLE_BOUNDS.north,
    );
    const actual = measureArea(SITE_WITH_HOLE);

    expect(actual).toBeLessThan(measureArea(CHAKAN_SITE));
    expect(Math.abs(actual - (outer - hole)) / (outer - hole)).toBeLessThan(0.0005);
  });

  it("sums the parts of a multipart site", () => {
    const single = measureArea(CHAKAN_SITE);
    const multi = measureArea(MULTIPART_SITE);
    expect(multi / single).toBeCloseTo(2, 1);
  });

  it("is independent of ring winding order", () => {
    const clockwise = multiPolygon([
      [...graticuleRing(73.8567, 18.7606, 73.8597, 18.76347)].reverse(),
    ]);
    expect(measureArea(clockwise)).toBeCloseTo(measureArea(CHAKAN_SITE), 6);
  });

  it("returns zero for a degenerate ring rather than NaN", () => {
    const degenerate = multiPolygon([
      [
        [73.8567, 18.7606],
        [73.8567, 18.7606],
        [73.8567, 18.7606],
        [73.8567, 18.7606],
      ],
    ]);
    expect(measureArea(degenerate)).toBe(0);
  });
});

describe("measurePerimeter", () => {
  it("equals the sum of geodesic edge lengths", () => {
    const ring = graticuleRing(
      CHAKAN_SITE_BOUNDS.west,
      CHAKAN_SITE_BOUNDS.south,
      CHAKAN_SITE_BOUNDS.east,
      CHAKAN_SITE_BOUNDS.north,
    );
    let expected = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      expected += geodesicDistance(ring[i]!, ring[i + 1]!);
    }
    expect(measurePerimeter(CHAKAN_SITE)).toBeCloseTo(expected, 6);
  });

  it("includes hole boundaries", () => {
    expect(measurePerimeter(SITE_WITH_HOLE)).toBeGreaterThan(measurePerimeter(CHAKAN_SITE));
  });

  it("produces a plausible perimeter for a ~25 acre site", () => {
    // A 25-acre square is roughly 318 m on a side, so ~1,270 m around.
    const perimeter = measurePerimeter(CHAKAN_SITE);
    expect(perimeter).toBeGreaterThan(1_100);
    expect(perimeter).toBeLessThan(1_500);
  });
});

describe("measureCentroid", () => {
  it("returns the geometric centre of a rectangle", () => {
    const { west, south, east, north } = CHAKAN_SITE_BOUNDS;
    const [lon, lat] = measureCentroid(CHAKAN_SITE);
    expect(lon).toBeCloseTo((west + east) / 2, 9);
    expect(lat).toBeCloseTo((south + north) / 2, 9);
  });

  it("is unchanged by a symmetric hole", () => {
    const [holeLon, holeLat] = measureCentroid(SITE_WITH_HOLE);
    const [plainLon, plainLat] = measureCentroid(CHAKAN_SITE);
    expect(holeLon).toBeCloseTo(plainLon, 6);
    expect(holeLat).toBeCloseTo(plainLat, 6);
  });

  it("is independent of ring winding order", () => {
    const clockwise = multiPolygon([
      [...graticuleRing(73.8567, 18.7606, 73.8597, 18.76347)].reverse(),
    ]);
    const [cwLon, cwLat] = measureCentroid(clockwise);
    const [ccwLon, ccwLat] = measureCentroid(CHAKAN_SITE);
    expect(cwLon).toBeCloseTo(ccwLon, 9);
    expect(cwLat).toBeCloseTo(ccwLat, 9);
  });

  it("falls back to the vertex mean for zero-area input instead of returning NaN", () => {
    const degenerate = multiPolygon([
      [
        [73.8567, 18.7606],
        [73.8567, 18.7606],
        [73.8567, 18.7606],
        [73.8567, 18.7606],
      ],
    ]);
    const [lon, lat] = measureCentroid(degenerate);
    expect(Number.isNaN(lon)).toBe(false);
    expect(Number.isNaN(lat)).toBe(false);
    expect(lon).toBeCloseTo(73.8567, 9);
  });
});

describe("measureBbox / counts", () => {
  it("returns [west, south, east, north]", () => {
    const bbox = measureBbox(CHAKAN_SITE);
    expect(bbox).toEqual([
      CHAKAN_SITE_BOUNDS.west,
      CHAKAN_SITE_BOUNDS.south,
      CHAKAN_SITE_BOUNDS.east,
      CHAKAN_SITE_BOUNDS.north,
    ]);
  });

  it("counts vertices across all rings", () => {
    expect(countVertices(CHAKAN_SITE)).toBe(5);
    expect(countVertices(SITE_WITH_HOLE)).toBe(10);
  });

  it("counts holes, not exterior rings", () => {
    expect(countHoles(CHAKAN_SITE)).toBe(0);
    expect(countHoles(SITE_WITH_HOLE)).toBe(1);
    expect(countHoles(MULTIPART_SITE)).toBe(0);
  });
});

describe("measureGeometry", () => {
  it("computes the whole measurement set consistently in one pass", () => {
    const measurements = measureGeometry(CHAKAN_SITE);

    expect(measurements.area_sqm).toBeCloseTo(measureArea(CHAKAN_SITE), 9);
    expect(measurements.perimeter_m).toBeCloseTo(measurePerimeter(CHAKAN_SITE), 9);
    expect(measurements.centroid.type).toBe("Point");
    expect(measurements.vertex_count).toBe(5);
    expect(measurements.hole_count).toBe(0);
    expect(sqmToSqft(measurements.area_sqm)).toBeGreaterThan(1_000_000);
  });
});

describe("ringSelfIntersects", () => {
  it("detects a bow-tie", () => {
    expect(ringSelfIntersects(SELF_INTERSECTING_RING)).toBe(true);
  });

  it("accepts a simple rectangle", () => {
    expect(ringSelfIntersects(graticuleRing(73.8567, 18.7606, 73.8597, 18.76347))).toBe(false);
  });

  it("accepts an L-shaped concave boundary", () => {
    // Concave is legitimate — plenty of real parcels are L-shaped.
    expect(
      ringSelfIntersects([
        [73.85, 18.76],
        [73.86, 18.76],
        [73.86, 18.765],
        [73.855, 18.765],
        [73.855, 18.77],
        [73.85, 18.77],
        [73.85, 18.76],
      ]),
    ).toBe(false);
  });
});
