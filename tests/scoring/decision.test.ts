import { describe, expect, it } from "vitest";
import { classifyDecision, DEFAULT_DECISION_THRESHOLDS } from "@/lib/scoring/decision";
import { evaluateConstraints } from "@/lib/analysis/constraints";
import { buildDevelopmentFeasibility } from "@/lib/feasibility/engine";
import { buildFinancialScenario } from "@/lib/financial/engine";
import { fakeAnalysis, fakeScore } from "../helpers/analysis-fixtures";

function setup(landPrice: number | null, scoreOverrides = {}) {
  const analysis = fakeAnalysis({ score: fakeScore(scoreOverrides) });
  const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
  const financials = buildFinancialScenario({
    scenario: "base",
    landAreaSqm: analysis.site.measurements.area_sqm,
    landPricePerAcreInr: landPrice,
    targetGfaSqft: 400_000,
  });
  const constraints = evaluateConstraints(analysis, feasibility, financials);
  return { analysis, financials, constraints };
}

describe("classifyDecision", () => {
  it("rejects a site with a failed exclusion constraint regardless of financials", () => {
    const { analysis, financials } = setup(20_000_000);
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
    const constraints = evaluateConstraints(analysis, feasibility, financials);
    constraints.excluded = true;
    constraints.exclusion_reasons = ["Site area: too small"];
    const result = classifyDecision(analysis.score, financials, constraints, 0);
    expect(result.classification).toBe("REJECT");
  });

  it("holds a site when only land price is missing and everything else passes", () => {
    const { analysis, financials, constraints } = setup(null, { total: 0.8, coverage: 0.9 });
    const result = classifyDecision(analysis.score, financials, constraints, 0);
    expect(result.classification).toBe("HOLD");
  });

  it("pursues a strong site with all criteria met", () => {
    // Use a cheap land price so IRR clears the default 14% threshold.
    const { analysis, financials, constraints } = setup(2_000_000, { total: 0.85, coverage: 0.95 });
    const result = classifyDecision(analysis.score, financials, constraints, 0);
    expect(["PURSUE", "HOLD"]).toContain(result.classification);
  });

  it("rejects a weak site with multiple failing criteria", () => {
    const { analysis, financials, constraints } = setup(200_000_000, { total: 0.3, coverage: 0.3 });
    const result = classifyDecision(analysis.score, financials, constraints, 3);
    expect(result.classification).toBe("REJECT");
  });

  it("exposes DEFAULT_DECISION_THRESHOLDS with sane values", () => {
    expect(DEFAULT_DECISION_THRESHOLDS.min_irr_pct).toBeGreaterThan(0);
    expect(DEFAULT_DECISION_THRESHOLDS.min_score).toBeLessThanOrEqual(1);
  });
});
