import { describe, expect, it } from "vitest";
import { normalizeLinear } from "@/lib/analysis/benchmarks";

describe("normalizeLinear", () => {
  it("normalizes a cost metric: closer to goodEdge is better", () => {
    // Distance metric: 0m -> 1, 5000m -> 0
    expect(normalizeLinear(0, 0, 5000, "cost")).toBe(1);
    expect(normalizeLinear(5000, 0, 5000, "cost")).toBe(0);
    expect(normalizeLinear(2500, 0, 5000, "cost")).toBeCloseTo(0.5);
  });

  it("normalizes a benefit metric: higher is better", () => {
    // Density metric: 0 -> 0, 20 -> 1
    expect(normalizeLinear(0, 20, 0, "benefit")).toBe(0);
    expect(normalizeLinear(20, 20, 0, "benefit")).toBe(1);
    expect(normalizeLinear(10, 20, 0, "benefit")).toBeCloseTo(0.5);
  });

  it("clamps values beyond either edge", () => {
    expect(normalizeLinear(-100, 0, 5000, "cost")).toBe(1);
    expect(normalizeLinear(10_000, 0, 5000, "cost")).toBe(0);
    expect(normalizeLinear(-5, 20, 0, "benefit")).toBe(0);
    expect(normalizeLinear(1000, 20, 0, "benefit")).toBe(1);
  });

  it("handles a degenerate band where both edges are equal", () => {
    expect(normalizeLinear(5, 5, 5, "cost")).toBe(1);
    expect(normalizeLinear(6, 5, 5, "cost")).toBe(0);
  });
});
