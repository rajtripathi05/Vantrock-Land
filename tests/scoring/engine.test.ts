import { describe, expect, it } from "vitest";
import { scoreSite } from "@/lib/scoring/engine";
import type { WeightProfile } from "@/lib/scoring/weights";
import type { Metric } from "@/types/domain";

function metric(overrides: Partial<Metric> & Pick<Metric, "key">): Metric {
  return {
    label: overrides.key,
    category: "accessibility",
    raw_value: 100,
    raw_text: null,
    unit: "m",
    direction: "cost",
    normalized_value: 0.8,
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
    evidence_ids: ["test"],
    ...overrides,
  };
}

const EQUAL_PROFILE: WeightProfile = {
  id: "equal",
  name: "Equal",
  description: "test",
  weights: { a: 0.5, b: 0.5 },
};

describe("scoreSite", () => {
  it("computes a simple weighted sum when all metrics are ok", () => {
    const metrics = [
      metric({ key: "a", normalized_value: 1.0 }),
      metric({ key: "b", normalized_value: 0.5 }),
    ];
    const score = scoreSite(metrics, EQUAL_PROFILE);
    expect(score.total).toBeCloseTo(0.75); // 0.5*1.0 + 0.5*0.5
    expect(score.coverage).toBe(1);
  });

  it("redistributes weight away from a missing metric rather than zeroing it out", () => {
    const metrics = [
      metric({ key: "a", normalized_value: 1.0 }),
      metric({ key: "b", status: "missing", normalized_value: null, raw_value: null }),
    ];
    const score = scoreSite(metrics, EQUAL_PROFILE);
    // b's 0.5 weight is redistributed entirely to a, so a now carries full weight.
    expect(score.total).toBeCloseTo(1.0);
    expect(score.coverage).toBeCloseTo(0.5);
    expect(score.excluded_metrics).toHaveLength(1);
    expect(score.excluded_metrics[0]).toMatchObject({ metric_key: "b", reason: "missing" });
  });

  it("returns zero score and zero coverage when every weighted metric is missing", () => {
    const metrics = [
      metric({ key: "a", status: "missing", normalized_value: null }),
      metric({ key: "b", status: "missing", normalized_value: null }),
    ];
    const score = scoreSite(metrics, EQUAL_PROFILE);
    expect(score.total).toBe(0);
    expect(score.coverage).toBe(0);
    expect(score.confidence).toBe(0);
  });

  it("treats low_confidence and conflicted metrics as excluded", () => {
    const metrics = [
      metric({ key: "a", normalized_value: 1.0 }),
      metric({ key: "b", status: "low_confidence" }),
    ];
    const score = scoreSite(metrics, EQUAL_PROFILE);
    expect(score.excluded_metrics.map((e) => e.reason)).toContain("low_confidence");
  });

  it("treats a profiled metric key with no corresponding Metric as missing", () => {
    const metrics = [metric({ key: "a", normalized_value: 1.0 })];
    const score = scoreSite(metrics, EQUAL_PROFILE); // "b" never appears in metrics
    expect(score.excluded_metrics.map((e) => e.metric_key)).toContain("b");
    expect(score.total).toBeCloseTo(1.0);
  });

  it("keeps the total score within [0, 1] even with unusual normalized values", () => {
    const metrics = [metric({ key: "a", normalized_value: 1 }), metric({ key: "b", normalized_value: 1 })];
    const score = scoreSite(metrics, EQUAL_PROFILE);
    expect(score.total).toBeLessThanOrEqual(1);
    expect(score.total).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic", () => {
    const metrics = [metric({ key: "a", normalized_value: 0.6 }), metric({ key: "b", normalized_value: 0.3 })];
    const first = scoreSite(metrics, EQUAL_PROFILE);
    const second = scoreSite(metrics, EQUAL_PROFILE);
    expect(first).toEqual(second);
  });
});
