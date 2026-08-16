import { describe, expect, it } from "vitest";
import { buildDevelopmentFeasibility, buildLandEconomics } from "@/lib/feasibility/engine";
import { acresToSqm } from "@/lib/geo/units";

describe("buildDevelopmentFeasibility", () => {
  it("produces an area breakdown that sums back to the buildable area", () => {
    const siteAreaSqm = acresToSqm(30);
    const result = buildDevelopmentFeasibility(siteAreaSqm, 500_000);

    const sum =
      result.warehouse_gfa.area_sqft +
      result.yard_area.area_sqft +
      result.parking_area.area_sqft +
      result.circulation_area.area_sqft +
      result.open_space_area.area_sqft;
    expect(sum).toBeCloseTo(result.buildable_area.area_sqft, -1);
  });

  it("flags meets_target correctly when achievable GFA is below target", () => {
    const siteAreaSqm = acresToSqm(5); // too small for 500,000 sqft target
    const result = buildDevelopmentFeasibility(siteAreaSqm, 500_000);
    expect(result.meets_target).toBe(false);
    expect(result.target_delta_sqft).toBeLessThan(0);
  });

  it("flags meets_target correctly when achievable GFA exceeds target", () => {
    const siteAreaSqm = acresToSqm(60);
    const result = buildDevelopmentFeasibility(siteAreaSqm, 100_000);
    expect(result.meets_target).toBe(true);
    expect(result.target_delta_sqft).toBeGreaterThan(0);
  });

  it("dock/loading area is a subset of yard area", () => {
    const result = buildDevelopmentFeasibility(acresToSqm(30), 500_000);
    expect(result.dock_loading_area.area_sqft).toBeLessThan(result.yard_area.area_sqft);
  });

  it("never claims zoning is verified", () => {
    const result = buildDevelopmentFeasibility(acresToSqm(30), 500_000);
    expect(result.constraints.zoning_verified).toBe(false);
  });
});

describe("buildLandEconomics", () => {
  it("returns UNKNOWN classification and null figures when land price is unset", () => {
    const result = buildLandEconomics(acresToSqm(30), null, 400_000);
    expect(result.land_price_classification).toBe("UNKNOWN");
    expect(result.estimated_land_cost_inr).toBeNull();
  });

  it("computes cost breakdowns when land price is set", () => {
    const result = buildLandEconomics(acresToSqm(30), 20_000_000, 400_000);
    expect(result.land_price_classification).toBe("USER_INPUT");
    expect(result.estimated_land_cost_inr).toBeCloseTo(30 * 20_000_000);
    expect(result.land_cost_per_gfa_sqft_inr).toBeCloseTo((30 * 20_000_000) / 400_000);
  });
});
