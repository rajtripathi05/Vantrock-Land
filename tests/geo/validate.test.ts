import { describe, expect, it } from "vitest";
import { validateInputGeometry, validateStoredGeometry } from "@/lib/geo/validate";
import { normalizeToMultiPolygon } from "@/lib/geo/normalize";
import {
  CHAKAN_SITE,
  graticuleRing,
  HUGE_SITE,
  multiPolygon,
  SELF_INTERSECTING_RING,
  SITE_WITH_HOLE,
  TINY_SITE,
} from "../fixtures/geometry";

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

describe("validateInputGeometry", () => {
  it("accepts a well-formed polygon", () => {
    const result = validateInputGeometry({
      type: "Polygon",
      coordinates: [graticuleRing(73.8567, 18.7606, 73.8597, 18.76347)],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a point", () => {
    expect(
      validateInputGeometry({ type: "Point", coordinates: [73.8567, 18.7606] }).valid,
    ).toBe(true);
  });

  it("accepts a polygon with a hole", () => {
    expect(
      validateInputGeometry({ type: "Polygon", coordinates: SITE_WITH_HOLE.coordinates[0]! })
        .valid,
    ).toBe(true);
  });

  it("rejects a non-geometry", () => {
    expect(validateInputGeometry(null).valid).toBe(false);
    expect(validateInputGeometry({}).valid).toBe(false);
    expect(validateInputGeometry("polygon").valid).toBe(false);
  });

  it("rejects unsupported geometry types with a specific code", () => {
    const result = validateInputGeometry({
      type: "LineString",
      coordinates: [
        [73.8, 18.7],
        [73.9, 18.8],
      ],
    });
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("UNSUPPORTED_TYPE");
  });

  it("rejects a ring with too few points", () => {
    const result = validateInputGeometry({
      type: "Polygon",
      coordinates: [
        [
          [73.8, 18.7],
          [73.9, 18.8],
          [73.8, 18.7],
        ],
      ],
    });
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("RING_TOO_FEW_POINTS");
  });

  it("rejects out-of-range coordinates", () => {
    const result = validateInputGeometry({
      type: "Polygon",
      coordinates: [graticuleRing(200, 18.7606, 210, 18.76347)],
    });
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("COORDINATE_OUT_OF_RANGE");
  });

  it("rejects non-finite coordinates", () => {
    const result = validateInputGeometry({
      type: "Polygon",
      coordinates: [
        [
          [73.8, 18.7],
          [Number.NaN, 18.8],
          [73.9, 18.9],
          [73.8, 18.7],
        ],
      ],
    });
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("COORDINATE_NOT_FINITE");
  });

  it("rejects a self-intersecting boundary", () => {
    const result = validateInputGeometry({
      type: "Polygon",
      coordinates: [SELF_INTERSECTING_RING],
    });
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("SELF_INTERSECTING");
  });

  it("gives a specific, actionable message rather than 'invalid geometry'", () => {
    const result = validateInputGeometry({
      type: "Polygon",
      coordinates: [SELF_INTERSECTING_RING],
    });
    expect(result.errors[0]!.message).toMatch(/crosses itself/i);
  });
});

describe("validateStoredGeometry", () => {
  it("accepts a site-sized boundary", () => {
    const result = validateStoredGeometry(CHAKAN_SITE);
    expect(result.valid).toBe(true);
  });

  it("rejects a site below the area floor", () => {
    const result = validateStoredGeometry(TINY_SITE);
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("AREA_TOO_SMALL");
  });

  it("rejects a site above the area ceiling", () => {
    const result = validateStoredGeometry(HUGE_SITE);
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("AREA_TOO_LARGE");
  });

  it("rejects a boundary above the vertex cap", () => {
    const ring = [];
    for (let i = 0; i < 2_100; i += 1) {
      const angle = (2 * Math.PI * i) / 2_100;
      ring.push([73.8567 + 0.005 * Math.cos(angle), 18.7606 + 0.005 * Math.sin(angle)]);
    }
    ring.push(ring[0]!);
    const result = validateStoredGeometry(
      multiPolygon([ring as [number, number][]]),
    );
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("TOO_MANY_VERTICES");
  });

  it("warns about holes without blocking the save", () => {
    const result = validateStoredGeometry(SITE_WITH_HOLE);
    expect(result.valid).toBe(true);
    expect(codes(result.warnings)).toContain("HAS_HOLES");
  });

  it("warns about multipart geometry without blocking the save", () => {
    const result = validateStoredGeometry(
      multiPolygon(
        [graticuleRing(73.8567, 18.7606, 73.8597, 18.76347)],
        [graticuleRing(73.8667, 18.7706, 73.8697, 18.77347)],
      ),
    );
    expect(result.valid).toBe(true);
    expect(codes(result.warnings)).toContain("MULTIPART_GEOMETRY");
  });

  it("warns — but does not block — outside the Indian coverage area", () => {
    // Geometry is universal; only reference data is regional. Blocking here
    // would bake geography into the core (blueprint rule 20).
    const london = normalizeToMultiPolygon({
      type: "Polygon",
      coordinates: [graticuleRing(-0.13, 51.5, -0.127, 51.5029)],
    });
    const result = validateStoredGeometry(london.geometry);
    expect(result.valid).toBe(true);
    expect(codes(result.warnings)).toContain("OUTSIDE_COVERAGE_AREA");
  });
});
