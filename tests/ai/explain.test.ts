import { describe, expect, it } from "vitest";
import {
  explainBiggestRisk,
  explainDrivingAssumptions,
  explainRanking,
  explainWeightSensitivity,
  explainWhatWouldFlip,
  explainWhyNot,
} from "@/lib/ai/explain";
import { scoreSite } from "@/lib/scoring/engine";
import { DEFAULT_WEIGHT_PROFILE } from "@/lib/scoring/weights";
import { measureGeometry } from "@/lib/geo/measure";
import { CHAKAN_SITE } from "../fixtures/geometry";
import type { AnalysisWarning, Metric, Site, SiteAnalysis, SourceMetadata } from "@/types/domain";

const SOURCE: SourceMetadata = {
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
};

function metric(overrides: Partial<Metric> & Pick<Metric, "key" | "category">): Metric {
  return {
    label: overrides.key,
    raw_value: 500,
    raw_text: null,
    unit: "m",
    direction: "cost",
    normalized_value: 0.6,
    confidence: 0.75,
    status: "ok",
    calculation_note: "test calculation",
    resolution_note: null,
    source: SOURCE,
    evidence_ids: ["test"],
    ...overrides,
  };
}

function site(id: string, name: string): Site {
  const geometry = CHAKAN_SITE;
  return {
    id,
    project_id: "project-1",
    name,
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

const METRIC_KEYS = Object.keys(DEFAULT_WEIGHT_PROFILE.weights);

function makeAnalysis(
  siteId: string,
  siteName: string,
  normalizedValues: Record<string, number>,
  warnings: AnalysisWarning[] = [],
): SiteAnalysis {
  const metrics = METRIC_KEYS.map((key) =>
    metric({
      key,
      category: key.split(".")[0] === "geo" ? "geography" : (key.split(".")[0] as Metric["category"]),
      normalized_value: normalizedValues[key] ?? 0.5,
    }),
  );
  const score = scoreSite(metrics, DEFAULT_WEIGHT_PROFILE);
  return {
    run: {
      id: "run-1",
      site_id: siteId,
      status: "complete",
      engine_version: "test",
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:00:00.000Z",
      coverage: 1,
    },
    site: site(siteId, siteName),
    metrics,
    score,
    warnings,
  };
}

describe("explainRanking", () => {
  it("identifies the leader and cites its top contributors", () => {
    const strong = makeAnalysis("site-a", "Candidate Site A", {
      "access.nearest_highway_distance": 0.95,
      "infra.nearest_rail": 0.9,
    });
    const weak = makeAnalysis("site-b", "Candidate Site B", {
      "access.nearest_highway_distance": 0.2,
      "infra.nearest_rail": 0.2,
    });
    const text = explainRanking([strong, weak]);
    expect(text).toContain("Candidate Site A");
    expect(text).toContain("ranks first");
    expect(text).toContain("Candidate Site B");
  });

  it("handles a single site with no comparison", () => {
    const only = makeAnalysis("site-a", "Candidate Site A", {});
    const text = explainRanking([only]);
    expect(text).toContain("Candidate Site A");
  });
});

describe("explainBiggestRisk", () => {
  it("surfaces a high-severity warning first", () => {
    const analysis = makeAnalysis("site-a", "Candidate Site A", {}, [
      { code: "OUTSIDE_OSM_COVERAGE", severity: "high", message: "Outside coverage area." },
    ]);
    expect(explainBiggestRisk(analysis)).toContain("Outside coverage area.");
  });

  it("falls back to the weakest scored metric when no high warning exists", () => {
    const analysis = makeAnalysis("site-a", "Candidate Site A", {
      "access.nearest_highway_distance": 0.05,
    });
    const text = explainBiggestRisk(analysis);
    expect(text).toContain("Candidate Site A");
  });
});

describe("explainDrivingAssumptions", () => {
  it("names non-LIVE sources among the top contributors", () => {
    const analysis = makeAnalysis("site-a", "Candidate Site A", {
      "geo.gfa_adequacy": 0.95,
    });
    const text = explainDrivingAssumptions(analysis);
    expect(text).toContain("Candidate Site A");
  });
});

describe("explainWhatWouldFlip", () => {
  it("identifies the leading metric gaps for a trailing site", () => {
    const leader = makeAnalysis("site-a", "Candidate Site A", {
      "access.nearest_highway_distance": 0.95,
    });
    const trailing = makeAnalysis("site-b", "Candidate Site B", {
      "access.nearest_highway_distance": 0.1,
    });
    const text = explainWhatWouldFlip([leader, trailing], "site-b");
    expect(text).toContain("Candidate Site B");
    expect(text).toContain("Candidate Site A");
  });

  it("says the site already leads when it is the top-ranked site", () => {
    const leader = makeAnalysis("site-a", "Candidate Site A", {
      "access.nearest_highway_distance": 0.95,
    });
    const trailing = makeAnalysis("site-b", "Candidate Site B", {
      "access.nearest_highway_distance": 0.1,
    });
    const text = explainWhatWouldFlip([leader, trailing], "site-a");
    expect(text).toContain("already ranks first");
  });
});

describe("explainWhyNot", () => {
  it("returns null when there are fewer than 2 scored sites", () => {
    const only = makeAnalysis("site-a", "Candidate Site A", {});
    expect(explainWhyNot([only], "site-a")).toBeNull();
  });

  it("returns null for the leader itself — there's no 'why not' for the winner", () => {
    const leader = makeAnalysis("site-a", "Candidate Site A", { "market.poi_count_2km": 0.9 });
    const trailing = makeAnalysis("site-b", "Candidate Site B", { "market.poi_count_2km": 0.1 });
    expect(explainWhyNot([leader, trailing], "site-a")).toBeNull();
  });

  it("lists a category as a weakness when the trailing site scores materially lower", () => {
    const leader = makeAnalysis("site-a", "Candidate Site A", { "market.poi_count_2km": 0.9 });
    const trailing = makeAnalysis("site-b", "Candidate Site B", { "market.poi_count_2km": 0.1 });
    const result = explainWhyNot([leader, trailing], "site-b");
    expect(result).not.toBeNull();
    expect(result!.site_name).toBe("Candidate Site B");
    expect(result!.leader_name).toBe("Candidate Site A");
    expect(result!.weaknesses.some((line) => /market/i.test(line))).toBe(true);
    expect(result!.score_gap_pts).toBeGreaterThan(0);
  });

  it("lists a category as a strength when the trailing site scores materially higher there", () => {
    const leader = makeAnalysis("site-a", "Candidate Site A", {
      "access.nearest_highway_distance": 0.95,
      "labour.population_proxy": 0.1,
    });
    const trailing = makeAnalysis("site-b", "Candidate Site B", {
      "access.nearest_highway_distance": 0.1,
      "labour.population_proxy": 0.95,
    });
    const result = explainWhyNot([leader, trailing], "site-b");
    expect(result).not.toBeNull();
    expect(result!.strengths.some((line) => /labour/i.test(line))).toBe(true);
  });

  it("flags higher risk when the trailing site has more high-severity warnings", () => {
    const leader = makeAnalysis("site-a", "Candidate Site A", {});
    const trailing = makeAnalysis("site-b", "Candidate Site B", {}, [
      { code: "OUTSIDE_OSM_COVERAGE", severity: "high", message: "Outside coverage." },
    ]);
    const result = explainWhyNot([leader, trailing], "site-b");
    expect(result!.weaknesses.some((line) => /higher risk/i.test(line))).toBe(true);
  });

  it("reports no dominant factor when the gap is spread thinly", () => {
    // Every category nearly identical -> below the comparison margin.
    const leader = makeAnalysis("site-a", "Candidate Site A", { "market.poi_count_2km": 0.51 });
    const trailing = makeAnalysis("site-b", "Candidate Site B", { "market.poi_count_2km": 0.5 });
    const result = explainWhyNot([leader, trailing], "site-b");
    expect(result!.strengths).toHaveLength(0);
    expect(result!.weaknesses).toHaveLength(0);
  });
});

describe("explainWeightSensitivity", () => {
  it("recomputes the score under a hypothetical accessibility weight", () => {
    const analysis = makeAnalysis("site-a", "Candidate Site A", {
      "access.nearest_highway_distance": 0.95,
      "access.nearest_road_distance": 0.95,
    });
    const text = explainWeightSensitivity(analysis, DEFAULT_WEIGHT_PROFILE, "accessibility", 0.35);
    expect(text).toContain("35%");
    expect(text).toContain("Candidate Site A");
  });
});
