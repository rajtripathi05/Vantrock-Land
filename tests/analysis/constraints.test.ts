import { describe, expect, it } from "vitest";
import { evaluateConstraints } from "@/lib/analysis/constraints";
import { buildDevelopmentFeasibility } from "@/lib/feasibility/engine";
import { buildFinancialScenario } from "@/lib/financial/engine";
import { fakeAnalysis } from "../helpers/analysis-fixtures";
import { acresToSqm } from "@/lib/geo/units";

describe("evaluateConstraints", () => {
  it("passes site area on a large, well-connected site", () => {
    const analysis = fakeAnalysis();
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
    const result = evaluateConstraints(analysis, feasibility, null);
    const siteArea = result.checks.find((c) => c.id === "site_area_minimum");
    expect(siteArea?.status).toBe("PASS");
    expect(result.excluded).toBe(false);
  });

  it("excludes a site below the minimum area threshold", () => {
    const analysis = fakeAnalysis();
    analysis.site.measurements.area_sqm = acresToSqm(2); // far too small
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 500_000);
    const result = evaluateConstraints(analysis, feasibility, null);
    expect(result.excluded).toBe(true);
    expect(result.exclusion_reasons.length).toBeGreaterThan(0);
  });

  it("excludes a site outside the study area", () => {
    const analysis = fakeAnalysis();
    analysis.warnings = [{ code: "OUTSIDE_OSM_COVERAGE", severity: "high", message: "outside" }];
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
    const result = evaluateConstraints(analysis, feasibility, null);
    expect(result.excluded).toBe(true);
  });

  it("flags high flood exposure as FAIL and an exclusion", () => {
    const analysis = fakeAnalysis({}, [
      { ...fakeAnalysis().metrics[1]!, key: "climate.flood_exposure_proxy", raw_value: 0.9, status: "ok" },
    ]);
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
    const result = evaluateConstraints(analysis, feasibility, null);
    const flood = result.checks.find((c) => c.id === "flood_exposure");
    expect(flood?.status).toBe("FAIL");
    expect(result.excluded).toBe(true);
  });

  it("never marks zoning as verified", () => {
    const analysis = fakeAnalysis();
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
    const result = evaluateConstraints(analysis, feasibility, null);
    const zoning = result.checks.find((c) => c.id === "zoning_verified");
    expect(zoning?.status).toBe("UNKNOWN");
    expect(zoning?.value).toContain("NOT VERIFIED");
  });

  it("adds financial checks when base financials are supplied", () => {
    const analysis = fakeAnalysis();
    const feasibility = buildDevelopmentFeasibility(analysis.site.measurements.area_sqm, 400_000);
    const financials = buildFinancialScenario({
      scenario: "base",
      landAreaSqm: analysis.site.measurements.area_sqm,
      landPricePerAcreInr: 20_000_000,
      targetGfaSqft: 400_000,
    });
    const result = evaluateConstraints(analysis, feasibility, financials);
    expect(result.checks.some((c) => c.id === "irr_viability")).toBe(true);
  });
});
