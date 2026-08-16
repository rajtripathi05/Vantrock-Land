/**
 * Analyst-assistant explanation templates (blueprint Phase 11).
 *
 * "DEMO / LOCAL ANALYST" — every function here builds its answer by reading
 * fields off the SiteAnalysis/SiteScore/FinancialScenarioResult objects
 * produced by the deterministic engines (lib/analysis, lib/scoring,
 * lib/financial) and formatting them into sentences. Nothing here calls a
 * language model, nothing here invents a number. When a real model provider
 * is configured later, it can be given these same tool outputs as context —
 * the contract does not change, only who writes the sentences.
 *
 * PURE MODULE (aside from Intl.NumberFormat, which is a formatter, not I/O):
 * every function is a total function of its arguments.
 */

import type { Metric, MetricCategory, SiteAnalysis, SiteScore } from "@/types/domain";
import type { WeightProfile } from "@/lib/scoring/weights";
import { reweightCategory } from "@/lib/scoring/reweight";
import { scoreSite } from "@/lib/scoring/engine";
import { categoryPerformance } from "@/lib/scoring/rollup";
import { formatMetricValue } from "@/lib/analysis/format";

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  geography: "Site quality",
  accessibility: "Accessibility",
  infrastructure: "Infrastructure",
  market: "Market context",
  labour: "Labour",
  climate: "Climate",
  hazard: "Hazard",
  infrastructure_future: "Future infrastructure (pipeline, informational)",
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function topContributors(score: SiteScore, metrics: readonly Metric[], count = 3) {
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  return [...score.breakdown]
    .filter((entry) => entry.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, count)
    .map((entry) => ({ entry, metric: byKey.get(entry.metric_key) }));
}

/** "Why is Site A better than Site B?" / "Why does Site X currently rank first?" */
export function explainRanking(analyses: readonly SiteAnalysis[]): string {
  const scored = analyses.filter((a): a is SiteAnalysis & { score: SiteScore } => a.score !== null);
  if (scored.length === 0) return "No site in this comparison has a computed score yet.";

  const ranked = [...scored].sort((a, b) => b.score.total - a.score.total);
  const leader = ranked[0]!;
  const lines = [
    `${leader.site.name} currently ranks first with a score of ${pct(leader.score.total)} (coverage ${pct(leader.score.coverage)}, confidence ${pct(leader.score.confidence)}).`,
  ];

  const drivers = topContributors(leader.score, leader.metrics);
  if (drivers.length > 0) {
    lines.push(
      "Its strongest contributions come from: " +
        drivers
          .map(
            ({ entry, metric }) =>
              `${metric?.label ?? entry.metric_key} (+${(entry.contribution * 100).toFixed(1)} pts, ${metric ? formatMetricValue(metric) : ""})`,
          )
          .join("; ") +
        ".",
    );
  }

  if (ranked.length > 1) {
    const runnerUp = ranked[1]!;
    const gap = leader.score.total - runnerUp.score.total;
    lines.push(
      `${runnerUp.site.name} follows at ${pct(runnerUp.score.total)}, a gap of ${(gap * 100).toFixed(1)} points.`,
    );
  }

  return lines.join(" ");
}

const COMPARISON_CATEGORIES: MetricCategory[] = [
  "geography",
  "accessibility",
  "infrastructure",
  "market",
  "labour",
  "climate",
  "hazard",
];

/** A category delta large enough to call out as a strength/weakness rather than noise. */
const CATEGORY_MARGIN = 0.05;

export interface WhyNotResult {
  site_name: string;
  leader_name: string;
  score_gap_pts: number;
  strengths: string[];
  weaknesses: string[];
}

/**
 * "Why not this site?" (blueprint Phase 9) — deterministic category-by-
 * category and risk comparison against the current leader. Every bullet
 * traces to a `categoryPerformance()` delta or a warning-count delta; never
 * an invented judgement. Financial-outcome comparison (IRR/equity multiple)
 * is intentionally NOT included here — those come from an async
 * FinancialScenarioResult fetch, out of scope for a pure function over
 * already-computed SiteAnalysis objects. The Compare tab appends its own
 * financial-outcome bullet after fetching that separately.
 */
