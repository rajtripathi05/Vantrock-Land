import { describe, expect, it } from "vitest";
import {
  buildAllScenarios,
  buildFinancialScenario,
  computeAchievableGfaSqft,
  computeConstructionCost,
  computeGdv,
  computeGrossPotentialRent,
  computeLandCost,
  computeNoi,
  computeResidualLandValue,
  computeSoftCost,
  computeTdc,
  computeYieldOnCost,
} from "@/lib/financial/engine";

describe("financial primitives", () => {
  it("computeAchievableGfaSqft scales land area by coverage ratio", () => {
    expect(computeAchievableGfaSqft(10, 0.45)).toBeCloseTo(10 * 43_560 * 0.45);
  });

  it("computeGrossPotentialRent annualizes monthly rent", () => {
    expect(computeGrossPotentialRent(100_000, 24)).toBe(100_000 * 24 * 12);
  });

  it("computeNoi applies occupancy and opex ratio", () => {
    expect(computeNoi(1_000_000, 0.9, 0.1)).toBeCloseTo(1_000_000 * 0.9 * 0.9);
  });

  it("computeConstructionCost and computeSoftCost scale linearly", () => {
    const construction = computeConstructionCost(100_000, 1_800);
    expect(construction).toBe(180_000_000);
    expect(computeSoftCost(construction, 0.12)).toBeCloseTo(21_600_000);
  });

  it("computeLandCost returns null when price is unknown", () => {
    expect(computeLandCost(10, null)).toBeNull();
    expect(computeLandCost(10, 20_000_000)).toBe(200_000_000);
  });

  it("computeTdc propagates null when land cost is null", () => {
    expect(computeTdc(null, 100, 10)).toBeNull();
    expect(computeTdc(50, 100, 10)).toBe(160);
  });

  it("computeGdv capitalizes NOI at the exit cap rate", () => {
    expect(computeGdv(1_000_000, 0.08)).toBeCloseTo(12_500_000);
  });

  it("computeYieldOnCost is null when TDC is null or zero", () => {
    expect(computeYieldOnCost(100, null)).toBeNull();
    expect(computeYieldOnCost(100, 0)).toBeNull();
    expect(computeYieldOnCost(100, 1000)).toBeCloseTo(0.1);
  });

  it("computeResidualLandValue can be negative", () => {
    expect(computeResidualLandValue(1000, 900, 200)).toBe(-100);
  });
});

