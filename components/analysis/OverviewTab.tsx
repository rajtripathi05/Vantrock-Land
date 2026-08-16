"use client";

/**
 * Overview — the executive dashboard. First screen the analyst sees after
 * running analysis: one recommendation, why, what to watch, data quality,
 * next action. Every number here is read from engines that already exist
 * elsewhere (scoring, decision, constraints, insights, financials) — this
 * tab computes nothing new, it just puts the answer first.
 */

import { useMemo } from "react";
import type { Project, Site, SiteAnalysis } from "@/types/domain";
import type { AnalysisTools } from "@/lib/ai/tools";
import { classifyDecision, type DecisionResult } from "@/lib/scoring/decision";
import { formatIndianNumber } from "@/lib/geo/units";
import { DecisionBadge, DataQualityBadge, Section, dataQualityLevel } from "@/components/ui/Primitives";
import { useBaseCaseFinancials, useConstraints } from "./useShortlistBundles";
import { useFeasibilityBundle } from "./useFeasibilityBundle";

function nextActions(site: Site, decision: DecisionResult | null, coverage: number): string[] {
  const actions: string[] = [];
  if (!site.land_price_per_acre_inr) {
    actions.push("Enter a land price for this site to compute IRR and equity multiple.");
  }
  actions.push("Verify zoning / FAR / FSI — this MVP's development constraints are curated proxies, not authoritative.");
  if (decision && decision.failing_criteria.length > 0) {
    actions.push(`Resolve: ${decision.failing_criteria.join(", ")}.`);
  }
  if (coverage < 0.5) {
    actions.push("Request additional survey/site data — coverage is too low to fully trust the score.");
  }
  return actions.slice(0, 4);
}