export function explainWhyNot(analyses: readonly SiteAnalysis[], siteId: string): WhyNotResult | null {
  const scored = analyses.filter((a): a is SiteAnalysis & { score: SiteScore } => a.score !== null);
  if (scored.length < 2) return null;

  const ranked = [...scored].sort((a, b) => b.score.total - a.score.total);
  const leader = ranked[0]!;
  const target = scored.find((a) => a.site.id === siteId);
  if (!target || target.site.id === leader.site.id) return null;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const category of COMPARISON_CATEGORIES) {
    const targetScore = categoryPerformance(target, category);
    const leaderScore = categoryPerformance(leader, category);
    if (targetScore === null || leaderScore === null) continue;
    const delta = targetScore - leaderScore;
    const label = CATEGORY_LABELS[category].toLowerCase();
    if (delta > CATEGORY_MARGIN) {
      strengths.push(`Better ${label} (${pct(targetScore)} vs ${pct(leaderScore)})`);
    } else if (delta < -CATEGORY_MARGIN) {
      weaknesses.push(`Weaker ${label} (${pct(targetScore)} vs ${pct(leaderScore)})`);
    }
  }

  const targetHighRisk = target.warnings.filter((w) => w.severity === "high").length;
  const leaderHighRisk = leader.warnings.filter((w) => w.severity === "high").length;
  if (targetHighRisk > leaderHighRisk) {
    weaknesses.push(
      `Higher risk (${targetHighRisk} high-severity warning${targetHighRisk === 1 ? "" : "s"} vs ${leaderHighRisk})`,
    );
  } else if (targetHighRisk < leaderHighRisk) {
    strengths.push(
      `Lower risk (${targetHighRisk} high-severity warning${targetHighRisk === 1 ? "" : "s"} vs ${leaderHighRisk})`,
    );
  }

  return {
    site_name: target.site.name,
    leader_name: leader.site.name,
    score_gap_pts: (leader.score.total - target.score.total) * 100,
    strengths,
    weaknesses,
  };
}

/** "What is the biggest risk?" */
export function explainBiggestRisk(analysis: SiteAnalysis): string {
  const highWarnings = analysis.warnings.filter((w) => w.severity === "high");
  const mediumWarnings = analysis.warnings.filter((w) => w.severity === "medium");

  if (highWarnings.length > 0) {
    return `The most significant risk for ${analysis.site.name}: ${highWarnings[0]!.message}`;
  }

  if (!analysis.score) {
    if (mediumWarnings.length > 0) {
      return `For ${analysis.site.name}: ${mediumWarnings[0]!.message}`;
    }
    return `No score has been computed for ${analysis.site.name} yet, and no high-severity warnings were raised.`;
  }

  const worst = [...analysis.score.breakdown]
    .filter((entry) => entry.status === "ok" && entry.normalized_value !== null)
    .sort((a, b) => (a.normalized_value ?? 0) - (b.normalized_value ?? 0))[0];

  if (worst) {
    const metric = analysis.metrics.find((m) => m.key === worst.metric_key);
    return `The weakest scored factor for ${analysis.site.name} is ${metric?.label ?? worst.metric_key} at ${pct(worst.normalized_value ?? 0)} of the benchmark (${metric ? formatMetricValue(metric) : "no value"}). ${metric?.calculation_note ?? ""}`;
  }

  if (mediumWarnings.length > 0) {
    return `For ${analysis.site.name}: ${mediumWarnings[0]!.message}`;
  }

  return `No specific risk stands out for ${analysis.site.name} from the available data.`;
}

