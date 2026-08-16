"use client";

/**
 * Financials tab — downside/base/upside underwriting scenarios for the
 * selected site (blueprint Phase 7). Every input row shows its
 * classification; every output that depends on land price shows "Enter a
 * land price" rather than a number computed against an invented one.
 */

import { useEffect, useState } from "react";
import type { Site } from "@/types/domain";
import type { AnalysisTools } from "@/lib/ai/tools";
import type { FinancialOverrides, FinancialScenarioResult } from "@/lib/financial/types";
import { formatInr, formatIndianNumber } from "@/lib/geo/units";
import { Section } from "@/components/ui/Primitives";

const SCENARIO_LABELS = { downside: "Downside", base: "Base", upside: "Upside" } as const;

function fmtInrOrDash(value: number | null): string {
  return value === null ? "—" : formatInr(value);
}
function fmtPctOrDash(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

interface OverrideField {
  key: keyof FinancialOverrides;
  label: string;
  unit: string;
  step: number;
  /** Convert the stored fraction/raw value to what the input box shows. */
  toDisplay: (value: number) => number;
  /** Convert what the analyst typed back to the stored fraction/raw value. */
  fromDisplay: (value: number) => number;
}

const OVERRIDE_FIELDS: OverrideField[] = [
  {
    key: "rent_inr_per_sqft_per_month",
    label: "Rent",
    unit: "INR/sqft/mo",
    step: 1,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
  },
  {
    key: "stabilized_occupancy_pct",
    label: "Occupancy",
    unit: "%",
    step: 1,
    toDisplay: (v) => v * 100,
    fromDisplay: (v) => v / 100,
  },
  {
    key: "construction_cost_inr_per_sqft",
    label: "Construction cost",
    unit: "INR/sqft",
    step: 10,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
  },
  {
    key: "soft_cost_pct",
    label: "Soft cost",
    unit: "%",
    step: 1,
    toDisplay: (v) => v * 100,
    fromDisplay: (v) => v / 100,
  },
  {
    key: "exit_cap_rate_pct",
    label: "Exit cap rate",
    unit: "%",
    step: 0.05,
    toDisplay: (v) => v * 100,
    fromDisplay: (v) => v / 100,
  },
  {
    key: "development_period_months",
    label: "Development period",
    unit: "months",
    step: 1,
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
  },
];

export function FinancialsTab({ site, tools }: { site: Site | null; tools: AnalysisTools | null }) {
  const [scenarios, setScenarios] = useState<FinancialScenarioResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [overrides, setOverrides] = useState<FinancialOverrides>({});

  // A different site starts with a clean slate — an override typed for one
  // site's pro forma should never silently leak onto the next site selected.
  useEffect(() => {
    setOverrides({});
  }, [site?.id]);

  useEffect(() => {
    if (!site || !tools) {
      setScenarios(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void tools.getAllFinancialScenarios(site.id, overrides).then((result) => {
      if (cancelled) return;
      setScenarios(result.ok ? result.value : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [site, tools, overrides]);

  if (!site) return <div className="empty-state">Select a candidate site to view its pro forma.</div>;
  if (loading || !scenarios) return <div className="loading-note">Building financial scenarios…</div>;

  const base = scenarios.find((s) => s.scenario === "base")!;
  const landPriceUnknown = base.inputs.land_price_per_acre_inr.classification === "UNKNOWN";
  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 16 }}>{site.name} — Financial Underwriting</h2>

      {landPriceUnknown ? (
        <div className="alert alert-warning">
          <div className="alert-title">Land price not entered</div>
          Total development cost, yield-on-cost, equity, IRR, and equity multiple cannot be computed
          without a land price. Enter one on the Map &amp; Sites tab, in the selected site&apos;s
          Commercial section.
        </div>
      ) : null}

      <Section
        title="Assumption overrides"
        action={
          hasOverrides ? (
            <button type="button" className="btn btn-sm" onClick={() => setOverrides({})}>
              Reset to defaults
            </button>
          ) : null
        }
      >
        <div className="metric-stack" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {OVERRIDE_FIELDS.map((field) => {
            const currentValue = overrides[field.key];
            const defaultValue = base.inputs[field.key].value as number;
            const displayValue = field.toDisplay(currentValue ?? defaultValue);
            const isOverridden = currentValue !== undefined;
            return (
              <div className="field" key={field.key} style={{ margin: 0 }}>
                <label htmlFor={`override-${field.key}`}>
                  {field.label} ({field.unit}){isOverridden ? " — USER_INPUT" : ""}
                </label>
                <input
                  id={`override-${field.key}`}
                  className="input"
                  type="number"
                  step={field.step}
                  value={Number.isFinite(displayValue) ? displayValue : ""}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    if (event.target.value === "" || Number.isNaN(raw)) return;
                    setOverrides((prev) => ({ ...prev, [field.key]: field.fromDisplay(raw) }));
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="field-hint" style={{ marginTop: 8 }}>
          Overrides apply to all three scenarios below (downside/upside still layer their own
          multiplier or delta on top, matching the base case). Development period is informational
          only — no output formula in this MVP depends on it (no phased construction draw is
          modelled; see docs/FINANCIAL_MODEL.md).
        </div>
      </Section>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Output</th>
              {scenarios.map((s) => (
                <th key={s.scenario} className={s.scenario === "base" ? "is-leader" : ""}>
                  {SCENARIO_LABELS[s.scenario]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Achievable GFA</td>
              {scenarios.map((s) => (
                <td key={s.scenario}>{formatIndianNumber(s.outputs.achievable_gfa_sqft, 0)} sq ft</td>
              ))}
            </tr>
            <tr>
              <td>Gross potential rent (annual)</td>
              {scenarios.map((s) => (
                <td key={s.scenario}>{formatInr(s.outputs.gross_potential_rent_inr_annual)}</td>
              ))}
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>NOI (annual)</td>
              {scenarios.map((s) => (
                <td key={s.scenario} style={{ fontWeight: 700 }}>
                  {formatInr(s.outputs.noi_inr_annual)}
                </td>
              ))}
            </tr>
            <tr>
              <td>Construction cost</td>
              {scenarios.map((s) => (
                <td key={s.scenario}>{formatInr(s.outputs.construction_cost_inr)}</td>
              ))}
            </tr>
            <tr>
              <td>Soft cost</td>
              {scenarios.map((s) => (
                <td key={s.scenario}>{formatInr(s.outputs.soft_cost_inr)}</td>
              ))}
            </tr>
            <tr>
              <td>Land cost</td>
              {scenarios.map((s) => (
                <td key={s.scenario}>{fmtInrOrDash(s.outputs.land_cost_inr)}</td>
              ))}
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Total development cost (TDC)</td>
              {scenarios.map((s) => (
                <td key={s.scenario} style={{ fontWeight: 700 }}>
                  {fmtInrOrDash(s.outputs.total_development_cost_inr)}
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Gross development value (GDV)</td>
              {scenarios.map((s) => (
                <td key={s.scenario} style={{ fontWeight: 700 }}>
                  {formatInr(s.outputs.gdv_inr)}
                </td>
              ))}
            </tr>
            <tr>
              <td>Yield on cost</td>
              {scenarios.map((s) => (
                <td key={s.scenario}>{fmtPctOrDash(s.outputs.yield_on_cost_pct)}</td>
              ))}
            </tr>
            <tr>
              <td>Residual land value</td>
              {scenarios.map((s) => (
                <td key={s.scenario}>{formatInr(s.outputs.residual_land_value_inr)}</td>
              ))}
            </tr>
            <tr>
              <td>Equity required</td>
              {scenarios.map((s) => (
                <td key={s.scenario}>{fmtInrOrDash(s.outputs.equity_inr)}</td>
              ))}
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>IRR (equity, {base.inputs.hold_period_years.value}-yr hold)</td>
              {scenarios.map((s) => (
                <td key={s.scenario} style={{ fontWeight: 700 }}>
                  {fmtPctOrDash(s.outputs.irr_pct)}
                </td>
              ))}
            </tr>
            <tr>
              <td>Equity multiple</td>
              {scenarios.map((s) => (
                <td key={s.scenario}>
                  {s.outputs.equity_multiple === null ? "—" : `${s.outputs.equity_multiple.toFixed(2)}x`}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <Section title="Assumptions (base case)">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Assumption</th>
                <th>Value</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(base.inputs).map(([key, input]) => (
                <tr key={key}>
                  <td>{input.label}</td>
                  <td>
                    {typeof input.value === "number"
                      ? `${formatIndianNumber(input.value, input.value < 1 ? 3 : 0)} ${input.unit}`
                      : "Not entered"}
                  </td>
                  <td>
                    <span className="badge">{input.classification}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="field-hint" style={{ marginTop: 8 }}>
          CURATED assumptions are Vantrock&apos;s analytical judgement for the Pune/Chakan/Talegaon
          corridor, not verified market quotes. See docs/FINANCIAL_MODEL.md for the full formula set.
        </div>
      </Section>
    </div>
  );
}
