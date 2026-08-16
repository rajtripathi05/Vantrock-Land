import { describe, expect, it } from "vitest";
import { collectEvidence, getEvidenceByIds, metricsForEvidence } from "@/lib/evidence/collect";
import type { Metric, SourceMetadata } from "@/types/domain";

function source(id: string): SourceMetadata {
  return {
    source_id: id,
    name: id,
    provider: "test",
    source_url: "",
    license: "",
    attribution: "",
    classification: "PRELOADED",
    data_timestamp: null,
    retrieved_at: "2026-01-01T00:00:00.000Z",
    confidence: 0.7,
  };
}

function metric(key: string, sourceId: string): Metric {
  return {
    key,
    label: key,
    category: "accessibility",
    raw_value: 1,
    raw_text: null,
    unit: "m",
    direction: "cost",
    normalized_value: 0.5,
    confidence: 0.7,
    status: "ok",
    calculation_note: "test",
    resolution_note: null,
    source: source(sourceId),
    evidence_ids: [sourceId],
  };
}

describe("collectEvidence", () => {
  it("deduplicates sources cited by multiple metrics", () => {
    const analysis = { metrics: [metric("a", "osm"), metric("b", "osm"), metric("c", "curated")] };
    const evidence = collectEvidence(analysis);
    expect(evidence).toHaveLength(2);
    expect(evidence.map((e) => e.source_id).sort()).toEqual(["curated", "osm"]);
  });
});

describe("getEvidenceByIds", () => {
  it("resolves requested ids and ignores unknown ones", () => {
    const analysis = { metrics: [metric("a", "osm")] };
    const resolved = getEvidenceByIds(analysis, ["osm", "does-not-exist"]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.source_id).toBe("osm");
  });
});

describe("metricsForEvidence", () => {
  it("finds every metric citing a given evidence id", () => {
    const analysis = { metrics: [metric("a", "osm"), metric("b", "osm"), metric("c", "curated")] };
    const citing = metricsForEvidence(analysis, "osm");
    expect(citing.map((m) => m.key).sort()).toEqual(["a", "b"]);
  });
});
