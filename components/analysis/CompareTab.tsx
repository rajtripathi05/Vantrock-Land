"use client";

/**
 * Compare tab — side-by-side scoring across the shortlist (up to 3 sites,
 * blueprint Phase 6). The ranking explanation is generated deterministically
 * from the same score breakdowns shown in the table — no separate,
 * potentially-inconsistent narrative.
 */

import { useEffect, useMemo, useState } from "react";
import type { Metric, MetricCategory, SiteAnalysis } from "@/types/domain";
import { formatArea, formatIndianNumber } from "@/lib/geo/units";
import { explainRanking, explainWhyNot } from "@/lib/ai/explain";
import { formatMetricValue } from "@/lib/analysis/format";
import { categoryPerformance } from "@/lib/scoring/rollup";
import { scoreSite } from "@/lib/scoring/engine";
import { detectWinnerReversal } from "@/lib/scoring/winner-reversal";
import type { WeightProfile } from "@/lib/scoring/weights";
import type { AnalysisTools } from "@/lib/ai/tools";
import type { FinancialScenarioResult } from "@/lib/financial/types";
import type { ConstraintsResult } from "@/lib/analysis/constraints";
import { StatusBadge } from "@/components/ui/Primitives";
import { WeightControls } from "./WeightControls";

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  geography: "Site quality",
  accessibility: "Accessibility",
  infrastructure: "Infrastructure",
  market: "Market",
  labour: "Labour",
  climate: "Climate",
  hazard: "Hazard",
  infrastructure_future: "Future infrastructure",
};
const CATEGORIES: MetricCategory[] = ["accessibility", "infrastructure", "market", "labour", "geography"];

