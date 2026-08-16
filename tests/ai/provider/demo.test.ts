import { describe, expect, it } from "vitest";
import { DemoAIProvider } from "@/lib/ai/provider/demo";
import { structuredAnalystResponseSchema } from "@/lib/ai/provider/schema";
import type { AnalystContext } from "@/lib/ai/context";

function context(overrides: Partial<AnalystContext> = {}): AnalystContext {
  return {
    project_name: "Test Mandate",
    asset_class: "grade_a_logistics",
    target_gfa_sqft: 500000,
    weight_profile_name: "Vantrock Default",
    selected_site_id: "site-a",
    sites: [
      {
        site_id: "site-a",
        site_name: "Candidate Site A",
        score_total: 0.72,
        coverage: 0.9,
        confidence: 0.7,
        category_breakdown: [{ category: "accessibility", label: "Accessibility", performance: 0.8 }],
        top_contributors: [
          { label: "Nearest highway", contribution_pts: 6.2, value_text: "1,200 m" },
        ],
        warnings: [{ severity: "high", message: "Outside OSM coverage for route distance." }],
        financial_base: {
          noi_inr: 1_000_000,
          gdv_inr: 2_000_000,
          tdc_inr: 1_500_000,
          yield_on_cost_pct: 0.08,
          rlv_inr: 500_000,
          irr_pct: 0.15,
          equity_multiple: 1.9,
          land_price_known: true,
        },
        evidence: [{ evidence_id: "osm-roads-v1", name: "OpenStreetMap roads", classification: "PRELOADED" }],
      },
    ],
    ...overrides,
  };
}

describe("DemoAIProvider", () => {
  it("returns a schema-valid structured response for underwrite mode", async () => {
    const provider = new DemoAIProvider();
    const result = await provider.answer({ mode: "underwrite", question: "Why pursue?", context: context() });
    expect(() => structuredAnalystResponseSchema.parse(result)).not.toThrow();
    expect(result.recommendation).toBe("PURSUE");
    expect(result.evidence_ids).toContain("osm-roads-v1");
    expect(result.financial_drivers.some((d) => d.includes("IRR"))).toBe(true);
  });

  it("recommends REJECT for a low-scoring site", async () => {
    const provider = new DemoAIProvider();
    const lowScore = context({
      sites: [{ ...context().sites[0]!, score_total: 0.3 }],
    });
    const result = await provider.answer({ mode: "underwrite", question: "Why?", context: lowScore });
    expect(result.recommendation).toBe("REJECT");
  });

  it("flags missing land price instead of inventing a financial figure", async () => {
    const provider = new DemoAIProvider();
    const noLandPrice = context({
      sites: [
        {
          ...context().sites[0]!,
          financial_base: { ...context().sites[0]!.financial_base!, land_price_known: false },
        },
      ],
    });
    const result = await provider.answer({ mode: "underwrite", question: "Financials?", context: noLandPrice });
    expect(result.financial_drivers.some((d) => d.toLowerCase().includes("land price"))).toBe(true);
  });

  it("never returns external_sources (no real research capability)", async () => {
    const provider = new DemoAIProvider();
    const result = await provider.answer({ mode: "research", question: "Any new infra?", context: context() });
    expect(result.external_sources).toEqual([]);
    expect(result.uncertainties.some((u) => u.toLowerCase().includes("research mode"))).toBe(true);
  });

  it("always includes a human-review uncertainty note", async () => {
    const provider = new DemoAIProvider();
    const result = await provider.answer({ mode: "underwrite", question: "Q", context: context() });
    expect(result.uncertainties.some((u) => u.toLowerCase().includes("human review"))).toBe(true);
  });

  it("challenge mode names the weakest category as a fragile assumption", async () => {
    const provider = new DemoAIProvider();
    const result = await provider.answer({ mode: "challenge", question: "Challenge this deal.", context: context() });
    expect(() => structuredAnalystResponseSchema.parse(result)).not.toThrow();
    expect(result.summary).toContain("CHALLENGE");
    expect(result.risks.some((r) => r.toLowerCase().includes("fragile"))).toBe(true);
  });

  it("challenge mode flags missing land price as blocking a PURSUE decision", async () => {
    const provider = new DemoAIProvider();
    const noLandPrice = context({
      sites: [{ ...context().sites[0]!, financial_base: { ...context().sites[0]!.financial_base!, land_price_known: false } }],
    });
    const result = await provider.answer({ mode: "challenge", question: "Challenge this deal.", context: noLandPrice });
    expect(result.reasons.some((r) => r.toLowerCase().includes("land price"))).toBe(true);
  });

  it("memo mode produces an executive-summary-framed response", async () => {
    const provider = new DemoAIProvider();
    const result = await provider.answer({ mode: "memo", question: "Generate the memo.", context: context() });
    expect(() => structuredAnalystResponseSchema.parse(result)).not.toThrow();
    expect(result.summary).toContain("EXECUTIVE SUMMARY");
    expect(result.summary.toLowerCase()).toContain("investment thesis");
  });
});
