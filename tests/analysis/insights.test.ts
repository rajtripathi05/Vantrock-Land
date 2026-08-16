import { describe, expect, it } from "vitest";
import { generateQuickInsights } from "@/lib/analysis/insights";
import { evaluateConstraints } from "@/lib/analysis/constraints";
import { buildDevelopmentFeasibility } from "@/lib/feasibility/engine";
import { buildFinancialScenario } from "@/lib/financial/engine";
import { fakeAnalysis } from "../helpers/analysis-fixtures";

describe("generateQuickInsights", () => {
  it("flags strong highway access when the metric is close", () => {
    const analysis = fakeAnalysis();
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
    const constraints = evaluateConstraints(analysis, feasibility, null);
    const insights = generateQuickInsights(analysis, constraints, feasibility, null);
    expect(insights.some((i) => i.code === "STRONG_HIGHWAY_ACCESS")).toBe(true);
  });

  it("flags low data coverage when score coverage is thin", () => {
    const analysis = fakeAnalysis({ score: { total: 0.5, score_config_id: "t", config_name: "t", coverage: 0.3, confidence: 0.3, breakdown: [], excluded_metrics: [] } });
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
    const constraints = evaluateConstraints(analysis, feasibility, null);
    const insights = generateQuickInsights(analysis, constraints, feasibility, null);
    expect(insights.some((i) => i.code === "LOW_DATA_COVERAGE")).toBe(true);
  });

  it("flags a strong financial case for a high-IRR scenario", () => {
    const analysis = fakeAnalysis();
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
    const financials = buildFinancialScenario({
      scenario: "base",
      landAreaSqm: analysis.site.measurements.area_sqm,
      landPricePerAcreInr: 2_000_000,
      targetGfaSqft: 400_000,
    });
    const constraints = evaluateConstraints(analysis, feasibility, financials);
    const insights = generateQuickInsights(analysis, constraints, feasibility, financials);
    expect(insights.some((i) => i.code === "STRONG_FINANCIAL_CASE")).toBe(true);
  });

  it("every insight carries a traceable ref", () => {
    const analysis = fakeAnalysis();
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
    const constraints = evaluateConstraints(analysis, feasibility, null);
    const insights = generateQuickInsights(analysis, constraints, feasibility, null);
    for (const insight of insights) {
      expect(insight.ref).toBeTruthy();
    }
  });
});
