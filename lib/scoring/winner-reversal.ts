/**
 * Winner reversal detection (blueprint §15) — compares a baseline ranking of
 * scored sites against a scenario (post weight/assumption change) ranking
 * and reports whether the leader changed, with a deterministic per-site
 * score-delta explanation. Built on data the Simulation tab already computes
 * (lib/scoring/engine.ts scoreSite() run twice); no new scoring logic here.
 */

import type { SiteAnalysis, SiteScore } from "@/types/domain";

export interface WinnerReversalSiteDelta {
  site_id: string;
  site_name: string;
  baseline_score: number;
  scenario_score: number;
  delta: number;
}

export interface WinnerReversalResult {
  changed: boolean;
  baseline_winner_id: string | null;
  baseline_winner_name: string | null;
  scenario_winner_id: string | null;
  scenario_winner_name: string | null;
  deltas: WinnerReversalSiteDelta[];
}

function leaderOf(analyses: readonly SiteAnalysis[]): SiteAnalysis | null {
  const scored = analyses.filter((a): a is SiteAnalysis & { score: SiteScore } => a.score !== null);
  if (scored.length === 0) return null;
  return [...scored].sort((a, b) => b.score.total - a.score.total)[0]!;
}

/**
 * `baseline` and `scenario` must cover the same set of sites (same site_id
 * per entry, one from each set) — typically the current vs. simulated
 * SiteAnalysis map already held by the Simulation tab.
 */
export function detectWinnerReversal(
  baseline: readonly SiteAnalysis[],
  scenario: readonly SiteAnalysis[],
): WinnerReversalResult {
  const baselineLeader = leaderOf(baseline);
  const scenarioLeader = leaderOf(scenario);

  const scenarioByIdx = new Map(scenario.map((a) => [a.site.id, a]));
  const deltas: WinnerReversalSiteDelta[] = baseline
    .filter((a) => a.score !== null)
    .map((a) => {
      const scenarioEntry = scenarioByIdx.get(a.site.id);
      const baselineScore = a.score!.total;
      const scenarioScore = scenarioEntry?.score?.total ?? baselineScore;
      return {
        site_id: a.site.id,
        site_name: a.site.name,
        baseline_score: baselineScore,
        scenario_score: scenarioScore,
        delta: scenarioScore - baselineScore,
      };
    });

  return {
    changed: (baselineLeader?.site.id ?? null) !== (scenarioLeader?.site.id ?? null),
    baseline_winner_id: baselineLeader?.site.id ?? null,
    baseline_winner_name: baselineLeader?.site.name ?? null,
    scenario_winner_id: scenarioLeader?.site.id ?? null,
    scenario_winner_name: scenarioLeader?.site.name ?? null,
    deltas: deltas.sort((a, b) => b.delta - a.delta),
  };
}
