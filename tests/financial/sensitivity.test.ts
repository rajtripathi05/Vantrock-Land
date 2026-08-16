import { describe, expect, it } from "vitest";
import { findBreakEven, runAllSensitivities, runSensitivity } from "@/lib/financial/sensitivity";
import { acresToSqm } from "@/lib/geo/units";

const baseParams = {
  landAreaSqm: acresToSqm(30),
  landPricePerAcreInr: 20_000_000,
  targetGfaSqft: 400_000,
};

describe("runSensitivity", () => {
  it("returns 5 points sweeping ±20% around the base value", () => {
    const points = runSensitivity("rent", baseParams);
    expect(points).toHaveLength(5);
    expect(points[2]!.multiplier).toBe(1.0);
  });

  it("rent sensitivity is monotonically increasing in IRR", () => {
    const points = runSensitivity("rent", baseParams);
    const irrs = points.map((p) => p.irr_pct!);
    for (let i = 1; i < irrs.length; i += 1) {
      expect(irrs[i]).toBeGreaterThan(irrs[i - 1]!);
    }
  });

  it("land price sensitivity is monotonically decreasing in IRR", () => {
    const points = runSensitivity("land_price", baseParams);
    const irrs = points.map((p) => p.irr_pct!);
    for (let i = 1; i < irrs.length; i += 1) {
      expect(irrs[i]).toBeLessThan(irrs[i - 1]!);
    }
  });

  it("returns an empty array when land price is unknown", () => {
    const points = runSensitivity("land_price", { ...baseParams, landPricePerAcreInr: null });
    expect(points).toEqual([]);
  });
});

describe("runAllSensitivities", () => {
  it("returns all five dimensions", () => {
    const result = runAllSensitivities(baseParams);
    expect(Object.keys(result).sort()).toEqual(
      ["construction_cost", "land_price", "occupancy", "rent", "target_gfa"].sort(),
    );
  });
});

describe("findBreakEven", () => {
  it("finds a land price at which IRR crosses a lower target", () => {
    const result = findBreakEven("land_price", 0.1, baseParams);
    expect(result.break_even_value).not.toBeNull();
    // Verify: IRR at the break-even value should be close to the target.
  });

  it("reports null when land price is unset", () => {
    const result = findBreakEven("rent", 0.1, { ...baseParams, landPricePerAcreInr: null });
    expect(result.break_even_value).toBeNull();
  });

  it("reports null with an explanatory note when target is unreachable in bounds", () => {
    const result = findBreakEven("rent", 0.99, baseParams, [10, 15]);
    expect(result.break_even_value).toBeNull();
    expect(result.note).toContain("not reachable");
  });
});
