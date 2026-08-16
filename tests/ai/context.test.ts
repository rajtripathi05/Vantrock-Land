import { describe, expect, it } from "vitest";
import { buildAnalystContext, buildSiteSummary, analystContextSchema } from "@/lib/ai/context";
import { scoreSite } from "@/lib/scoring/engine";
import { DEFAULT_WEIGHT_PROFILE } from "@/lib/scoring/weights";
import { measureGeometry } from "@/lib/geo/measure";
import { CHAKAN_SITE } from "../fixtures/geometry";
import type { AnalysisWarning, Metric, Project, Site, SiteAnalysis, SourceMetadata } from "@/types/domain";
import type { FinancialScenarioResult } from "@/lib/financial/types";

const SOURCE: SourceMetadata = {
  source_id: "test-source",
  name: "Test source",
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
    evidence_ids: [SOURCE.source_id],
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

const PROJECT: Project = {
  id: "project-1",
  owner_id: "local-analyst",
  name: "Test Mandate",
  asset_class: "grade_a_logistics",
  target_gfa_sqft: 500000,
  region_label: "Pune / Chakan / Talegaon",
  working_srid: 32643,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("buildSiteSummary", () => {
  it("summarizes score, coverage, contributors, warnings, and evidence", () => {
    const analysis = makeAnalysis("site-a", "Candidate Site A", {
      "access.nearest_highway_distance": 0.95,
    });
    const summary = buildSiteSummary(analysis, null);

    expect(summary.site_id).toBe("site-a");
    expect(summary.score_total).toBeGreaterThan(0);
    expect(summary.top_contributors.length).toBeGreaterThan(0);
    expect(summary.evidence.some((e) => e.evidence_id === "test-source")).toBe(true);
    expect(summary.financial_base).toBeNull();
  });

  it("includes financial base-case outputs when supplied", () => {
    const analysis = makeAnalysis("site-a", "Candidate Site A", {});
    const financial: FinancialScenarioResult = {
      scenario: "base",
      inputs: {
        land_area_acres: { value: 10, classification: "DERIVED", label: "", unit: "", note: "" },
        land_price_per_acre_inr: { value: 50_000_000, classification: "USER_INPUT", label: "", unit: "", note: "" },
        target_gfa_sqft: { value: 500000, classification: "USER_INPUT", label: "", unit: "", note: "" },
        ground_coverage_ratio: { value: 0.45, classification: "CURATED", label: "", unit: "", note: "" },
        rent_inr_per_sqft_per_month: { value: 24, classification: "CURATED", label: "", unit: "", note: "" },
        rent_growth_pct_per_year: { value: 0.05, classification: "CURATED", label: "", unit: "", note: "" },
        stabilized_occupancy_pct: { value: 0.92, classification: "CURATED", label: "", unit: "", note: "" },
        opex_ratio_pct: { value: 0.08, classification: "CURATED", label: "", unit: "", note: "" },
        construction_cost_inr_per_sqft: { value: 1800, classification: "CURATED", label: "", unit: "", note: "" },
        soft_cost_pct: { value: 0.12, classification: "CURATED", label: "", unit: "", note: "" },
        loan_to_cost_pct: { value: 0.6, classification: "CURATED", label: "", unit: "", note: "" },
        debt_interest_rate_pct: { value: 0.11, classification: "CURATED", label: "", unit: "", note: "" },
        development_period_months: { value: 18, classification: "CURATED", label: "", unit: "", note: "" },
        hold_period_years: { value: 5, classification: "CURATED", label: "", unit: "", note: "" },
        exit_cap_rate_pct: { value: 0.0825, classification: "CURATED", label: "", unit: "", note: "" },
      },
      outputs: {
        achievable_gfa_sqft: 200000,
        gross_potential_rent_inr_annual: 57_600_000,
        noi_inr_annual: 48_700_000,
        land_cost_inr: 500_000_000,
        construction_cost_inr: 360_000_000,
        soft_cost_inr: 43_200_000,
        total_development_cost_inr: 903_200_000,
        gdv_inr: 590_000_000,
        yield_on_cost_pct: 0.054,
        residual_land_value_inr: 186_800_000,
        debt_inr: 541_920_000,
        equity_inr: 361_280_000,
        annual_equity_cash_flows_inr: [-361_280_000, 10_000_000],
        irr_pct: 0.12,
        equity_multiple: 1.8,
      },
    };

    const summary = buildSiteSummary(analysis, financial);
    expect(summary.financial_base?.land_price_known).toBe(true);
    expect(summary.financial_base?.irr_pct).toBe(0.12);
    expect(summary.financial_base?.equity_multiple).toBe(1.8);
  });
});

describe("buildAnalystContext", () => {
  it("caps sites at 3 and validates against analystContextSchema", () => {
    const analyses = [
      makeAnalysis("site-a", "A", {}),
      makeAnalysis("site-b", "B", {}),
      makeAnalysis("site-c", "C", {}),
      makeAnalysis("site-d", "D", {}),
    ];
    const context = buildAnalystContext(PROJECT, analyses, new Map(), DEFAULT_WEIGHT_PROFILE.name, "site-a");

    expect(context.sites).toHaveLength(3);
    expect(() => analystContextSchema.parse(context)).not.toThrow();
  });
});