export function OverviewTab({
  project,
  sites,
  analyses,
  tools,
  selectedSiteId,
  onSelectSite,
}: {
  project: Project;
  sites: Site[];
  analyses: Record<string, SiteAnalysis>;
  tools: AnalysisTools | null;
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
}) {
  const analysisList = useMemo(() => sites.map((s) => analyses[s.id]).filter((a): a is SiteAnalysis => !!a), [sites, analyses]);
  const financials = useBaseCaseFinancials(tools, analysisList);
  const constraints = useConstraints(tools, analysisList);

  const scored = useMemo(() => {
    return analysisList.map((a) => {
      const c = constraints[a.site.id] ?? null;
      const highSeverity = a.warnings.filter((w) => w.severity === "high").length;
      const decision = c ? classifyDecision(a.score, financials[a.site.id] ?? null, c, highSeverity) : null;
      return { analysis: a, constraints: c, financials: financials[a.site.id] ?? null, decision };
    });
  }, [analysisList, constraints, financials]);

  // Recommended site: best-scoring PURSUE, else best-scoring HOLD, else best score.
  const recommended = useMemo(() => {
    if (scored.length === 0) return null;
    const byScore = [...scored].sort((a, b) => (b.analysis.score?.total ?? 0) - (a.analysis.score?.total ?? 0));
    const pursue = byScore.find((s) => s.decision?.classification === "PURSUE");
    if (pursue) return pursue;
    const hold = byScore.find((s) => s.decision?.classification === "HOLD");
    if (hold) return hold;
    return byScore[0] ?? null;
  }, [scored]);

  const focusSiteId = selectedSiteId ?? recommended?.analysis.site.id ?? null;
  const focusSite = sites.find((s) => s.id === focusSiteId) ?? null;
  const bundle = useFeasibilityBundle(tools, focusSite);

  if (sites.length === 0) {
    return (
      <div className="empty-state">
        No candidate sites yet. Draw and save at least one boundary on the Map tab, then come
        back here.
      </div>
    );
  }

  if (analysisList.length === 0) {
    return <div className="loading-note">Running analysis…</div>;
  }

  const focusScored = scored.find((s) => s.analysis.site.id === focusSiteId) ?? recommended;
  const positives = bundle.insights.filter((i) => i.polarity === "positive").slice(0, 3);
  const negatives = bundle.insights.filter((i) => i.polarity === "negative").slice(0, 3);
  const coverage = focusScored?.analysis.score?.coverage ?? focusScored?.analysis.run.coverage ?? 0;
  const confidence = focusScored?.analysis.score?.confidence ?? 0;
  const missingCount = focusScored?.analysis.metrics.filter((m) => m.status !== "ok").length ?? 0;

  return (
    <div className="stack" style={{ maxWidth: 960 }}>
      <div className="card" style={{ padding: 18 }}>
        <div className="field-hint" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          Recommendation
        </div>
        <div className="row" style={{ alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          {focusScored?.decision ? <DecisionBadge classification={focusScored.decision.classification} /> : null}
          <span style={{ fontSize: 22, fontWeight: 700 }}>
            {focusScored?.decision?.classification ?? "—"} {focusSite?.name ?? ""}
          </span>
        </div>
        {project.region_label ? (
          <div className="field-hint" style={{ marginTop: 4 }}>
            {project.region_label} · {formatIndianNumber(project.target_gfa_sqft, 0)} sq ft target
          </div>
        ) : null}
      </div>

      <div className="metric-stack" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="metric-cell">
          <div className="metric-cell-label">Score</div>
          <div className="metric-cell-value">
            {focusScored?.analysis.score ? (focusScored.analysis.score.total * 100).toFixed(1) : "—"}
          </div>
        </div>
        <div className="metric-cell">
          <div className="metric-cell-label">Confidence</div>
          <div className="metric-cell-value">{(confidence * 100).toFixed(0)}%</div>
        </div>
        <div className="metric-cell">
          <div className="metric-cell-label">IRR (base case)</div>
          <div className="metric-cell-value">
            {focusScored?.financials?.outputs.irr_pct != null
              ? `${(focusScored.financials.outputs.irr_pct * 100).toFixed(1)}%`
              : "—"}
          </div>
        </div>
        <div className="metric-cell">
          <div className="metric-cell-label">Feasibility</div>
          <div className="metric-cell-value" style={{ fontSize: 15 }}>
            {focusScored?.constraints
              ? focusScored.constraints.excluded
                ? "FAIL"
                : focusScored.constraints.fail_count > 0 || focusScored.constraints.warn_count > 0
                  ? "WARN"
                  : "PASS"
              : "—"}
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={{ flex: "1 1 260px" }}>
          <Section title="Why">
            {positives.length === 0 ? (
              <div className="field-hint">No strong positive drivers identified yet.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {positives.map((insight) => (
                  <li key={insight.code} className="insight-positive" style={{ marginBottom: 4 }}>
                    {insight.message}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <Section title="Watch out">
            {negatives.length === 0 ? (
              <div className="field-hint">No material risks flagged.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {negatives.map((insight) => (
                  <li key={insight.code} className="insight-negative" style={{ marginBottom: 4 }}>
                    {insight.message}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <Section
        title="Data quality"
        action={<DataQualityBadge coverage={coverage} confidence={confidence} />}
      >
        <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
          <span className="field-hint">Coverage {(coverage * 100).toFixed(0)}%</span>
          <span className="field-hint">Confidence {(confidence * 100).toFixed(0)}%</span>
          <span className="field-hint">{missingCount} metric{missingCount === 1 ? "" : "s"} missing</span>
        </div>
        <div className="field-hint" style={{ marginTop: 6 }}>
          {dataQualityLevel(coverage, confidence) === "LIMITED"
            ? "A material share of this score rests on missing or low-confidence data — treat it as directional."
            : "Sufficient coverage to treat this score as a reasonable first-pass read."}
        </div>
      </Section>

      {focusSite ? (
        <Section title="Next action">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {nextActions(focusSite, focusScored?.decision ?? null, coverage).map((action) => (
              <li key={action} style={{ marginBottom: 4 }}>
                {action}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {scored.length > 1 ? (
        <Section title="Shortlist">
          <div className="site-list">
            {[...scored]
              .sort((a, b) => (b.analysis.score?.total ?? 0) - (a.analysis.score?.total ?? 0))
              .map(({ analysis, decision }) => (
                <button
                  key={analysis.site.id}
                  className={analysis.site.id === focusSiteId ? "site-item is-selected" : "site-item"}
                  onClick={() => onSelectSite(analysis.site.id)}
                >
                  <div className="site-item-top">
                    <span className="site-item-name">{analysis.site.name}</span>
                    <span className="numeric" style={{ fontSize: 11, fontWeight: 600 }}>
                      {analysis.score ? (analysis.score.total * 100).toFixed(1) : "—"}
                    </span>
                  </div>
                  <div className="site-item-meta">
                    {decision ? <DecisionBadge classification={decision.classification} /> : "—"}
                  </div>
                </button>
              ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
