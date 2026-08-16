"use client";

/**
 * Interactive per-category weight sliders (blueprint Phase 7). Moving a
 * slider calls the same deterministic `reweightCategory()` the Analyst
 * tab's "what if accessibility were weighted 35%?" canned question already
 * used — every other category scales down proportionally so the total
 * always stays 100%, and the score recalculates immediately (AnalysisTools
 * caches metrics and score separately, so this never re-triggers a live
 * route fetch or the spatial queries — only a cheap rescore).
 */

import { categoryWeight, reweightCategory } from "@/lib/scoring/reweight";
import type { WeightProfile } from "@/lib/scoring/weights";
import type { Metric, MetricCategory } from "@/types/domain";

type CategoryOrGroup = MetricCategory | readonly MetricCategory[];

const CATEGORY_GROUPS: Array<{ key: string; label: string; categories: CategoryOrGroup }> = [
  { key: "geography", label: "Site Quality", categories: "geography" },
  { key: "accessibility", label: "Accessibility", categories: "accessibility" },
  { key: "infrastructure", label: "Infrastructure", categories: "infrastructure" },
  { key: "market", label: "Market", categories: "market" },
  { key: "labour", label: "Labour", categories: "labour" },
  { key: "climate", label: "Climate / Risk", categories: ["climate", "hazard"] },
];

export function WeightControls({
  profile,
  metrics,
  onChange,
  onReset,
  isCustom,
}: {
  profile: WeightProfile;
  metrics: readonly Metric[];
  onChange: (profile: WeightProfile) => void;
  onReset: () => void;
  isCustom: boolean;
}) {
  const rows = CATEGORY_GROUPS.map((group) => ({
    ...group,
    weight: categoryWeight(profile, metrics, group.categories),
  }));
  const total = rows.reduce((sum, row) => sum + row.weight, 0);

  return (
    <div className="stack-sm">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="field-hint" style={{ margin: 0 }}>
          Drag a category to change its share — every other category rescales automatically.
        </span>
        {isCustom ? (
          <button type="button" className="btn btn-sm" onClick={onReset}>
            Reset to preset
          </button>
        ) : null}
      </div>

      {rows.map((row) => (
        <div key={row.key} className="field" style={{ margin: 0 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <label htmlFor={`weight-${row.key}`}>{row.label}</label>
            <span className="mono">{(row.weight * 100).toFixed(0)}%</span>
          </div>
          <input
            id={`weight-${row.key}`}
            className="range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(row.weight * 100)}
            onChange={(event) => {
              const nextShare = Number(event.target.value) / 100;
              onChange(reweightCategory(profile, metrics, row.categories, nextShare));
            }}
          />
        </div>
      ))}

      <div className="field-hint">
        Total {(total * 100).toFixed(0)}% of scored weight (metrics with no data source in this MVP —
        e.g. climate/hazard when missing — carry weight but are excluded and redistributed at score
        time; see the Suitability Score breakdown above).
      </div>
    </div>
  );
}
