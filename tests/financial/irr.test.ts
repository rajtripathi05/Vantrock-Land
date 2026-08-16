import { describe, expect, it } from "vitest";
import { irr } from "@/lib/financial/irr";

describe("irr", () => {
  it("solves a simple one-period investment", () => {
    expect(irr([-100, 110])).toBeCloseTo(0.1, 4);
  });

  it("solves a two-period compounding investment", () => {
    expect(irr([-100, 0, 121])).toBeCloseTo(0.1, 3);
  });

  it("solves a multi-year development-style cash flow", () => {
    // -1000 invested, small annual income, large exit payoff.
    const cashFlows = [-1000, 60, 60, 60, 60, 1400];
    const rate = irr(cashFlows);
    expect(rate).not.toBeNull();
    // Sanity: NPV at the solved rate should be ~0.
    const npv = cashFlows.reduce((sum, cf, t) => sum + cf / (1 + rate!) ** t, 0);
    expect(Math.abs(npv)).toBeLessThan(0.01);
  });

  it("returns null when all cash flows are positive", () => {
    expect(irr([100, 50, 50])).toBeNull();
  });

  it("returns null when all cash flows are negative", () => {
    expect(irr([-100, -50, -50])).toBeNull();
  });

  it("returns null for a series with fewer than two cash flows", () => {
    expect(irr([-100])).toBeNull();
    expect(irr([])).toBeNull();
  });

  it("handles a negative IRR (capital loss)", () => {
    const rate = irr([-100, 80]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeLessThan(0);
  });
});
