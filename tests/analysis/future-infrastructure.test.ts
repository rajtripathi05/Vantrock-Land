import { describe, expect, it } from "vitest";
import { buildFutureInfrastructureMetrics } from "@/lib/analysis/metrics/future-infrastructure";
import { measureGeometry } from "@/lib/geo/measure";
import { graticuleRing, multiPolygon } from "../fixtures/geometry";
import type { Site } from "@/types/domain";

function siteAt(lon: number, lat: number): Site {
  const geometry = multiPolygon([graticuleRing(lon, lat, lon + 0.002, lat + 0.002)]);
  return {
    id: "site-x",
    project_id: "project-x",
    name: "Site X",
    source_type: "drawn_polygon",
    geometry,
    point_origin: null,
    buffer_radius_m: null,
    measurements: measureGeometry(geometry),
    land_price_per_acre_inr: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("buildFutureInfrastructureMetrics", () => {
  it("returns one informational metric per tracked category, never weighted", () => {
    const metrics = buildFutureInfrastructureMetrics(siteAt(73.86, 18.72));
    expect(metrics.length).toBeGreaterThan(0);
    for (const metric of metrics) {
      expect(metric.category).toBe("infrastructure_future");
      expect(metric.direction).toBe("neutral");
      expect(metric.normalized_value).toBeNull();
    }
  });

  it("labels every source CURATED, never LIVE or authoritative", () => {
    const metrics = buildFutureInfrastructureMetrics(siteAt(73.86, 18.72));
    for (const metric of metrics.filter((m) => m.status === "ok")) {
      expect(metric.source.classification).toBe("CURATED");
    }
  });

  it("is deterministic for identical input", () => {
    const a = buildFutureInfrastructureMetrics(siteAt(73.7, 18.74));
    const b = buildFutureInfrastructureMetrics(siteAt(73.7, 18.74));
    expect(a.map((m) => m.raw_value)).toEqual(b.map((m) => m.raw_value));
  });

  it("surfaces project status in calculation_note so ANNOUNCED is never conflated with OPERATIONAL", () => {
    const metrics = buildFutureInfrastructureMetrics(siteAt(73.67, 18.74));
    const logisticsPark = metrics.find((m) => m.key === "infra_future.logistics_park");
    expect(logisticsPark?.calculation_note).toMatch(/ANNOUNCED/);
  });
});
