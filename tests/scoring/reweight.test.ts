import { describe, expect, it } from "vitest";
import { categoryWeight, reweightCategory } from "@/lib/scoring/reweight";
import type { WeightProfile } from "@/lib/scoring/weights";
import { totalWeight } from "@/lib/scoring/weights";
import type { Metric } from "@/types/domain";

function metric(key: string, category: Metric["category"]): Metric {
  return {
    key,
    label: key,
    category,
    raw_value: 1,
    raw_text: null,
    unit: "m",
    direction: "cost",
    normalized_value: 0.5,
    confidence: 0.7,
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
      confidence: 0.7,
    },
    evidence_ids: [],
  };
}

const metrics: Metric[] = [
  metric("access.a", "accessibility"),
  metric("access.b", "accessibility"),
  metric("market.a", "market"),
  metric("infra.a", "infrastructure"),
  metric("climate.a", "climate"),
  metric("hazard.a", "hazard"),
];

const profile: WeightProfile = {
  id: "test",
  name: "Test",
  description: "test",
  weights: {
    "access.a": 0.1,
    "access.b": 0.1,
    "market.a": 0.3,
    "infra.a": 0.3,
    "climate.a": 0.1,
    "hazard.a": 0.1,
  },
};

describe("categoryWeight", () => {
  it("sums the weight of every metric in a category", () => {
    expect(categoryWeight(profile, metrics, "accessibility")).toBeCloseTo(0.2);
    expect(categoryWeight(profile, metrics, "market")).toBeCloseTo(0.3);
  });

  it("sums across a group of categories, e.g. a combined Climate/Risk control", () => {
    expect(categoryWeight(profile, metrics, ["climate", "hazard"])).toBeCloseTo(0.2);
  });
});

describe("reweightCategory", () => {
  it("sets the target category to the requested share and keeps the total at 1", () => {
    const reweighted = reweightCategory(profile, metrics, "accessibility", 0.35);
    expect(categoryWeight(reweighted, metrics, "accessibility")).toBeCloseTo(0.35);
    expect(totalWeight(reweighted)).toBeCloseTo(1);
  });

  it("scales every other category down proportionally", () => {
    const reweighted = reweightCategory(profile, metrics, "accessibility", 0.4);
    // market and infra both started at 0.3 (equal), so they should remain equal.
    expect(reweighted.weights["market.a"]).toBeCloseTo(reweighted.weights["infra.a"]!);
  });

  it("reweights a category group (climate + hazard) as a single control", () => {
    const reweighted = reweightCategory(profile, metrics, ["climate", "hazard"], 0.5);
    expect(categoryWeight(reweighted, metrics, ["climate", "hazard"])).toBeCloseTo(0.5);
    expect(totalWeight(reweighted)).toBeCloseTo(1);
    // Within-group relative weights preserved: climate.a and hazard.a started equal.
    expect(reweighted.weights["climate.a"]).toBeCloseTo(reweighted.weights["hazard.a"]!);
  });

  it("clamps the requested weight to [0, 1]", () => {
    const reweighted = reweightCategory(profile, metrics, "accessibility", 1.5);
    expect(categoryWeight(reweighted, metrics, "accessibility")).toBeCloseTo(1);
  });

  it("preserves within-category relative weights", () => {
    const reweighted = reweightCategory(profile, metrics, "accessibility", 0.5);
    // access.a and access.b were equal (0.1 each); should stay equal.
    expect(reweighted.weights["access.a"]).toBeCloseTo(reweighted.weights["access.b"]!);
  });
});
