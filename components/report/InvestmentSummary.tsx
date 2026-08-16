"use client";

/**
 * Investment summary (blueprint Phase 12/20) — the analyst-facing report
 * that ties the site selection, scoring, and financial slices together.
 *
 * Printable via the browser's own print dialog (window.print()); the
 * @media print rules in globals.css hide the app chrome and let the report
 * flow onto the page. No PDF library — blueprint Phase 20 explicitly says
 * not to add one just for decoration.
 */

import { useMemo } from "react";
import type { Project, SiteAnalysis } from "@/types/domain";
import { ASSET_CLASS_LABELS } from "@/types/domain";
import { explainBiggestRisk, explainRanking, topContributors } from "@/lib/ai/explain";
import { collectEvidence } from "@/lib/evidence/collect";
import { formatArea, formatInr } from "@/lib/geo/units";
import { buildFinancialScenario } from "@/lib/financial/engine";

export function InvestmentSummary({ project, analyses }: { project: Project; analyses: SiteAnalysis[] }) {
  const ranked = useMemo(
    () => [...analyses].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0)),
    [analyses],
  );
  const leader = ranked[0] ?? null;

  const leaderFinancials = useMemo(() => {
    if (!leader) return null;
    return buildFinancialScenario({
      scenario: "base",
      landAreaSqm: leader.site.measurements.area_sqm,
      landPricePerAcreInr: leader.site.land_price_per_acre_inr,
      targetGfaSqft: project.target_gfa_sqft,
    });
  }, [leader, project.target_gfa_sqft]);

  if (analyses.length === 0) {
    return <div className="empty-state">Save and analyze candidate sites to generate a summary.</div>;
  }

  const allSources = [...new Set(analyses.flatMap((a) => collectEvidence(a).map((s) => s.name)))];
  const allWarnings = analyses.flatMap((a) => a.warnings.map((w) => ({ site: a.site.name, ...w })));
  const highWarnings = allWarnings.filter((w) => w.severity === "high");

  return (
    <div className="stack" style={{ maxWidth: 880 }}>
      <div className="row no-print" style={{ justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 16 }}>Investment Summary</h2>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div className="card">
        <div className="data-row">
          <span className="data-key">Project</span>
          <span className="data-value">{project.name}</span>
        </div>
        <div className="data-row">
          <span className="data-key">Mandate</span>
          <span className="data-value">
            {ASSET_CLASS_LABELS[project.asset_class]} · {project.target_gfa_sqft.toLocaleString("en-IN")} sq ft
          </span>
        </div>
        <div className="data-row">
          <span className="data-key">Submarket</span>
          <span className="data-value">{project.region_label ?? "—"}</span>
        </div>
        <div className="data-row">
          <span className="data-key">Sites analyzed</span>
          <span className="data-value">{analyses.length}</span>
        </div>
        <div className="data-row">
          <span className="data-key">Report generated</span>
          <span className="data-value mono">{new Date().toLocaleString()}</span>
        </div>
      </div>

      {leader ? (
        <div className="card">
          <div className="label" style={{ marginBottom: 6 }}>
            Recommendation
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Pursue {leader.site.name}
            {leader.score ? ` — suitability score ${(leader.score.total * 100).toFixed(1)} / 100` : ""}.
          </p>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            {explainRanking(analyses)}
          </p>
        </div>
      ) : null}

      {leader?.score ? (
        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>
            Top strengths — {leader.site.name}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
            {topContributors(leader.score, leader.metrics, 4).map(({ entry, metric }) => (
              <li key={entry.metric_key}>
                {metric?.label ?? entry.metric_key} — +{(entry.contribution * 100).toFixed(1)} pts
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          Top risks
        </div>
        {highWarnings.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
            {highWarnings.map((w, i) => (
              <li key={i}>
                {w.site}: {w.message}
              </li>
            ))}
          </ul>
        ) : leader ? (
          <p style={{ fontSize: 12.5 }}>{explainBiggestRisk(leader)}</p>
        ) : null}
      </div>

      {leaderFinancials ? (
        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>
            Financial snapshot (base case) — {leader!.site.name}
          </div>
          <div className="metric-stack" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="metric-cell">
              <div className="metric-cell-label">NOI (annual)</div>
              <div className="metric-cell-value">{formatInr(leaderFinancials.outputs.noi_inr_annual)}</div>
            </div>
            <div className="metric-cell">
              <div className="metric-cell-label">GDV</div>
              <div className="metric-cell-value">{formatInr(leaderFinancials.outputs.gdv_inr)}</div>
            </div>
            <div className="metric-cell">
              <div className="metric-cell-label">Yield on cost</div>
              <div className="metric-cell-value">
                {leaderFinancials.outputs.yield_on_cost_pct === null
                  ? "Enter land price"
                  : `${(leaderFinancials.outputs.yield_on_cost_pct * 100).toFixed(1)}%`}
              </div>
            </div>
            <div className="metric-cell">
              <div className="metric-cell-label">IRR ({leaderFinancials.inputs.hold_period_years.value}yr)</div>
              <div className="metric-cell-value">
                {leaderFinancials.outputs.irr_pct === null
                  ? "Enter land price"
                  : `${(leaderFinancials.outputs.irr_pct * 100).toFixed(1)}%`}
              </div>
            </div>
            <div className="metric-cell">
              <div className="metric-cell-label">Site area</div>
              <div className="metric-cell-value">{formatArea(leader!.site.measurements.area_sqm, "acres")}</div>
            </div>
            <div className="metric-cell">
              <div className="metric-cell-label">Achievable GFA</div>
              <div className="metric-cell-value">
                {Math.round(leaderFinancials.outputs.achievable_gfa_sqft).toLocaleString("en-IN")} sq ft
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          Comparison
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Score</th>
                <th>Coverage</th>
                <th>Area</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((a) => (
                <tr key={a.site.id}>
                  <td>{a.site.name}</td>
                  <td>{a.score ? (a.score.total * 100).toFixed(1) : "—"}</td>
                  <td>{a.score ? `${(a.score.coverage * 100).toFixed(0)}%` : "—"}</td>
                  <td>{formatArea(a.site.measurements.area_sqm, "acres")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          Data coverage &amp; confidence
        </div>
        {ranked.map((a) => (
          <div className="data-row" key={a.site.id}>
            <span className="data-key">{a.site.name}</span>
            <span className="data-value">
              {a.score ? `${(a.score.coverage * 100).toFixed(0)}% coverage · ${(a.score.confidence * 100).toFixed(0)}% confidence` : "Not scored"}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          Sources ({allSources.length})
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{allSources.join(" · ")}</p>
      </div>

      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          Limitations
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8, color: "var(--text-secondary)" }}>
          <li>No routing provider is configured — accessibility uses straight-line distance, not route distance or truck routing.</li>
          <li>No labour/population or climate/hazard data source is wired in; those metrics report as missing rather than estimated.</li>
          <li>Financial assumptions (rent, construction cost, cap rate, financing terms) are CURATED analyst judgement, not verified market quotes.</li>
          <li>Title, legal status, survey, geotechnical conditions, final zoning interpretation, and the investment decision itself require human review — this report does not constitute regulatory or legal certification.</li>
        </ul>
      </div>
    </div>
  );
}