/** Base-case IRR is close enough for the comparison table to stay small; the Financials tab has all three scenarios. */
function useBaseCaseFinancials(
  tools: AnalysisTools | null,
  analyses: readonly SiteAnalysis[],
): Record<string, FinancialScenarioResult | null> {
  const [financials, setFinancials] = useState<Record<string, FinancialScenarioResult | null>>({});
  const siteIds = analyses.map((a) => a.site.id).join(",");

  useEffect(() => {
    if (!tools || analyses.length === 0) {
      setFinancials({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      analyses.map(async (a) => {
        const result = await tools.getFinancials(a.site.id, "base");
        return [a.site.id, result.ok ? result.value : null] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setFinancials(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tools, siteIds]);

  return financials;
}

/** Site Screening feasibility status per site (blueprint §12), fetched once per shortlist. */
function useConstraints(
  tools: AnalysisTools | null,
  analyses: readonly SiteAnalysis[],
): Record<string, ConstraintsResult | null> {
  const [constraints, setConstraints] = useState<Record<string, ConstraintsResult | null>>({});
  const siteIds = analyses.map((a) => a.site.id).join(",");

  useEffect(() => {
    if (!tools || analyses.length === 0) {
      setConstraints({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      analyses.map(async (a) => {
        const result = await tools.getConstraints(a.site.id);
        return [a.site.id, result.ok ? result.value : null] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setConstraints(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tools, siteIds]);

  return constraints;
}

/**
 * Winner reversal (blueprint §15) — apply a hypothetical category reweight
 * across every compared site at once (reusing the same reweightCategory()/
 * scoreSite() the per-site Analysis-tab sliders use) and check whether the
 * shortlist leader changes. Deterministic; no financial-side assumptions
 * changed here (score-based leader only — see docs for scope).
 */
function WinnerReversalCheck({ analyses, baseProfile }: { analyses: SiteAnalysis[]; baseProfile: WeightProfile }) {
  const [testProfile, setTestProfile] = useState<WeightProfile | null>(null);

  const scenarioAnalyses = useMemo(() => {
    if (!testProfile) return analyses;
    return analyses.map((a) => ({ ...a, score: scoreSite(a.metrics, testProfile) }));
  }, [analyses, testProfile]);

  const result = useMemo(
    () => detectWinnerReversal(analyses, scenarioAnalyses),
    [analyses, scenarioAnalyses],
  );

  if (analyses.length < 2) return null;
  const referenceMetrics = analyses[0]!.metrics;

  return (
    <Section title="Winner reversal check">
      <div className="field-hint" style={{ marginBottom: 10 }}>
        Adjust category weights below to test whether a different mandate emphasis flips the shortlist
        leader — every compared site is rescored with the same hypothetical profile.
      </div>
      <WeightControls
        profile={testProfile ?? baseProfile}
        metrics={referenceMetrics}
        onChange={setTestProfile}
        onReset={() => setTestProfile(null)}
        isCustom={testProfile !== null}
      />
      {testProfile ? (
        <div className={result.changed ? "alert alert-warning" : "alert alert-info"} style={{ marginTop: 12 }}>
          <div className="alert-title">{result.changed ? "WINNER CHANGED" : "Winner unchanged"}</div>
          {result.changed ? (
            <>
              From <strong>{result.baseline_winner_name}</strong> to <strong>{result.scenario_winner_name}</strong>.
              <div className="stack-sm" style={{ marginTop: 6 }}>
                {result.deltas.map((d) => (
                  <div key={d.site_id} className="data-row">
                    <span className="data-key">{d.site_name}</span>
                    <span className="data-value">
                      {(d.baseline_score * 100).toFixed(1)} → {(d.scenario_score * 100).toFixed(1)} (
                      {d.delta >= 0 ? "+" : ""}
                      {(d.delta * 100).toFixed(1)} pts)
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            `${result.baseline_winner_name} still leads under this weighting.`
          )}
        </div>
      ) : null}
    </Section>
  );
}

export function CompareTab({
  analyses,
  tools,
  activeProfile,
}: {
  analyses: SiteAnalysis[];
  tools: AnalysisTools | null;
  activeProfile: WeightProfile;
}) {
  const ranked = useMemo(
    () => [...analyses].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0)),
    [analyses],
  );
  const financials = useBaseCaseFinancials(tools, analyses);
  const constraints = useConstraints(tools, analyses);

  if (analyses.length === 0) {
    return <div className="empty-state">Save at least one candidate site to compare.</div>;
  }

  const leaderId = ranked[0]?.site.id;
  const leaderFinancials = leaderId ? financials[leaderId] : undefined;
  const allMetricKeys = [...new Set(analyses.flatMap((a) => a.metrics.map((m) => m.key)))];
  const metricLabel = new Map<string, string>();
  for (const analysis of analyses) {
    for (const metric of analysis.metrics) metricLabel.set(metric.key, metric.label);
  }

  return (
    <div className="stack" style={{ maxWidth: 1100 }}>
      <h2 style={{ fontSize: 16 }}>Candidate Site Comparison</h2>

      <div className="answer-card" style={{ marginTop: 0 }}>
        {explainRanking(analyses)}
      </div>

      {ranked.length > 1 ? (
        <div className="stack-sm">
          {ranked.slice(1).map((a) => {
            const whyNot = explainWhyNot(analyses, a.site.id);
            if (!whyNot) return null;
            const targetIrr = financials[a.site.id]?.outputs.irr_pct ?? null;
            const leaderIrr = leaderFinancials?.outputs.irr_pct ?? null;
            const strengths = [...whyNot.strengths];
            const weaknesses = [...whyNot.weaknesses];
            if (targetIrr !== null && leaderIrr !== null) {
              const line = `financial outcome (IRR ${(targetIrr * 100).toFixed(1)}% vs ${(leaderIrr * 100).toFixed(1)}%)`;
              if (targetIrr > leaderIrr + 0.005) strengths.push(`Better ${line}`);
              else if (targetIrr < leaderIrr - 0.005) weaknesses.push(`Worse ${line}`);
            }
            return (
              <div key={a.site.id} className="card">
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>
                    Why not {whyNot.site_name}?
                  </span>
                  <span className="field-hint">
                    {whyNot.score_gap_pts.toFixed(1)} pts behind {whyNot.leader_name}
                  </span>
                </div>
                {strengths.length === 0 && weaknesses.length === 0 ? (
                  <div className="field-hint">
                    No single category explains the gap — it&apos;s spread thinly across many factors.
                  </div>
                ) : (
                  <div className="stack-sm">
                    {strengths.map((line) => (
                      <div key={line} style={{ color: "var(--success)", fontSize: 12 }}>
                        + {line}
                      </div>
                    ))}
                    {weaknesses.map((line) => (
                      <div key={line} style={{ color: "var(--danger)", fontSize: 12 }}>
                        − {line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      <WinnerReversalCheck analyses={analyses} baseProfile={activeProfile} />

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Metric</th>
              {ranked.map((a) => (
                <th key={a.site.id} className={a.site.id === leaderId ? "is-leader" : ""}>
                  {a.site.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 700 }}>Suitability Score</td>
              {ranked.map((a) => (
                <td key={a.site.id} className={a.site.id === leaderId ? "is-leader" : ""}>
                  {a.score ? (
                    <span className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <span className="score-bar-track">
                        <span
                          className="score-bar-fill"
                          style={{ width: `${Math.round(a.score.total * 100)}%` }}
                        />
                      </span>
                      {(a.score.total * 100).toFixed(1)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td>Coverage</td>
              {ranked.map((a) => (
                <td key={a.site.id}>{a.score ? `${(a.score.coverage * 100).toFixed(0)}%` : "—"}</td>
              ))}
            </tr>
            <tr>
              <td>Confidence</td>
              {ranked.map((a) => (
                <td key={a.site.id}>{a.score ? `${(a.score.confidence * 100).toFixed(0)}%` : "—"}</td>
              ))}
            </tr>
            {CATEGORIES.map((category) => (
              <tr key={category}>
                <td>{CATEGORY_LABELS[category]}</td>
                {ranked.map((a) => {
                  const s = categoryPerformance(a, category);
                  return <td key={a.site.id}>{s === null ? "—" : `${(s * 100).toFixed(0)}%`}</td>;
                })}
              </tr>
            ))}
            <tr>
              <td>Area</td>
              {ranked.map((a) => (
                <td key={a.site.id}>{formatArea(a.site.measurements.area_sqm, "acres")}</td>
              ))}
            </tr>
            <tr>
              <td>Land price</td>
              {ranked.map((a) => (
                <td key={a.site.id}>
                  {a.site.land_price_per_acre_inr
                    ? `₹${formatIndianNumber(a.site.land_price_per_acre_inr, 0)}/acre`
                    : "Not entered"}
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>IRR (base case)</td>
              {ranked.map((a) => {
                const irr = financials[a.site.id]?.outputs.irr_pct ?? null;
                return (
                  <td key={a.site.id} style={{ fontWeight: 700 }}>
                    {irr === null ? "—" : `${(irr * 100).toFixed(1)}%`}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td>Equity multiple (base case)</td>
              {ranked.map((a) => {
                const multiple = financials[a.site.id]?.outputs.equity_multiple ?? null;
                return <td key={a.site.id}>{multiple === null ? "—" : `${multiple.toFixed(2)}x`}</td>;
              })}
            </tr>
            <tr>
              <td>Residual land value (RLV)</td>
              {ranked.map((a) => {
                const rlv = financials[a.site.id]?.outputs.residual_land_value_inr ?? null;
                return <td key={a.site.id}>{rlv === null ? "—" : formatIndianNumber(rlv, 0)}</td>;
              })}
            </tr>
            <tr>
              <td>Risk (high-severity warnings)</td>
              {ranked.map((a) => {
                const count = a.warnings.filter((w) => w.severity === "high").length;
                return (
                  <td key={a.site.id} style={{ color: count > 0 ? "var(--danger)" : undefined }}>
                    {count}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Feasibility</td>
              {ranked.map((a) => {
                const c = constraints[a.site.id];
                const status = !c ? null : c.excluded ? "FAIL" : c.fail_count > 0 || c.warn_count > 0 ? "WARN" : "PASS";
                return <td key={a.site.id}>{status ? <StatusBadge status={status} /> : "—"}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {ranked.some((a) => financials[a.site.id]?.outputs.irr_pct == null) ? (
        <div className="field-hint">
          IRR/equity multiple show &ldquo;—&rdquo; for a site with no land price entered — see the
          Financials tab for the full downside/base/upside breakdown once one is set.
        </div>
      ) : null}

      <Section title="Metric-level detail">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                {ranked.map((a) => (
                  <th key={a.site.id}>{a.site.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allMetricKeys.map((key) => (
                <tr key={key}>
                  <td>{metricLabel.get(key)}</td>
                  {ranked.map((a) => {
                    const metric: Metric | undefined = a.metrics.find((m) => m.key === key);
                    if (!metric) return <td key={a.site.id}>—</td>;
                    return (
                      <td
                        key={a.site.id}
                        className={metric.status === "missing" ? "metric-row-status-missing" : ""}
                        title={`${metric.source.classification} · ${metric.calculation_note}`}
                      >
                        {metric.status === "ok" ? formatMetricValue(metric) : "Missing"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="field-hint" style={{ marginTop: 8 }}>
          Hover a value to see its source classification and calculation note.
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="section" style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
      <div className="section-header">
        <span className="section-title">{title}</span>
      </div>
      {children}
    </div>
  );
}
