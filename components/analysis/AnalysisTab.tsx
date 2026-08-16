"use client";

/**
 * Analysis tab — full metric breakdown and score for one selected site.
 *
 * Every value shown here is read straight off a Metric: its status,
 * classification, confidence, and calculation_note are always visible next
 * to the number, never just the number alone (blueprint rule 51).
 */

import { useMemo, useState } from "react";
import type { Metric, MetricCategory, Site, SiteAnalysis } from "@/types/domain";
import { formatMetricValue, formatStatus } from "@/lib/analysis/format";
import { ClassificationBadge, Section } from "@/components/ui/Primitives";
import { WEIGHT_PROFILES, type WeightProfile } from "@/lib/scoring/weights";
import { WeightControls } from "./WeightControls";

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  geography: "Site / Land Quality",
  accessibility: "Accessibility",
  infrastructure: "Infrastructure",
  market: "Market / Industrial Context",
  labour: "Labour",
  climate: "Climate",
  hazard: "Hazard",
  infrastructure_future: "Future Infrastructure (Pipeline)",
};

const CATEGORY_ORDER: MetricCategory[] = [
  "geography",
  "accessibility",
  "infrastructure",
  "infrastructure_future",
  "market",
  "labour",
  "climate",
  "hazard",
];

function MetricRow({ metric, weight }: { metric: Metric; weight: number | null }) {
  return (
    <div
      className="data-row"
      style={{ flexDirection: "column", alignItems: "stretch", gap: 3, padding: "9px 0" }}
    >
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="data-key" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
          {metric.label}
        </span>
        <span className={metric.status === "missing" ? "data-value metric-row-status-missing" : "data-value"}>
          {metric.status === "ok" ? formatMetricValue(metric) : formatStatus(metric.status)}
        </span>
      </div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div className="row" style={{ gap: 6 }}>
          <ClassificationBadge classification={metric.source.classification} />
          {weight !== null ? (
            <span className="badge">weight {(weight * 100).toFixed(0)}%</span>
          ) : null}
          <span className="badge">confidence {(metric.confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className="field-hint">{metric.calculation_note}</div>
      {metric.source.notes ? <div className="field-hint">Source: {metric.source.notes}</div> : null}
    </div>
  );
}

export function AnalysisTab({
  site,
  analysis,
  presetId,
  activeProfile,
  isCustomProfile,
  onPresetChange,
  onCustomProfileChange,
  onResetToPreset,
}: {
  site: Site | null;
  analysis: SiteAnalysis | null;
  presetId: string;
  activeProfile: WeightProfile;
  isCustomProfile: boolean;
  onPresetChange: (id: string) => void;
  onCustomProfileChange: (profile: WeightProfile) => void;
  onResetToPreset: () => void;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<MetricCategory>>(
    new Set(CATEGORY_ORDER),
  );

  const grouped = useMemo(() => {
    if (!analysis) return new Map<MetricCategory, Metric[]>();
    const map = new Map<MetricCategory, Metric[]>();
    for (const metric of analysis.metrics) {
      const list = map.get(metric.category) ?? [];
      list.push(metric);
      map.set(metric.category, list);
    }
    return map;
  }, [analysis]);

  const weightByKey = useMemo(() => new Map(Object.entries(activeProfile.weights)), [activeProfile]);

  if (!site) {
    return <div className="empty-state">Select a candidate site to view its analysis.</div>;
  }
  if (!analysis) {
    return <div className="loading-note">Running analysis…</div>;
  }

  const score = analysis.score;

  return (
    <div className="stack" style={{ maxWidth: 880 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 16 }}>{site.name} — Site Analysis</h2>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label htmlFor="weight-profile">Weight profile preset</label>
          <select
            id="weight-profile"
            className="select"
            value={presetId}
            onChange={(event) => onPresetChange(event.target.value)}
          >
            {WEIGHT_PROFILES.map((p: WeightProfile) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Section title="Category weights">
        <WeightControls
          profile={activeProfile}
          metrics={analysis.metrics}
          onChange={onCustomProfileChange}
          onReset={onResetToPreset}
          isCustom={isCustomProfile}
        />
      </Section>

      {score ? (
        <div className="metric-stack" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="metric-cell">
            <div className="metric-cell-label">Suitability Score</div>
            <div className="metric-cell-value">{(score.total * 100).toFixed(1)}</div>
          </div>
          <div className="metric-cell">
            <div className="metric-cell-label">Coverage</div>
            <div className="metric-cell-value">{(score.coverage * 100).toFixed(0)}%</div>
          </div>
          <div className="metric-cell">
            <div className="metric-cell-label">Confidence</div>
            <div className="metric-cell-value">{(score.confidence * 100).toFixed(0)}%</div>
          </div>
          <div className="metric-cell">
            <div className="metric-cell-label">Data coverage (all metrics)</div>
            <div className="metric-cell-value">{(analysis.run.coverage * 100).toFixed(0)}%</div>
          </div>
        </div>
      ) : null}

      {analysis.warnings.length > 0 ? (
        <div className="stack-sm">
          {analysis.warnings.map((warning, index) => (
            <div
              key={`${warning.code}-${index}`}
              className={warning.severity === "high" ? "alert alert-error" : "alert alert-warning"}
            >
              <div className="alert-title">{warning.code.replace(/_/g, " ")}</div>
              {warning.message}
            </div>
          ))}
        </div>
      ) : null}

      {CATEGORY_ORDER.filter((category) => grouped.has(category)).map((category) => {
        const metrics = grouped.get(category)!;
        const expanded = expandedCategories.has(category);
        return (
          <Section
            key={category}
            title={CATEGORY_LABELS[category]}
            action={
              <button
                className="btn btn-sm"
                onClick={() =>
                  setExpandedCategories((current) => {
                    const next = new Set(current);
                    if (next.has(category)) next.delete(category);
                    else next.add(category);
                    return next;
                  })
                }
              >
                {expanded ? "Collapse" : "Expand"}
              </button>
            }
          >
            {expanded
              ? metrics.map((metric) => (
                  <MetricRow key={metric.key} metric={metric} weight={weightByKey.get(metric.key) ?? null} />
                ))
              : (
                  <div className="field-hint">
                    {metrics.length} metric{metrics.length === 1 ? "" : "s"} — {metrics.filter((m) => m.status === "ok").length} available
                  </div>
                )}
          </Section>
        );
      })}
    </div>
  );
}
