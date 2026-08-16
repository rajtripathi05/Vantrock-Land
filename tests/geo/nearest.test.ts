import { describe, expect, it } from "vitest";
import { nearestPolyline, nearestPoint, nearestVertex, pointsWithinRadius } from "@/lib/geo/nearest";
import { geodesicDistance } from "@/lib/geo/ellipsoid";
import type { Position } from "@/types/geojson";

describe("nearestPolyline", () => {
  const segment = {
    id: "seg-1",
    coordinates: [
      [73.85, 18.7] as Position,
      [73.85, 18.71] as Position,
    ],
  };

  it("returns the geodesic distance to the nearer endpoint when the query point is beyond the segment", () => {
    const query: Position = [73.85, 18.72];
    const result = nearestPolyline(query, [segment], 50_000);
    expect(result).not.toBeNull();
    const expected = geodesicDistance(query, [73.85, 18.71]);
    expect(result!.distance_m).toBeCloseTo(expected, 0);
  });

  it("returns the perpendicular distance when the foot of the perpendicular lies within the segment", () => {
    const query: Position = [73.86, 18.705];
    const result = nearestPolyline(query, [segment], 50_000);
    expect(result).not.toBeNull();
    // Perpendicular foot is roughly [73.85, 18.705]; true distance is close
    // to (but not exactly) the geodesic distance to that foot.
    const approxFoot = geodesicDistance(query, [73.85, 18.705]);
    expect(result!.distance_m).toBeGreaterThan(approxFoot * 0.99);
    expect(result!.distance_m).toBeLessThan(approxFoot * 1.01);
  });

  it("returns null when nothing is within the search radius", () => {
    const query: Position = [73.85, 19.5]; // ~90km north
    const result = nearestPolyline(query, [segment], 1_000);
    expect(result).toBeNull();
  });

  it("picks the closest of several candidate features", () => {
    const near = { id: "near", coordinates: [[73.851, 18.705] as Position, [73.851, 18.706] as Position] };
    const far = { id: "far", coordinates: [[73.9, 18.705] as Position, [73.9, 18.706] as Position] };
    const result = nearestPolyline([73.85, 18.7055], [far, near], 50_000);
    expect(result!.feature.id).toBe("near");
  });

  it("handles a degenerate single-point ring segment without throwing", () => {
    const degenerate = { id: "point-like", coordinates: [[73.85, 18.7] as Position] };
    expect(() => nearestPolyline([73.85, 18.7], [degenerate], 1_000)).not.toThrow();
  });
});

describe("nearestPoint", () => {
  const pois = [
    { id: "a", lon: 73.86, lat: 18.76 },
    { id: "b", lon: 73.9, lat: 18.8 },
  ];

  it("finds the nearest point feature", () => {
    const result = nearestPoint([73.8567, 18.7606], pois, 50_000);
    expect(result!.feature.id).toBe("a");
    const expected = geodesicDistance([73.8567, 18.7606], [73.86, 18.76]);
    expect(result!.distance_m).toBeCloseTo(expected, 0);
  });

  it("returns null beyond the search radius", () => {
    const result = nearestPoint([0, 0], pois, 1_000);
    expect(result).toBeNull();
  });
});

describe("nearestVertex", () => {
  const coordinates: Position[] = [
    [73.85, 18.7],
    [73.86, 18.71],
    [73.9, 18.75],
  ];

  it("returns the closest of the given vertices, not an interpolated point", () => {
    const result = nearestVertex([73.861, 18.711], coordinates);
    expect(result).toEqual([73.86, 18.71]);
  });

  it("returns null for an empty coordinate list", () => {
    expect(nearestVertex([73.85, 18.7], [])).toBeNull();
  });
});

describe("pointsWithinRadius", () => {
  it("returns only features within the radius", () => {
    const pois = [
      { id: "close", lon: 73.857, lat: 18.761 },
      { id: "far", lon: 74.5, lat: 19.5 },
    ];
    const within = pointsWithinRadius([73.8567, 18.7606], pois, 2_000);
    expect(within.map((p) => p.id)).toEqual(["close"]);
  });
});
