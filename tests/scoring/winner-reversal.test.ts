import { describe, expect, it } from "vitest";
import { detectWinnerReversal } from "@/lib/scoring/winner-reversal";
import { fakeAnalysis, fakeScore } from "../helpers/analysis-fixtures";

describe("detectWinnerReversal", () => {
  it("reports unchanged when the same site leads in both", () => {
    const a = fakeAnalysis({ site: { ...fakeAnalysis().site, id: "a", name: "Site A" }, score: fakeScore({ total: 0.8 }) });
    const b = fakeAnalysis({ site: { ...fakeAnalysis().site, id: "b", name: "Site B" }, score: fakeScore({ total: 0.6 }) });
    const result = detectWinnerReversal([a, b], [a, b]);
    expect(result.changed).toBe(false);
    expect(result.baseline_winner_id).toBe("a");
  });

  it("detects a winner change between baseline and scenario", () => {
    const a = fakeAnalysis({ site: { ...fakeAnalysis().site, id: "a", name: "Site A" }, score: fakeScore({ total: 0.8 }) });
    const b = fakeAnalysis({ site: { ...fakeAnalysis().site, id: "b", name: "Site B" }, score: fakeScore({ total: 0.6 }) });
    const bBoosted = fakeAnalysis({ site: { ...fakeAnalysis().site, id: "b", name: "Site B" }, score: fakeScore({ total: 0.9 }) });
    const result = detectWinnerReversal([a, b], [a, bBoosted]);
    expect(result.changed).toBe(true);
    expect(result.baseline_winner_id).toBe("a");
    expect(result.scenario_winner_id).toBe("b");
  });

  it("computes per-site deltas sorted descending", () => {
    const a = fakeAnalysis({ site: { ...fakeAnalysis().site, id: "a", name: "Site A" }, score: fakeScore({ total: 0.8 }) });
    const b = fakeAnalysis({ site: { ...fakeAnalysis().site, id: "b", name: "Site B" }, score: fakeScore({ total: 0.5 }) });
    const aDropped = fakeAnalysis({ site: { ...fakeAnalysis().site, id: "a", name: "Site A" }, score: fakeScore({ total: 0.4 }) });
    const bBoosted = fakeAnalysis({ site: { ...fakeAnalysis().site, id: "b", name: "Site B" }, score: fakeScore({ total: 0.7 }) });
    const result = detectWinnerReversal([a, b], [aDropped, bBoosted]);
    expect(result.deltas[0]!.site_id).toBe("b");
    expect(result.deltas[0]!.delta).toBeCloseTo(0.2);
  });
});
