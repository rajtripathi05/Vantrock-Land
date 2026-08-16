/**
 * Compact analyst context (blueprint Phase 22: cost control).
 *
 * The AI layer never receives the full database, raw OSM datasets, or
 * complete GeoJSON — only a small, already-computed summary of what's on
 * screen: score/coverage/confidence, top scoring contributors, warnings,
 * base-case financial outputs, and evidence citations. This is built
 * client-side from data the deterministic engines already produced (the same
 * AnalysisTools outputs the Analysis/Compare/Financials tabs render), capped
 * at up to 3 sites — matching this MVP's 3-candidate benchmark scenario.
 */

import { z } from "zod";
import type { MetricCategory, Project, SiteAnalysis } from "@/types/domain";
import type { FinancialScenarioResult } from "@/lib/financial/types";
import { categoryPerformance } from "@/lib/scoring/rollup";
import { topContributors } from "@/lib/ai/explain";
import { collectEvidence } from "@/lib/evidence/collect";
import { formatMetricValue } from "@/lib/analysis/format";

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  geography: "Site quality",
  accessibility: "Accessibility",
  infrastructure: "Infrastructure",
  market: "Market context",
  labour: "Labour",
  climate: "Climate",
  hazard: "Hazard",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as MetricCategory[];

export const analystSiteSummarySchema = z
  .object({
    site_id: z.string(),
    site_name: z.string().max(200),
    score_total: z.number().nullable(),
    coverage: z.number().nullable(),
    confidence: z.number().nullable(),
    category_breakdown: z
      .array(
        z.object({
          category: z.string(),
          label: z.string(),
          performance: z.number().nullable(),
        }),
      )
      .max(10),
    top_contributors: z
      .array(
        z.object({
          label: z.string(),
          contribution_pts: z.number(),
          value_text: z.string(),
        }),
      )
      .max(6),
    warnings: z
      .array(z.object({ severity: z.enum(["low", "medium", "high"]), message: z.string().max(400) }))
      .max(8),
    financial_base: z
      .object({
        noi_inr: z.number().nullable(),
        gdv_inr: z.number().nullable(),
        tdc_inr: z.number().nullable(),
        yield_on_cost_pct: z.number().nullable(),
        rlv_inr: z.number().nullable(),
        irr_pct: z.number().nullable(),
        equity_multiple: z.number().nullable(),
        land_price_known: z.boolean(),
      })
      .nullable(),
    evidence: z
      .array(z.object({ evidence_id: z.string(), name: z.string().max(200), classification: z.string() }))
      .max(20),
  })
  .strict();

export const analystContextSchema = z
  .object({
    project_name: z.string().max(200),
    asset_class: z.string(),
    target_gfa_sqft: z.number(),
    weight_profile_name: z.string(),
    selected_site_id: z.string().nullable(),
    sites: z.array(analystSiteSummarySchema).min(1).max(3),
  })
  .strict();

export type AnalystContext = z.infer<typeof analystContextSchema>;
export type AnalystSiteSummary = z.infer<typeof analystSiteSummarySchema>;

/** Builds one site's compact summary. Pure function of already-computed data. */
export function buildSiteSummary(
  analysis: SiteAnalysis,
  financialBase: FinancialScenarioResult | null,
): AnalystSiteSummary {
  const score = analysis.score;

  const categoryBreakdown = CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    performance: categoryPerformance(analysis, category),
  })).filter((entry) => entry.performance !== null);

  const contributors = score
    ? topContributors(score, analysis.metrics, 6).map(({ entry, metric }) => ({
        label: metric?.label ?? entry.metric_key,
        contribution_pts: Math.round(entry.contribution * 1000) / 10,
        value_text: metric ? formatMetricValue(metric) : "",
      }))
    : [];

  const warnings = analysis.warnings
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 8)
    .map((w) => ({ severity: w.severity, message: w.message }));

  const financial = financialBase
    ? {
        noi_inr: financialBase.outputs.noi_inr_annual,
        gdv_inr: financialBase.outputs.gdv_inr,
        tdc_inr: financialBase.outputs.total_development_cost_inr,
        yield_on_cost_pct: financialBase.outputs.yield_on_cost_pct,
        rlv_inr: financialBase.outputs.residual_land_value_inr,
        irr_pct: financialBase.outputs.irr_pct,
        equity_multiple: financialBase.outputs.equity_multiple,
        land_price_known: financialBase.inputs.land_price_per_acre_inr.value !== null,
      }
    : null;

  const evidence = collectEvidence(analysis)
    .slice(0, 20)
    .map((source) => ({
      evidence_id: source.source_id,
      name: source.name,
      classification: source.classification,
    }));

  return {
    site_id: analysis.site.id,
    site_name: analysis.site.name,
    score_total: score?.total ?? null,
    coverage: score?.coverage ?? null,
    confidence: score?.confidence ?? null,
    category_breakdown: categoryBreakdown,
    top_contributors: contributors,
    warnings,
    financial_base: financial,
    evidence,
  };
}

function severityRank(severity: "low" | "medium" | "high"): number {
  return severity === "high" ? 2 : severity === "medium" ? 1 : 0;
}

/** Builds the full compact context for up to 3 sites. */
export function buildAnalystContext(
  project: Project,
  analyses: readonly SiteAnalysis[],
  financials: ReadonlyMap<string, FinancialScenarioResult | null>,
  weightProfileName: string,
  selectedSiteId: string | null,
): AnalystContext {
  return {
    project_name: project.name,
    asset_class: project.asset_class,
    target_gfa_sqft: project.target_gfa_sqft,
    weight_profile_name: weightProfileName,
    selected_site_id: selectedSiteId,
    sites: analyses.slice(0, 3).map((analysis) => buildSiteSummary(analysis, financials.get(analysis.site.id) ?? null)),
  };
}
