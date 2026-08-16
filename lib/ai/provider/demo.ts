/**
 * Demo/local AI provider — no API key, no network call.
 *
 * Used whenever OpenRouter isn't configured (AI_PROVIDER unset/"demo"), or as
 * an automatic fallback when the OpenRouter call itself fails (see
 * app/api/analyst/route.ts) — "do not block the deterministic application
 * because the LLM is unavailable." Builds the exact same
 * StructuredAnalystResponse shape a real model would, entirely by templating
 * over the already-computed AnalystContext — no invented numbers, same
 * "DEMO / LOCAL ANALYST" spirit as lib/ai/explain.ts.
 */

import type { AnalystContext, AnalystSiteSummary } from "@/lib/ai/context";
import type { AIProvider, AskAnalystRequest } from "./types";
import type { StructuredAnalystResponse } from "./schema";

function pct(value: number | null): string {
  return value === null ? "unknown" : `${(value * 100).toFixed(1)}%`;
}

function inr(value: number | null): string {
  if (value === null) return "unknown";
  if (Math.abs(value) >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  return `₹${value.toLocaleString("en-IN")}`;
}

function pickTarget(context: AnalystContext): AnalystSiteSummary | null {
  const bySelected = context.sites.find((s) => s.site_id === context.selected_site_id);
  return bySelected ?? context.sites[0] ?? null;
}

function pickLeader(context: AnalystContext): AnalystSiteSummary | null {
  const scored = context.sites.filter((s) => s.score_total !== null);
  if (scored.length === 0) return null;
  return [...scored].sort((a, b) => (b.score_total ?? 0) - (a.score_total ?? 0))[0]!;
}

function recommendationFor(site: AnalystSiteSummary | null): {
  recommendation: StructuredAnalystResponse["recommendation"];
  confidence: number;
} {
  if (!site || site.score_total === null) return { recommendation: "HOLD", confidence: 0.2 };
  const coverage = site.coverage ?? 0;
  const confidence = Math.min(1, Math.max(0, (site.confidence ?? 0.5) * 0.6 + coverage * 0.4));
  if (site.score_total >= 0.65) return { recommendation: "PURSUE", confidence };
  if (site.score_total >= 0.5) return { recommendation: "HOLD", confidence };
  return { recommendation: "REJECT", confidence };
}

export class DemoAIProvider implements AIProvider {
  readonly id = "demo";

  async answer(request: AskAnalystRequest): Promise<StructuredAnalystResponse> {
    const { context, mode } = request;
    const target = pickTarget(context);
    const leader = pickLeader(context);
    const { recommendation, confidence } = recommendationFor(target);

    const summaryParts: string[] = [];
    if (target) {
      summaryParts.push(
        `${target.site_name} scores ${pct(target.score_total)} (coverage ${pct(target.coverage)}, confidence ${pct(target.confidence)}).`,
      );
      if (leader && leader.site_id !== target.site_id) {
        summaryParts.push(`${leader.site_name} currently leads the shortlist at ${pct(leader.score_total)}.`);
      } else if (leader && leader.site_id === target.site_id) {
        summaryParts.push(`${target.site_name} currently leads the shortlist.`);
      }
    } else {
      summaryParts.push("No scored site is available yet.");
    }

    const reasons = target
      ? target.top_contributors.map((c) => `${c.label}: ${c.value_text} (+${c.contribution_pts.toFixed(1)} pts)`)
      : [];

    const risks = target
      ? target.warnings.filter((w) => w.severity !== "low").map((w) => w.message)
      : [];

    const financialDrivers: string[] = [];
    if (target?.financial_base) {
      const f = target.financial_base;
      if (!f.land_price_known) {
        financialDrivers.push("Land price has not been entered for this site — land-cost-dependent outputs (TDC, yield on cost, IRR, equity multiple) are unavailable.");
      } else {
        if (f.yield_on_cost_pct !== null) financialDrivers.push(`Yield on cost: ${pct(f.yield_on_cost_pct)}`);
        if (f.irr_pct !== null) financialDrivers.push(`IRR: ${pct(f.irr_pct)}`);
        if (f.equity_multiple !== null) financialDrivers.push(`Equity multiple: ${f.equity_multiple.toFixed(2)}x`);
        if (f.rlv_inr !== null) financialDrivers.push(`Residual land value: ${inr(f.rlv_inr)}`);
      }
    }

    const assumptions = target
      ? target.category_breakdown
          .filter((c) => c.performance !== null)
          .map((c) => `${c.label} standardized performance: ${pct(c.performance)} of benchmark`)
          .slice(0, 5)
      : [];

    const uncertainties: string[] = [];
    if (target && target.coverage !== null && target.coverage < 1) {
      uncertainties.push(`Score coverage is ${pct(target.coverage)} — some metrics (labour and/or climate/hazard) are not yet backed by real data for this site.`);
    }
    uncertainties.push(
      "Title, legal status, survey, geotechnical conditions, final zoning interpretation, and market assumptions require human review before an investment decision.",
    );

    const evidenceIds = target ? target.evidence.slice(0, 10).map((e) => e.evidence_id) : [];

    if (mode === "research") {
      uncertainties.unshift(
        "Research mode requires a configured OpenRouter provider with web search — this demo/local analyst cannot perform live external research and has returned deterministic context only.",
      );
    }

    return {
      recommendation,
      confidence,
      summary: summaryParts.join(" "),
      reasons,
      risks,
      financial_drivers: financialDrivers,
      assumptions,
      uncertainties,
      evidence_ids: evidenceIds,
      external_sources: [],
    };
  }
}
