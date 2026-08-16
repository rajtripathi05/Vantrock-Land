/**
 * Category-level score rollup — average normalized performance within one
 * MetricCategory, weighted by each metric's NOMINAL profile weight (not its
 * post-redistribution effective weight).
 *
 * Extracted from components/analysis/CompareTab.tsx (Phase 9) so the
 * Compare tab's category columns and the Analyst tab's "why not this site?"
 * explanation (lib/ai/explain.ts) read the exact same number — a rollup
 * computed two different ways in two places is exactly the kind of
 * inconsistency blueprint rule 51 exists to prevent.
 *
 * Using `entry.contribution` here would let a category with heavily-
 * redistributed weight from elsewhere read as over 100% — this rollup is
 * deliberately independent of cross-category redistribution.
 *
 * PURE MODULE: no I/O, no framework, no storage.
 */

import type { MetricCategory, SiteAnalysis } from "@/types/domain";

export function categoryPerformance(analysis: SiteAnalysis, category: MetricCategory): number | null {
  if (!analysis.score) return null;
  const keys = new Set(analysis.metrics.filter((m) => m.category === category).map((m) => m.key));
  const entries = analysis.score.breakdown.filter(
    (e) => keys.has(e.metric_key) && e.normalized_value !== null,
  );
  if (entries.length === 0) return null;
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight === 0) return null;
  return entries.reduce((sum, e) => sum + e.weight * (e.normalized_value ?? 0), 0) / totalWeight;
}
