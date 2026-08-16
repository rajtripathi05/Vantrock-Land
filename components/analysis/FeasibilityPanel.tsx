"use client";

/**
 * Feasibility tab — TestFit-inspired development feasibility proxy, ESRI-
 * inspired constraints/exclusions, decision-threshold classification, and
 * Site Quick Insights (blueprint §2/§3/§4/§6/§11/§32/§33), all read from
 * useFeasibilityBundle → lib/ai/tools.ts.
 */

import type { AnalysisTools } from "@/lib/ai/tools";
import type { Site, SiteAnalysis } from "@/types/domain";
import { useFeasibilityBundle } from "./useFeasibilityBundle";
import { Section, StatusBadge, DecisionBadge, ClassificationBadge } from "@/components/ui/Primitives";
import { formatInr } from "@/lib/geo/units";
import type { ConstraintCategory } from "@/lib/analysis/constraints";
import type { FeasibilityLineItem } from "@/lib/feasibility/types";

function LineItemRow({ item }: { item: FeasibilityLineItem }) {
  return (
    <div className="data-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 2, padding: "8px 0" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="data-key" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
          {item.label}
        </span>
        <span className="data-value">
          {item.area_sqft.toLocaleString("en-IN")} sq ft ({(item.share_of_site * 100).toFixed(1)}% of site)
        </span>
      </div>
      <div className="field-hint">{item.note}</div>
    </div>
  );
}

const CATEGORY_ORDER: ConstraintCategory[] = [
  "SITE_AREA",
  "GEOGRAPHY",
  "ACCESS",
  "INFRASTRUCTURE",
  "HAZARD",
  "CLIMATE",
  "DEVELOPMENT",
  "ZONING",
  "FINANCIAL",
  "DATA_QUALITY",
];

