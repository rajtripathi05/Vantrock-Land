/**
 * Decision thresholds engine (blueprint §11) — classifies a site PURSUE /
 * HOLD / REJECT against configurable investment criteria, and explains which
 * threshold drove the result. Deterministic, pure, no I/O.
 */

import type { SiteScore } from "@/types/domain";
import type { FinancialScenarioResult } from "@/lib/financial/types";
import type { ConstraintsResult } from "@/lib/analysis/constraints";

export interface DecisionThresholds {
  min_irr_pct: number;
  min_yield_on_cost_pct: number;
  max_land_cost_per_acre_inr: number | null;
  min_score: number;
  max_high_severity_warnings: number;
  min_coverage: number;
}

/** CURATED default thresholds for a Grade-A logistics mandate in this corridor. */
export const DEFAULT_DECISION_THRESHOLDS: DecisionThresholds = {
  min_irr_pct: 0.14,
  min_yield_on_cost_pct: 0.09,
  max_land_cost_per_acre_inr: null,
  min_score: 0.6,
  max_high_severity_warnings: 1,
  min_coverage: 0.5,
};

export type DecisionClassification = "PURSUE" | "HOLD" | "REJECT";

export interface DecisionReason {
  criterion: string;
  passed: boolean;
  value: string;
  threshold: string;
}

export interface DecisionResult {
  classification: DecisionClassification;
  reasons: DecisionReason[];
  failing_criteria: string[];
}

export function classifyDecision(
  score: SiteScore | null,
  baseFinancials: FinancialScenarioResult | null,
  constraints: ConstraintsResult,
  highSeverityWarningCount: number,
  thresholds: DecisionThresholds = DEFAULT_DECISION_THRESHOLDS,
): DecisionResult {
  const reasons: DecisionReason[] = [];

  if (constraints.excluded) {
    return {
      classification: "REJECT",
      reasons: constraints.exclusion_reasons.map((r) => ({
        criterion: "Exclusion constraint",
        passed: false,
        value: r,
        threshold: "No exclusion constraint may fail",
      })),
      failing_criteria: constraints.exclusion_reasons,
    };
  }

  reasons.push({
    criterion: "Overall score",
    passed: (score?.total ?? 0) >= thresholds.min_score,
    value: score ? `${Math.round(score.total * 100)}%` : "not computed",
    threshold: `≥ ${Math.round(thresholds.min_score * 100)}%`,
  });

  reasons.push({
    criterion: "Data coverage",
    passed: (score?.coverage ?? 0) >= thresholds.min_coverage,
    value: score ? `${Math.round(score.coverage * 100)}%` : "not computed",
    threshold: `≥ ${Math.round(thresholds.min_coverage * 100)}%`,
  });

  reasons.push({
    criterion: "High-severity warnings",
    passed: highSeverityWarningCount <= thresholds.max_high_severity_warnings,
    value: `${highSeverityWarningCount}`,
    threshold: `≤ ${thresholds.max_high_severity_warnings}`,
  });

  const irr = baseFinancials?.outputs.irr_pct ?? null;
  reasons.push({
    criterion: "Base-case IRR",
    passed: irr !== null && irr >= thresholds.min_irr_pct,
    value: irr !== null ? `${(irr * 100).toFixed(1)}%` : "unknown (no land price entered)",
    threshold: `≥ ${(thresholds.min_irr_pct * 100).toFixed(0)}%`,
  });

  const yoc = baseFinancials?.outputs.yield_on_cost_pct ?? null;
  reasons.push({
    criterion: "Base-case yield-on-cost",
    passed: yoc !== null && yoc >= thresholds.min_yield_on_cost_pct,
    value: yoc !== null ? `${(yoc * 100).toFixed(1)}%` : "unknown (no land price entered)",
    threshold: `≥ ${(thresholds.min_yield_on_cost_pct * 100).toFixed(0)}%`,
  });

  if (thresholds.max_land_cost_per_acre_inr !== null) {
    const landPrice = baseFinancials?.inputs.land_price_per_acre_inr.value ?? null;
    reasons.push({
      criterion: "Land cost per acre",
      passed: landPrice !== null && landPrice <= thresholds.max_land_cost_per_acre_inr,
      value: landPrice !== null ? `₹${landPrice.toLocaleString("en-IN")}/acre` : "unknown",
      threshold: `≤ ₹${thresholds.max_land_cost_per_acre_inr.toLocaleString("en-IN")}/acre`,
    });
  }

  const failing = reasons.filter((r) => !r.passed);
  const financialUnknown = irr === null;

  let classification: DecisionClassification;
  if (failing.length === 0) {
    classification = "PURSUE";
  } else if (financialUnknown && failing.every((r) => r.criterion.includes("IRR") || r.criterion.includes("yield"))) {
    // Only the financial gates fail, and only because land price is unset — an
    // honest HOLD (need more input), not a REJECT on a site that might pencil fine.
    classification = "HOLD";
  } else if (failing.length <= 1) {
    classification = "HOLD";
  } else {
    classification = "REJECT";
  }

  return {
    classification,
    reasons,
    failing_criteria: failing.map((r) => r.criterion),
  };
}
