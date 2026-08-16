/**
 * Scoring engine — deterministic, explainable weighted score.
 *
 * TOTAL SCORE = SUM(effective_weight_i × normalized_value_i), where
 * effective_weight redistributes the weight of excluded (missing /
 * low-confidence / conflicted) metrics proportionally across the metrics that
 * DO have data, so a site is not punished twice for the same missing metric
 * (once by exclusion, once by a score that can never reach 1.0). `coverage`
 * — the fraction of total weight actually backed by data — is reported
 * alongside the score precisely so a high score built on thin coverage does
 * not read the same as one built on complete data.
 *
 * No LLM, no randomness, no I/O. Same metrics + same weight profile always
 * produce the same SiteScore.
 */

import type { Metric, ScoreBreakdownEntry, SiteScore } from "@/types/domain";
import type { WeightProfile } from "./weights";
import { totalWeight } from "./weights";

const EXCLUDED_STATUSES = new Set(["missing", "low_confidence", "conflicted"]);

export function scoreSite(metrics: readonly Metric[], profile: WeightProfile): SiteScore {
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const profileTotal = totalWeight(profile);

  const included: Array<{ metric: Metric; weight: number }> = [];
  const excluded: SiteScore["excluded_metrics"] = [];

  for (const [key, weight] of Object.entries(profile.weights)) {
    const metric = byKey.get(key);
    if (!metric) {
      excluded.push({ metric_key: key, reason: "missing", weight_redistributed: weight });
      continue;
    }
    if (EXCLUDED_STATUSES.has(metric.status) || metric.normalized_value === null) {
      excluded.push({
        metric_key: key,
        reason: metric.status === "ok" ? "missing" : metric.status,
        weight_redistributed: weight,
      });
      continue;
    }
    included.push({ metric, weight });
  }

  const availableWeight = included.reduce((sum, entry) => sum + entry.weight, 0);
  const coverage = profileTotal > 0 ? availableWeight / profileTotal : 0;

  // Redistribute excluded weight proportionally across included metrics, so
  // the score is comparable across sites with different missing-data
  // patterns. `coverage` is what tells the analyst how much of that score is
  // backed by real data.
  const redistributionFactor = availableWeight > 0 ? profileTotal / availableWeight : 0;

  const breakdown: ScoreBreakdownEntry[] = [];
  let total = 0;
  let confidenceWeightedSum = 0;

  for (const { metric, weight } of included) {
    const effectiveWeight = weight * redistributionFactor;
    const contribution = effectiveWeight * (metric.normalized_value ?? 0);
    total += contribution;
    confidenceWeightedSum += effectiveWeight * metric.confidence;
    breakdown.push({
      metric_key: metric.key,
      weight,
      normalized_value: metric.normalized_value,
      contribution,
      status: metric.status,
    });
  }

  for (const entry of excluded) {
    const metric = byKey.get(entry.metric_key);
    breakdown.push({
      metric_key: entry.metric_key,
      weight: profile.weights[entry.metric_key] ?? 0,
      normalized_value: metric?.normalized_value ?? null,
      contribution: 0,
      status: metric?.status ?? "missing",
    });
  }

  return {
    total: Math.max(0, Math.min(1, total)),
    score_config_id: profile.id,
    config_name: profile.name,
    coverage,
    confidence: availableWeight > 0 ? confidenceWeightedSum / profileTotal : 0,
    breakdown,
    excluded_metrics: excluded,
  };
}
