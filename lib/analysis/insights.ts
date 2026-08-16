/**
 * Site Quick Insights (LandTech-inspired, blueprint §2) — a short list of
 * deterministic, evidence-linked bullets generated from data already
 * computed elsewhere (score, constraints, feasibility, financials). No
 * hallucinated AI statements: every insight names the metric/check it comes
 * from via `metric_key` or `constraint_id` so the UI can link back to it.
 */

import type { SiteAnalysis } from "@/types/domain";
import type { ConstraintsResult } from "./constraints";
import type { DevelopmentFeasibilityResult } from "@/lib/feasibility/types";
import type { FinancialScenarioResult } from "@/lib/financial/types";

export type InsightPolarity = "positive" | "negative" | "neutral";

export interface QuickInsight {
  code: string;
  polarity: InsightPolarity;
  message: string;
  /** metric key or constraint id this insight is derived from, for traceability. */
  ref: string;
}

function metric(analysis: SiteAnalysis, key: string) {
  return analysis.metrics.find((m) => m.key === key) ?? null;
}

export function generateQuickInsights(
  analysis: SiteAnalysis,
  constraints: ConstraintsResult,
  feasibility: DevelopmentFeasibilityResult,
  baseFinancials: FinancialScenarioResult | null,
): QuickInsight[] {
  const insights: QuickInsight[] = [];

  // Access
  const highway = metric(analysis, "access.nearest_highway_distance");
  if (highway && highway.status === "ok" && highway.raw_value !== null) {
    if (highway.raw_value <= 2000) {
      insights.push({
        code: "STRONG_HIGHWAY_ACCESS",
        polarity: "positive",
        message: `Strong highway access — ${Math.round(highway.raw_value)} m straight-line to the nearest mapped highway.`,
        ref: "access.nearest_highway_distance",
      });
    } else if (highway.raw_value > 10_000) {
      insights.push({
        code: "WEAK_HIGHWAY_ACCESS",
        polarity: "negative",
        message: `Weak highway access — ${(highway.raw_value / 1000).toFixed(1)} km straight-line to the nearest mapped highway.`,
        ref: "access.nearest_highway_distance",
      });
    }
  }

  // Industrial context
  const industrialDensity = metric(analysis, "market.industrial_density_proxy");
  if (industrialDensity && industrialDensity.status === "ok" && (industrialDensity.normalized_value ?? 0) >= 0.7) {
    insights.push({
      code: "STRONG_INDUSTRIAL_CONTEXT",
      polarity: "positive",
      message: "Strong existing industrial context — high density of industrial/logistics POIs nearby.",
      ref: "market.industrial_density_proxy",
    });
  }

  // Hazard
  const floodCheck = constraints.checks.find((c) => c.id === "flood_exposure");
  if (floodCheck && (floodCheck.status === "FAIL" || floodCheck.status === "WARN")) {
    insights.push({
      code: "FLOOD_EXPOSURE",
      polarity: "negative",
      message: `Elevated flood exposure proxy (${floodCheck.value}) — ${floodCheck.status === "FAIL" ? "material hazard flag" : "worth reviewing"}.`,
      ref: "flood_exposure",
    });
  }

  // Data coverage
  const coverage = analysis.score?.coverage ?? analysis.run.coverage;
  if (coverage < 0.5) {
    insights.push({
      code: "LOW_DATA_COVERAGE",
      polarity: "negative",
      message: `Low data coverage (${Math.round(coverage * 100)}%) — a material share of the score rests on missing or low-confidence metrics.`,
      ref: "data_coverage",
    });
  }

  // Financial case
  if (baseFinancials?.outputs.irr_pct !== null && baseFinancials?.outputs.irr_pct !== undefined) {
    if (baseFinancials.outputs.irr_pct >= 0.16) {
      insights.push({
        code: "STRONG_FINANCIAL_CASE",
        polarity: "positive",
        message: `Strong financial case — base-case IRR of ${(baseFinancials.outputs.irr_pct * 100).toFixed(1)}%.`,
        ref: "irr_viability",
      });
    } else if (baseFinancials.outputs.irr_pct < 0.08) {
      insights.push({
        code: "WEAK_FINANCIAL_CASE",
        polarity: "negative",
        message: `Weak financial case — base-case IRR of only ${(baseFinancials.outputs.irr_pct * 100).toFixed(1)}%.`,
        ref: "irr_viability",
      });
    }
  }

  // Land cost per GFA
  if (baseFinancials?.inputs.land_price_per_acre_inr.value) {
    const landCostShare =
      baseFinancials.outputs.land_cost_inr && baseFinancials.outputs.total_development_cost_inr
        ? baseFinancials.outputs.land_cost_inr / baseFinancials.outputs.total_development_cost_inr
        : null;
    if (landCostShare !== null && landCostShare > 0.4) {
      insights.push({
        code: "HIGH_LAND_COST",
        polarity: "negative",
        message: `High land cost — land is ${Math.round(landCostShare * 100)}% of total development cost, above the typical ~25-35% range for this asset class.`,
        ref: "land_price_known",
      });
    }
  }

  // Feasibility
  if (!feasibility.meets_target) {
    insights.push({
      code: "FEASIBILITY_SHORTFALL",
      polarity: "negative",
      message: `Indicative buildable GFA falls short of the target by ${Math.abs(feasibility.target_delta_sqft).toLocaleString("en-IN")} sq ft (${Math.round(Math.abs(feasibility.target_delta_pct) * 100)}%).`,
      ref: "development_feasibility",
    });
  }

  // Future infrastructure
  const futureInfra = analysis.metrics.find((m) => m.category === "infrastructure_future" && m.status === "ok");
  if (futureInfra && (futureInfra.normalized_value ?? 0) >= 0.6) {
    insights.push({
      code: "FUTURE_INFRASTRUCTURE_UPSIDE",
      polarity: "positive",
      message: `Future infrastructure upside — ${futureInfra.label.toLowerCase()} in the pipeline near this site.`,
      ref: futureInfra.key,
    });
  }

  return insights;
}