/** "What assumptions drive the ranking?" */
export function explainDrivingAssumptions(analysis: SiteAnalysis): string {
  if (!analysis.score) return `No score has been computed for ${analysis.site.name} yet.`;

  const byKey = new Map(analysis.metrics.map((m) => [m.key, m]));
  const nonDataDriven = topContributors(analysis.score, analysis.metrics, 10)
    .filter(({ metric }) => metric && metric.source.classification !== "LIVE")
    .slice(0, 4);

  if (nonDataDriven.length === 0) {
    return `${analysis.site.name}'s score is driven primarily by directly-measured data with no material curated or derived assumptions in the top contributors.`;
  }

  const lines = nonDataDriven.map(({ entry, metric }) => {
    const m = metric ?? byKey.get(entry.metric_key);
    return `${m?.label ?? entry.metric_key} (${m?.source.classification}): ${m?.source.notes ?? m?.calculation_note ?? ""}`;
  });

  return `The ranking for ${analysis.site.name} leans on these non-measured assumptions: ${lines.join(" | ")}`;
}

/** "What would make Site B win?" */
export function explainWhatWouldFlip(analyses: readonly SiteAnalysis[], targetSiteId: string): string {
  const scored = analyses.filter((a): a is SiteAnalysis & { score: SiteScore } => a.score !== null);
  const target = scored.find((a) => a.site.id === targetSiteId);
  if (!target) return "That site has no computed score to compare.";

  const ranked = [...scored].sort((a, b) => b.score.total - a.score.total);
  if (ranked[0]!.site.id === targetSiteId) {
    return `${target.site.name} already ranks first among the compared sites.`;
  }

  const leader = ranked[0]!;
  const gap = leader.score.total - target.score.total;

  const byKey = new Map(target.metrics.map((m) => [m.key, m]));
  const targetBreakdown = new Map(target.score.breakdown.map((e) => [e.metric_key, e]));

  // Rank the target's metrics by how much headroom exists (1 - normalized_value)
  // weighted by their score weight — the biggest weighted shortfall is the
  // most efficient place to close the gap.
  const opportunities = [...leader.score.breakdown]
    .map((leaderEntry) => {
      const targetEntry = targetBreakdown.get(leaderEntry.metric_key);
      if (!targetEntry || targetEntry.normalized_value === null || leaderEntry.normalized_value === null) {
        return null;
      }
      const shortfall = leaderEntry.normalized_value - targetEntry.normalized_value;
      const weightedShortfall = shortfall * leaderEntry.weight;
      return { key: leaderEntry.metric_key, shortfall, weightedShortfall };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null && o.shortfall > 0)
    .sort((a, b) => b.weightedShortfall - a.weightedShortfall)
    .slice(0, 3);

  if (opportunities.length === 0) {
    return `${target.site.name} trails ${leader.site.name} by ${(gap * 100).toFixed(1)} points, but no single metric explains the gap — it is spread thinly across many factors.`;
  }

  const lines = opportunities.map((o) => {
    const metric = byKey.get(o.key);
    return `${metric?.label ?? o.key} (currently ${metric ? formatMetricValue(metric) : "n/a"}, ${(o.weightedShortfall * 100).toFixed(1)} pts behind)`;
  });

  return `${target.site.name} trails ${leader.site.name} by ${(gap * 100).toFixed(1)} points. Closing the gap most efficiently means improving: ${lines.join("; ")}.`;
}

/** "What happens if accessibility is weighted 35%?" */
export function explainWeightSensitivity(
  analysis: SiteAnalysis,
  profile: WeightProfile,
  category: MetricCategory,
  newCategoryWeightPct: number,
): string {
  const before = analysis.score;
  if (!before) return `No score has been computed for ${analysis.site.name} yet.`;

  const reweighted = reweightCategory(profile, analysis.metrics, category, newCategoryWeightPct);
  const after = scoreSite(analysis.metrics, reweighted);
  const delta = after.total - before.total;
  const direction = delta > 0 ? "rises" : delta < 0 ? "falls" : "is unchanged";

  return `Setting ${CATEGORY_LABELS[category]} to ${(newCategoryWeightPct * 100).toFixed(0)}% of total weight: ${analysis.site.name}'s score ${direction} from ${pct(before.total)} to ${pct(after.total)} (${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)} pts).`;
}