describe("buildFinancialScenario", () => {
  const baseParams = {
    landAreaSqm: 40_468.56, // 10 acres
    landPricePerAcreInr: 25_000_000,
    targetGfaSqft: 500_000,
  };

  it("produces every headline output for a fully-specified site", () => {
    const result = buildFinancialScenario({ ...baseParams, scenario: "base" });
    expect(result.outputs.achievable_gfa_sqft).toBeGreaterThan(0);
    expect(result.outputs.noi_inr_annual).toBeGreaterThan(0);
    expect(result.outputs.total_development_cost_inr).not.toBeNull();
    expect(result.outputs.gdv_inr).toBeGreaterThan(0);
    expect(result.outputs.yield_on_cost_pct).not.toBeNull();
    expect(result.outputs.irr_pct).not.toBeNull();
    expect(result.outputs.equity_multiple).not.toBeNull();
  });

  it("propagates UNKNOWN land price to null TDC, yield-on-cost, IRR, and equity multiple", () => {
    const result = buildFinancialScenario({ ...baseParams, landPricePerAcreInr: null, scenario: "base" });
    expect(result.inputs.land_price_per_acre_inr.classification).toBe("UNKNOWN");
    expect(result.outputs.land_cost_inr).toBeNull();
    expect(result.outputs.total_development_cost_inr).toBeNull();
    expect(result.outputs.yield_on_cost_pct).toBeNull();
    expect(result.outputs.equity_inr).toBeNull();
    expect(result.outputs.irr_pct).toBeNull();
    expect(result.outputs.equity_multiple).toBeNull();
    // NOI, GDV, and RLV do not depend on land price and must still compute.
    expect(result.outputs.noi_inr_annual).toBeGreaterThan(0);
    expect(result.outputs.gdv_inr).toBeGreaterThan(0);
  });

  it("orders scenarios downside < base < upside on NOI and IRR", () => {
    const [downside, base, upside] = buildAllScenarios(baseParams);
    expect(downside!.outputs.noi_inr_annual).toBeLessThan(base!.outputs.noi_inr_annual);
    expect(base!.outputs.noi_inr_annual).toBeLessThan(upside!.outputs.noi_inr_annual);
    expect(downside!.outputs.irr_pct!).toBeLessThan(base!.outputs.irr_pct!);
    expect(base!.outputs.irr_pct!).toBeLessThan(upside!.outputs.irr_pct!);
  });

  it("labels every assumption with a classification", () => {
    const result = buildFinancialScenario({ ...baseParams, scenario: "base" });
    for (const input of Object.values(result.inputs)) {
      expect(["USER_INPUT", "CURATED", "DERIVED", "UNKNOWN"]).toContain(input.classification);
    }
  });

  it("is deterministic for identical inputs", () => {
    const a = buildFinancialScenario({ ...baseParams, scenario: "base" });
    const b = buildFinancialScenario({ ...baseParams, scenario: "base" });
    expect(a.outputs).toEqual(b.outputs);
  });

  it("respects overrides for rent and construction cost", () => {
    const overridden = buildFinancialScenario({
      ...baseParams,
      scenario: "base",
      overrides: { rent_inr_per_sqft_per_month: 30 },
    });
    const defaultResult = buildFinancialScenario({ ...baseParams, scenario: "base" });
    expect(overridden.outputs.noi_inr_annual).toBeGreaterThan(defaultResult.outputs.noi_inr_annual);
  });

  it("respects an occupancy override (Phase 8)", () => {
    const overridden = buildFinancialScenario({
      ...baseParams,
      scenario: "base",
      overrides: { stabilized_occupancy_pct: 0.5 },
    });
    const defaultResult = buildFinancialScenario({ ...baseParams, scenario: "base" });
    expect(overridden.inputs.stabilized_occupancy_pct.value).toBeCloseTo(0.5);
    expect(overridden.outputs.noi_inr_annual).toBeLessThan(defaultResult.outputs.noi_inr_annual);
  });

  it("clamps an occupancy override to [0, 1]", () => {
    const overridden = buildFinancialScenario({
      ...baseParams,
      scenario: "base",
      overrides: { stabilized_occupancy_pct: 1.5 },
    });
    expect(overridden.inputs.stabilized_occupancy_pct.value).toBe(1);
  });

  it("respects a soft cost override (Phase 8)", () => {
    const overridden = buildFinancialScenario({
      ...baseParams,
      scenario: "base",
      overrides: { soft_cost_pct: 0.25 },
    });
    const defaultResult = buildFinancialScenario({ ...baseParams, scenario: "base" });
    expect(overridden.inputs.soft_cost_pct.value).toBeCloseTo(0.25);
    expect(overridden.outputs.soft_cost_inr).toBeGreaterThan(defaultResult.outputs.soft_cost_inr);
    // TDC rises with soft cost, so RLV (GDV - construction - soft cost) must fall.
    expect(overridden.outputs.residual_land_value_inr).toBeLessThan(
      defaultResult.outputs.residual_land_value_inr,
    );
  });

  it("respects a development period override but it drives no output formula (Phase 8, documented limitation)", () => {
    const overridden = buildFinancialScenario({
      ...baseParams,
      scenario: "base",
      overrides: { development_period_months: 36 },
    });
    const defaultResult = buildFinancialScenario({ ...baseParams, scenario: "base" });
    expect(overridden.inputs.development_period_months.value).toBe(36);
    expect(overridden.outputs).toEqual(defaultResult.outputs);
  });

  it("marks an overridden assumption USER_INPUT instead of CURATED", () => {
    const overridden = buildFinancialScenario({
      ...baseParams,
      scenario: "base",
      overrides: {
        rent_inr_per_sqft_per_month: 30,
        stabilized_occupancy_pct: 0.8,
        construction_cost_inr_per_sqft: 2000,
        soft_cost_pct: 0.15,
        exit_cap_rate_pct: 0.09,
        development_period_months: 24,
      },
    });
    expect(overridden.inputs.rent_inr_per_sqft_per_month.classification).toBe("USER_INPUT");
    expect(overridden.inputs.stabilized_occupancy_pct.classification).toBe("USER_INPUT");
    expect(overridden.inputs.construction_cost_inr_per_sqft.classification).toBe("USER_INPUT");
    expect(overridden.inputs.soft_cost_pct.classification).toBe("USER_INPUT");
    expect(overridden.inputs.exit_cap_rate_pct.classification).toBe("USER_INPUT");
    expect(overridden.inputs.development_period_months.classification).toBe("USER_INPUT");
    // Untouched assumptions stay CURATED.
    expect(overridden.inputs.opex_ratio_pct.classification).toBe("CURATED");
  });

  it("still applies the scenario multiplier on top of an overridden rent", () => {
    const overriddenBase = buildFinancialScenario({
      ...baseParams,
      scenario: "base",
      overrides: { rent_inr_per_sqft_per_month: 100 },
    });
    const overriddenDownside = buildFinancialScenario({
      ...baseParams,
      scenario: "downside",
      overrides: { rent_inr_per_sqft_per_month: 100 },
    });
    expect(overriddenBase.inputs.rent_inr_per_sqft_per_month.value).toBeCloseTo(100);
    expect(overriddenDownside.inputs.rent_inr_per_sqft_per_month.value).toBeCloseTo(90); // ×0.9
  });
});
