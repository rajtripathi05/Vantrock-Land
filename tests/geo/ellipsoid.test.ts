import { describe, expect, it } from "vitest";
import {
  destinationPoint,
  geodesicDistance,
  meridianArc,
  normalizeLongitude,
  radiiOfCurvature,
  toRadians,
  utmSridFor,
} from "@/lib/geo/ellipsoid";

describe("geodesicDistance", () => {
  it("matches the published WGS84 length of one degree of latitude at the equator", () => {
    // Standard reference value: 110,574.389 m.
    const distance = geodesicDistance([0, 0], [0, 1]);
    expect(distance).toBeCloseTo(110574.389, 2);
  });

  it("matches the published WGS84 length of one degree of longitude at the equator", () => {
    // At the equator this is the semi-major axis arc: 111,319.491 m.
    const distance = geodesicDistance([0, 0], [1, 0]);
    expect(distance).toBeCloseTo(111319.491, 2);
  });

  it("shortens a degree of longitude by cos(latitude) away from the equator", () => {
    const atEquator = geodesicDistance([0, 0], [1, 0]);
    const atChakan = geodesicDistance([73, 18.76], [74, 18.76]);
    const ratio = atChakan / atEquator;
    expect(ratio).toBeCloseTo(Math.cos(toRadians(18.76)), 3);
  });

  it("returns zero for coincident points", () => {
    expect(geodesicDistance([73.8567, 18.7606], [73.8567, 18.7606])).toBe(0);
  });

  it("is symmetric", () => {
    const forward = geodesicDistance([73.8567, 18.7606], [73.9, 18.8]);
    const reverse = geodesicDistance([73.9, 18.8], [73.8567, 18.7606]);
    expect(forward).toBeCloseTo(reverse, 9);
  });

  it("never returns NaN for antipodal points", () => {
    // Vincenty famously fails to converge here; the fallback must still
    // produce a usable number rather than poisoning every downstream metric.
    const distance = geodesicDistance([0, 0], [180, 0]);
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThan(19_000_000);
  });
});

describe("destinationPoint", () => {
  it("round-trips with geodesicDistance", () => {
    const origin: [number, number] = [73.8567, 18.7606];
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const destination = destinationPoint(origin, bearing, 1000);
      expect(geodesicDistance(origin, destination)).toBeCloseTo(1000, 3);
    }
  });

  it("moves due north for bearing 0", () => {
    const [lon, lat] = destinationPoint([73.8567, 18.7606], 0, 1000);
    expect(lon).toBeCloseTo(73.8567, 6);
    expect(lat).toBeGreaterThan(18.7606);
  });

  it("moves due east for bearing 90", () => {
    const [lon, lat] = destinationPoint([73.8567, 18.7606], 90, 1000);
    expect(lon).toBeGreaterThan(73.8567);
    expect(lat).toBeCloseTo(18.7606, 4);
  });
});

describe("radiiOfCurvature", () => {
  it("equals the semi-major axis for the normal radius at the equator", () => {
    const { normal } = radiiOfCurvature(0);
    expect(normal).toBeCloseTo(6378137.0, 6);
  });

  it("has meridional smaller than normal away from the poles", () => {
    const { meridional, normal } = radiiOfCurvature(toRadians(18.76));
    expect(meridional).toBeLessThan(normal);
  });
});

describe("meridianArc", () => {
  it("is zero at the equator", () => {
    expect(meridianArc(0)).toBeCloseTo(0, 9);
  });

  it("matches the published quarter-meridian length at the pole", () => {
    // WGS84 quarter meridian: 10,001,965.729 m.
    expect(meridianArc(Math.PI / 2)).toBeCloseTo(10001965.729, 1);
  });
});

describe("normalizeLongitude", () => {
  it("leaves in-range values untouched", () => {
    expect(normalizeLongitude(73.8567)).toBe(73.8567);
    expect(normalizeLongitude(-180)).toBe(-180);
    expect(normalizeLongitude(180)).toBe(180);
  });

  it("wraps out-of-range values", () => {
    expect(normalizeLongitude(190)).toBeCloseTo(-170, 9);
    expect(normalizeLongitude(-190)).toBeCloseTo(170, 9);
  });
});

describe("utmSridFor", () => {
  it("derives the correct zone rather than hardcoding one geography", () => {
    // Blueprint rule 20: one geography first, but not baked into the code.
    expect(utmSridFor([73.8567, 18.7606])).toBe(32643); // Pune / Chakan
    expect(utmSridFor([88.36, 22.57])).toBe(32645); // Kolkata
    expect(utmSridFor([151.21, -33.87])).toBe(32756); // Sydney, southern
    expect(utmSridFor([-0.12, 51.5])).toBe(32630); // London
  });
});