export function FeasibilityPanel({
  site,
  analysis,
  tools,
}: {
  site: Site | null;
  analysis: SiteAnalysis | null;
  tools: AnalysisTools | null;
}) {
  const bundle = useFeasibilityBundle(tools, site);

  if (!site) {
    return <div className="empty-state">Select a candidate site to view its feasibility and constraints.</div>;
  }
  if (bundle.loading || !bundle.feasibility || !bundle.constraints || !bundle.decision) {
    return <div className="loading-note">Computing feasibility and constraints…</div>;
  }
  if (bundle.error) {
    return (
      <div className="alert alert-error">
        <div className="alert-title">Could not compute feasibility</div>
        {bundle.error}
      </div>
    );
  }

  const { feasibility, landEconomics, constraints, insights, decision, baseFinancials } = bundle;

  return (
    <div className="stack" style={{ maxWidth: 880 }}>
      {/* Professional Site Panel (blueprint §32) */}
      <Section title={`${site.name} — Investment Summary`}>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <DecisionBadge classification={decision.classification} />
          <StatusBadge status={constraints.excluded ? "FAIL" : constraints.fail_count > 0 ? "WARN" : "PASS"} />
          {analysis?.score ? <span className="badge">score {(analysis.score.total * 100).toFixed(1)}</span> : null}
          {analysis?.score ? <span className="badge">confidence {(analysis.score.confidence * 100).toFixed(0)}%</span> : null}
          {baseFinancials?.outputs.irr_pct !== null && baseFinancials?.outputs.irr_pct !== undefined ? (
            <span className="badge">IRR {(baseFinancials.outputs.irr_pct * 100).toFixed(1)}%</span>
          ) : null}
          <span className="badge">RLV {baseFinancials ? formatInr(baseFinancials.outputs.residual_land_value_inr) : "—"}</span>
        </div>
        <div className="stack-sm">
          {decision.reasons.map((reason) => (
            <div key={reason.criterion} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
              <span className="data-key">
                {reason.passed ? "✓" : "✗"} {reason.criterion}
              </span>
              <span className="data-value">
                {reason.value} <span className="field-hint" style={{ display: "inline" }}>(needs {reason.threshold})</span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Site Quick Insights (blueprint §2) */}
      {insights.length > 0 ? (
        <Section title="Quick insights">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {insights.map((insight) => (
              <li
                key={insight.code}
                className={insight.polarity === "positive" ? "insight-positive" : insight.polarity === "negative" ? "insight-negative" : undefined}
                style={{ marginBottom: 4 }}
              >
                {insight.message}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Constraints (blueprint §3/§12) */}
      <Section title="Constraints">
        {constraints.excluded ? (
          <div className="alert alert-error" style={{ marginBottom: 10 }}>
            <div className="alert-title">EXCLUDED</div>
            {constraints.exclusion_reasons.join(" ")}
          </div>
        ) : null}
        {CATEGORY_ORDER.filter((cat) => constraints.checks.some((c) => c.category === cat)).map((category) => (
          <div key={category} style={{ marginBottom: 6 }}>
            <div className="field-hint" style={{ textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 8 }}>
              {category.replace(/_/g, " ")}
            </div>
            {constraints.checks
              .filter((c) => c.category === category)
              .map((check) => (
                <details key={check.id} className="constraint-row">
                  <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", listStyle: "none", gap: 10 }}>
                    <span>{check.label}</span>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="data-value">{check.value}</span>
                      <StatusBadge status={check.status} />
                    </span>
                  </summary>
                  <div className="field-hint" style={{ marginTop: 4 }}>
                    Threshold: {check.threshold} · Source: {check.source} · Confidence: {(check.confidence * 100).toFixed(0)}%
                    <br />
                    Method: {check.method}
                  </div>
                </details>
              ))}
          </div>
        ))}
      </Section>

      {/* Development feasibility (blueprint §4) */}
      <Section title="Development feasibility (indicative proxy)">
        <div className="alert alert-info" style={{ marginBottom: 10 }}>
          <div className="alert-title">INDICATIVE FEASIBILITY PROXY</div>
          {feasibility.assumptions_note}
        </div>
        <div className="metric-stack" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 10 }}>
          <div className="metric-cell">
            <div className="metric-cell-label">Target GFA</div>
            <div className="metric-cell-value">{feasibility.target_gfa_sqft.toLocaleString("en-IN")} sf</div>
          </div>
          <div className="metric-cell">
            <div className="metric-cell-label">Achievable (proxy)</div>
            <div className="metric-cell-value">{feasibility.achievable_gfa_sqft.toLocaleString("en-IN")} sf</div>
          </div>
          <div className="metric-cell">
            <div className="metric-cell-label">Delta</div>
            <div className="metric-cell-value" style={{ color: feasibility.meets_target ? "var(--success)" : "var(--danger)" }}>
              {feasibility.target_delta_sqft >= 0 ? "+" : ""}
              {feasibility.target_delta_sqft.toLocaleString("en-IN")} sf
            </div>
          </div>
        </div>
        <LineItemRow item={feasibility.setback_area} />
        <LineItemRow item={feasibility.buildable_area} />
        <LineItemRow item={feasibility.warehouse_gfa} />
        <LineItemRow item={feasibility.yard_area} />
        <LineItemRow item={feasibility.dock_loading_area} />
        <LineItemRow item={feasibility.parking_area} />
        <LineItemRow item={feasibility.circulation_area} />
        <LineItemRow item={feasibility.open_space_area} />
      </Section>

      {/* Development constraints (blueprint §20 DeepBlocks-inspired) */}
      <Section title="Development constraint proxies (zoning not verified)">
        <div className="data-row">
          <span className="data-key">FAR / FSI proxy</span>
          <span className="data-value">{feasibility.constraints.far_fsi_proxy.toFixed(2)} <ClassificationBadge classification="CURATED" /></span>
        </div>
        <div className="data-row">
          <span className="data-key">Max coverage</span>
          <span className="data-value">{(feasibility.constraints.max_coverage_pct * 100).toFixed(0)}% <ClassificationBadge classification="CURATED" /></span>
        </div>
        <div className="data-row">
          <span className="data-key">Height proxy</span>
          <span className="data-value">{feasibility.constraints.height_proxy_m} m <ClassificationBadge classification="CURATED" /></span>
        </div>
        <div className="data-row">
          <span className="data-key">Parking requirement proxy</span>
          <span className="data-value">1 space / {Math.round(1 / feasibility.constraints.parking_requirement_proxy_ratio).toLocaleString("en-IN")} sf <ClassificationBadge classification="CURATED" /></span>
        </div>
        <div className="field-hint" style={{ marginTop: 8 }}>{feasibility.constraints.zoning_note}</div>
      </Section>

      {/* Land economics (blueprint §6) */}
      <Section title="Land economics">
        {landEconomics && landEconomics.estimated_land_cost_inr !== null ? (
          <>
            <div className="data-row">
              <span className="data-key">Land price</span>
              <span className="data-value">
                {formatInr(landEconomics.land_price_per_acre_inr!)}/acre <ClassificationBadge classification="LIVE" />
              </span>
            </div>
            <div className="data-row">
              <span className="data-key">Estimated land acquisition cost</span>
              <span className="data-value">{formatInr(landEconomics.estimated_land_cost_inr)}</span>
            </div>
            <div className="data-row">
              <span className="data-key">Land cost / sq ft (site)</span>
              <span className="data-value">{formatInr(landEconomics.land_cost_per_sqft_inr!)}</span>
            </div>
            <div className="data-row">
              <span className="data-key">Land cost / GFA sq ft</span>
              <span className="data-value">{landEconomics.land_cost_per_gfa_sqft_inr !== null ? formatInr(landEconomics.land_cost_per_gfa_sqft_inr) : "—"}</span>
            </div>
          </>
        ) : (
          <div className="field-hint">
            UNKNOWN — no land price entered for this site. Set one on the Map &amp; Sites tab to compute land economics.
          </div>
        )}
      </Section>
    </div>
  );
}
