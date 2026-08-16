import { describe, expect, it } from "vitest";
import { categoryPerformance } from "@/lib/scoring/rollup";
import { scoreSite } from "@/lib/scoring/engine";
import type { WeightProfile } from "@/lib/scoring/weights";
import type { Metric, SiteAnalysis } from "@/types/domain";

function metric(overrides: Partial<Metric> & Pick<Metric, "key" | "category">): Metric {
  return {
    label: overrides.key,
    raw_value: 1,
    raw_text: null,
    unit: "m",
    direction: "cost",
    normalized_value: 0.5,
    confidence: 0.75,
    status: "ok",
    calculation_note: "test",
    resolution_note: null,
    source: {
      source_id: "test",
      name: "test",
      provider: "test",
      source_url: "",
      license: "",
      attribution: "",
      classification: "PRELOADED",
      data_timestamp: null,
      retrieved_at: "2026-01-01T00:00:00.000Z",
      confidence: 0.75,
    },
    evidence_ids: [],
    ...overrides,
  };
}

const PROFILE: WeightProfile = {
  id: "test",
  name: "Test",
  description: "test",
  weights: { "access.a": 0.3, "access.b": 0.3, "market.a": 0.4 },
};

function analysis(metrics: Metric[]): SiteAnalysis {
  return {
    run: {
      id: "run",
      site_id: "site",
      status: "complete",
      engine_version: "test",
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:00:00.000Z",
      coverage: 1,
    },
    site: {} as SiteAnalysis["site"],
    metrics,
    score: scoreSite(metrics, PROFILE),
    warnings: [],
  };
}

describe("categoryPerformance", () => {
  it("averages normalized value within a category, weighted by nominal weight", () => {
    const a = analysis([
      metric({ key: "access.a", category: "accessibility", normalized_value: 1.0 }),
      metric({ key: "access.b", category: "accessibility", normalized_value: 0.0 }),
      metric({ key: "market.a", category: "market", normalized_value: 0.8 }),
    ]);
    // access.a and access.b both weight 0.3 -> equal weighting -> average of 1.0 and 0.0 = 0.5.
    expect(categoryPerformance(a, "accessibility")).toBeCloseTo(0.5);
    expect(categoryPerformance(a, "market")).toBeCloseTo(0.8);
  });

  it("returns null for a category with no metrics", () => {
    const a = analysis([metric({ key: "market.a", category: "market", normalized_value: 0.8 })]);
    expect(categoryPerformance(a, "labour")).toBeNull();
  });

  it("excludes missing metrics from the average rather than treating them as 0", () => {
    const a = analysis([
      metric({ key: "access.a", category: "accessibility", normalized_value: 0.9 }),
      metric({
        key: "access.b",
        category: "accessibility",
        status: "missing",
        normalized_value: null,
        raw_value: null,
      }),
    ]);
    // Only access.a counts (0.3 weight) — a missing metric must not drag the average toward 0.
    expect(categoryPerformance(a, "accessibility")).toBeCloseTo(0.9);
  });

  it("is independent of cross-category weight redistribution", () => {
    // A profile where market's weight (0.4) is entirely redistributed away
    // (its metric is missing) must not inflate accessibility's category
    // rollup above what accessibility's own metrics actually scored.
    const a = analysis([
      metric({ key: "access.a", category: "accessibility", normalized_value: 0.6 }),
      metric({ key: "access.b", category: "accessibility", normalized_value: 0.6 }),
      metric({
        key: "market.a",
        category: "market",
        status: "missing",
        normalized_value: null,
        raw_value: null,
      }),
    ]);
    expect(categoryPerformance(a, "accessibility")).toBeCloseTo(0.6);
  });

  it("returns null when the analysis has no score", () => {
    const noScore: SiteAnalysis = {
      ...analysis([metric({ key: "access.a", category: "accessibility" })]),
      score: null,
    };
    expect(categoryPerformance(noScore, "accessibility")).toBeNull();
  });
});
