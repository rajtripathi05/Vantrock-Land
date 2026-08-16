import type { Metric, SiteAnalysis, SiteScore } from "@/types/domain";
import { defineMetric } from "@/lib/analysis/metric";
import { geometrySource, curatedAssumptionSource } from "@/lib/analysis/sources";

export function fakeMetric(overrides: Partial<Metric> & Pick<Metric, "key" | "category">): Metric {
  return defineMetric({
    key: overrides.key,
    label: overrides.label ?? overrides.key,
    category: overrides.category,
    raw_value: overrides.raw_value ?? 1,
    unit: overrides.unit ?? "unit",
    direction: overrides.direction ?? "benefit",
    normalized_value: overrides.normalized_value ?? 0.8,
    confidence: overrides.confidence ?? 0.8,
    status: overrides.status ?? "ok",
    calculation_note: overrides.calculation_note ?? "test fixture",
    source: overrides.source ?? geometrySource(),
  });
}

export function fakeScore(overrides: Partial<SiteScore> = {}): SiteScore {
  return {
    total: 0.75,
    score_config_id: "test",
    config_name: "Test profile",
    coverage: 0.9,
    confidence: 0.7,
    breakdown: [],
    excluded_metrics: [],
    ...overrides,
  };
}

export function fakeAnalysis(overrides: Partial<SiteAnalysis> = {}, metrics: Metric[] = []): SiteAnalysis {
  const allMetrics: Metric[] =
    metrics.length > 0
      ? metrics
      : [
          fakeMetric({ key: "access.nearest_highway_distance", category: "accessibility", raw_value: 2000 }),
          fakeMetric({ key: "climate.flood_exposure_proxy", category: "hazard", raw_value: 0.2 }),
          fakeMetric({
            key: "infra.nearest_power_substation",
            category: "infrastructure",
            raw_value: 1500,
            confidence: 0.6,
          }),
        ];

  return {
    run: {
      id: "run-1",
      site_id: "site-1",
      status: "complete",
      engine_version: "test",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      coverage: 0.9,
    },
    site: {
      id: "site-1",
      project_id: "project-1",
      name: "Fixture Site",
      source_type: "drawn_polygon",
      geometry: { type: "MultiPolygon", coordinates: [] },
      point_origin: null,
      buffer_radius_m: null,
      measurements: {
        area_sqm: 121_405, // ~30 acres
        perimeter_m: 1400,
        centroid: { type: "Point", coordinates: [73.8, 18.6] },
        bbox: [73.79, 18.59, 73.81, 18.61],
        vertex_count: 4,
        hole_count: 0,
      },
      land_price_per_acre_inr: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    metrics: allMetrics,
    score: fakeScore(),
    warnings: [],
    ...overrides,
  };
}

export { curatedAssumptionSource };
