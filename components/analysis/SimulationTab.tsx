"use client";

import { useEffect, useState } from "react";
import type { Site } from "@/types/domain";
import type { AnalysisTools } from "@/lib/ai/tools";
import type { SiteAnalysis } from "@/types/domain";
import type { FinancialOverrides, FinancialScenarioResult } from "@/lib/financial/types";
import type { WeightProfile } from "@/lib/scoring/weights";
import { WEIGHT_PROFILES, DEFAULT_WEIGHT_PROFILE } from "@/lib/scoring/weights";
import { scoreSite } from "@/lib/scoring/engine";
import { formatInr } from "@/lib/geo/units";
import { Section } from "@/components/ui/Primitives";
import type { SensitivityDimension, SensitivityPoint, BreakEvenResult } from "@/lib/financial/sensitivity";

const SENSITIVITY_DIMENSIONS: Array<{ id: SensitivityDimension; label: string }> = [
  { id: "land_price", label: "Land price" },
  { id: "rent", label: "Rent" },
  { id: "construction_cost", label: "Construction cost" },
  { id: "occupancy", label: "Occupancy" },
  { id: "target_gfa", label: "Target GFA" },
];

function fmtSensitivityInput(dimension: SensitivityDimension, value: number): string {
  switch (dimension) {
    case "land_price":
    case "construction_cost":
      return formatInr(value);
    case "occupancy":
      return `${(value * 100).toFixed(0)}%`;
    case "target_gfa":
      return `${Math.round(value).toLocaleString("en-IN")} sf`;
    case "rent":
    default:
      return `₹${value.toFixed(0)}/sf/mo`;
  }
}

interface SimulationState {
  baseline: {
    analysis: SiteAnalysis | null;
    financials: FinancialScenarioResult | null;
  };
  simulated: {
    analysis: SiteAnalysis | null;
    financials: FinancialScenarioResult | null;
  };
}

const FINANCIAL_FIELDS = [
  { key: "rent_inr_per_sqft_per_month", label: "Rent", unit: "INR/sqft/mo", display: (v: number) => v, fromDisplay: (v: number) => v },
  { key: "stabilized_occupancy_pct", label: "Occupancy", unit: "%", display: (v: number) => v * 100, fromDisplay: (v: number) => v / 100 },
  { key: "construction_cost_inr_per_sqft", label: "Construction cost", unit: "INR/sqft", display: (v: number) => v, fromDisplay: (v: number) => v },
  { key: "soft_cost_pct", label: "Soft cost", unit: "%", display: (v: number) => v * 100, fromDisplay: (v: number) => v / 100 },
  { key: "exit_cap_rate_pct", label: "Exit cap rate", unit: "%", display: (v: number) => v * 100, fromDisplay: (v: number) => v / 100 },
  { key: "development_period_months", label: "Development period", unit: "months", display: (v: number) => v, fromDisplay: (v: number) => v },
] as const;

function fmtInrOrDash(value: number | null): string {
  return value === null ? "—" : formatInr(value);
}

export function SimulationTab({
  site,
  analysis: baselineAnalysis,
  tools,
}: {
  site: Site | null;
  analysis: SiteAnalysis | null;
  tools: AnalysisTools | null;
}) {
  const [state, setState] = useState<SimulationState>({
    baseline: { analysis: null, financials: null },
    simulated: { analysis: null, financials: null },
  });
  const [simulationProfile, setSimulationProfile] = useState<WeightProfile>(DEFAULT_WEIGHT_PROFILE);
  const [financialOverrides, setFinancialOverrides] = useState<FinancialOverrides>({});
  const [loading, setLoading] = useState(false);
  const [sensitivity, setSensitivity] = useState<Record<SensitivityDimension, SensitivityPoint[]> | null>(null);
  const [targetIrrPct, setTargetIrrPct] = useState(14);
  const [breakEven, setBreakEven] = useState<Record<SensitivityDimension, BreakEvenResult> | null>(null);

  // Sensitivity + break-even (blueprint §9/§10) — deterministic, one fetch per site.
  useEffect(() => {
    if (!tools || !site) {
      setSensitivity(null);
      setBreakEven(null);
      return;
    }
    let cancelled = false;
    void tools.getSensitivity(site.id).then((result) => {
      if (!cancelled && result.ok) setSensitivity(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [tools, site]);

  useEffect(() => {
    if (!tools || !site) {
      setBreakEven(null);
      return;
    }
    let cancelled = false;
    const target = targetIrrPct / 100;
    void Promise.all(
      SENSITIVITY_DIMENSIONS.map(({ id }) => tools.getBreakEven(site.id, id, target)),
    ).then((results) => {
      if (cancelled) return;
      const map = {} as Record<SensitivityDimension, BreakEvenResult>;
      results.forEach((result, index) => {
        if (result.ok) map[SENSITIVITY_DIMENSIONS[index]!.id] = result.value;
      });
      setBreakEven(map);
    });
    return () => {
      cancelled = true;
    };
  }, [tools, site, targetIrrPct]);

  // Capture baseline when site changes or analysis updates
  useEffect(() => {
    if (!baselineAnalysis || !tools) {
      setState({ baseline: { analysis: null, financials: null }, simulated: { analysis: null, financials: null } });
      setSimulationProfile(DEFAULT_WEIGHT_PROFILE);
      setFinancialOverrides({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    void tools.getFinancials(site!.id, "base").then((result) => {
      if (!cancelled) {
        setState({
          baseline: { analysis: baselineAnalysis, financials: result.ok ? result.value : null },
          simulated: { analysis: baselineAnalysis, financials: result.ok ? result.value : null },
        });
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineAnalysis, tools]);

  // Run simulation when overrides or profile changes
  useEffect(() => {
    if (!tools || !state.baseline.analysis) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    const runSimulation = async () => {
      // Recalculate score with simulation profile (metrics stay the same, only score changes)
      const simScore = scoreSite(state.baseline.analysis!.metrics, simulationProfile);

      // Get financials with overrides
      const finResult = await tools.getAllFinancialScenarios(state.baseline.analysis!.site.id, financialOverrides);
      const baseFinancial = finResult.ok ? finResult.value.find((s) => s.scenario === "base") : null;

      if (!cancelled) {
        setState((prev) => ({
          ...prev,
          simulated: {
            analysis: {
              ...state.baseline.analysis!,
              score: simScore,
            },
            financials: baseFinancial || null,
          },
        }));
        setLoading(false);
      }
    };

    void runSimulation();

    return () => {
      cancelled = true;
    };
  }, [site, tools, simulationProfile, financialOverrides, state.baseline.analysis]);

  if (!site) {
    return <div className="empty-state">Select a candidate site to run a simulation.</div>;
  }

  if (!state.baseline.analysis) {
    return <div className="loading-note">Loading baseline analysis…</div>;
  }

  const base = state.baseline.analysis;
  const sim = state.simulated.analysis;
  const baseFinancials = state.baseline.financials;
  const simFinancials = state.simulated.financials;

  const scoreGap = (sim?.score?.total ?? 0) - (base.score?.total ?? 0);

  return (
    <div className="stack" style={{ maxWidth: 1100 }}>
      <h2 style={{ fontSize: 16 }}>{site.name} — Sensitivity & Scenarios</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Section title="Scoring Profile">
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="sim-profile-select">Preset</label>
            <select
              id="sim-profile-select"
              className="select"
              value={simulationProfile.id}
              onChange={(e) => setSimulationProfile(WEIGHT_PROFILES.find((p) => p.id === e.target.value) || DEFAULT_WEIGHT_PROFILE)}
            >
              {WEIGHT_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>
            {Object.entries(simulationProfile.weights).map(([cat, weight]) => (
              <div key={cat} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>{cat}</span>
                <span>{(weight * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Financial Overrides">
          {FINANCIAL_FIELDS.map((field) => {
            const currentValue = financialOverrides[field.key as keyof FinancialOverrides];
            const inputData = baseFinancials?.inputs[field.key as keyof typeof baseFinancials.inputs];
            const defaultValue = inputData && typeof inputData === "object" && "value" in inputData ? (inputData.value as number) : 0;
            const displayValue = field.display(currentValue ?? defaultValue ?? 0);

            return (
              <div key={field.key} className="field" style={{ marginBottom: 10 }}>
                <label htmlFor={`sim-${field.key}`} style={{ fontSize: 12 }}>
                  {field.label}
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    id={`sim-${field.key}`}
                    type="number"
                    className="input"
                    value={displayValue}
                    onChange={(e) => {
                      const numValue = parseFloat(e.target.value);
                      if (!isNaN(numValue)) {
                        setFinancialOverrides((prev) => ({
                          ...prev,
                          [field.key]: field.fromDisplay(numValue),
                        }));
                      }
                    }}
                    step={1}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 12, color: "#666", minWidth: 60 }}>{field.unit}</span>
                </div>
              </div>
            );
          })}
          {Object.keys(financialOverrides).length > 0 ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setFinancialOverrides({})}
              style={{ marginTop: 8, width: "100%" }}
            >
              Reset overrides
            </button>
          ) : null}
        </Section>
      </div>

      {loading ? <div className="loading-note">Running simulation…</div> : null}

      <Section title="Overall Score">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>CURRENT</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{base.score?.total.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Confidence: {(base.score?.confidence ?? 0).toFixed(0)}%</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>SIMULATED</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{sim?.score?.total.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Confidence: {(sim?.score?.confidence ?? 0).toFixed(0)}%</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>DELTA</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: scoreGap > 0 ? "#22c55e" : scoreGap < 0 ? "#ef4444" : "#666" }}>
              {scoreGap > 0 ? "+" : scoreGap < 0 ? "−" : "±"}
              {Math.abs(scoreGap).toFixed(1)}
            </div>
          </div>
        </div>
      </Section>

      {baseFinancials ? (
        <Section title="Financial Outcome (Base Case)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { key: "irr_pct", label: "IRR", format: (v: number) => `${(v * 100).toFixed(1)}%` },
              { key: "equity_multiple", label: "Equity Multiple", format: (v: number) => v.toFixed(2) },
              { key: "yield_on_cost_pct", label: "Yield on Cost", format: (v: number) => `${(v * 100).toFixed(1)}%` },
              { key: "residual_land_value_inr", label: "RLV", format: fmtInrOrDash },
              { key: "giv", label: "GDV", format: fmtInrOrDash },
              { key: "total_dev_cost_inr", label: "TDC", format: fmtInrOrDash },
            ].map((metric) => {
              const currentValue = baseFinancials.outputs[metric.key as keyof typeof baseFinancials.outputs] as number | null | undefined;
              const simValue = simFinancials?.outputs[metric.key as keyof typeof simFinancials.outputs] as number | null | undefined;
              const currentNum = typeof currentValue === "number" ? currentValue : null;
              const simNum = typeof simValue === "number" ? simValue : null;
              return (
                <div key={metric.key} style={{ borderLeft: "2px solid #e5e7eb", paddingLeft: 12 }}>
                  <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>{metric.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 13 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#999" }}>Current</div>
                      <div style={{ fontWeight: 600 }}>{currentNum !== null ? metric.format(currentNum) : "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#999" }}>Simulated</div>
                      <div style={{ fontWeight: 600 }}>{simNum !== null ? metric.format(simNum) : "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#999" }}>Delta</div>
                      <div
                        style={{
                          fontWeight: 600,
                          color:
                            simNum !== null && currentNum !== null
                              ? simNum > currentNum
                                ? "#22c55e"
                                : simNum < currentNum
                                  ? "#ef4444"
                                  : "#666"
                              : "#999",
                        }}
                      >
                        {simNum !== null && currentNum !== null
                          ? `${simNum > currentNum ? "+" : simNum < currentNum ? "−" : "±"}${Math.abs(simNum - currentNum).toFixed(metric.key === "equity_multiple" ? 2 : 0)}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      {/* Sensitivity analysis (blueprint §9) */}
      <Section title="Sensitivity — IRR vs. key assumptions">
        {sensitivity ? (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th>-20%</th>
                  <th>-10%</th>
                  <th>Base</th>
                  <th>+10%</th>
                  <th>+20%</th>
                </tr>
              </thead>
              <tbody>
                {SENSITIVITY_DIMENSIONS.map(({ id, label }) => {
                  const points = sensitivity[id];
                  return (
                    <tr key={id}>
                      <td>{label}</td>
                      {points && points.length === 5
                        ? points.map((point, index) => (
                            <td key={index} style={{ fontWeight: point.multiplier === 1 ? 700 : 400 }}>
                              {point.irr_pct !== null ? `${(point.irr_pct * 100).toFixed(1)}%` : "—"}
                              <div className="field-hint">{fmtSensitivityInput(id, point.input_value)}</div>
                            </td>
                          ))
                        : (
                            <td colSpan={5} className="field-hint">
                              No land price entered — sensitivity requires a land price.
                            </td>
                          )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="loading-note">Computing sensitivity…</div>
        )}
      </Section>

      {/* Break-even analysis (blueprint §10) */}
      <Section
        title="Break-even analysis"
        action={
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <label htmlFor="target-irr" className="field-hint" style={{ margin: 0 }}>
              Target IRR
            </label>
            <input
              id="target-irr"
              type="number"
              className="input"
              style={{ width: 70 }}
              value={targetIrrPct}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v)) setTargetIrrPct(v);
              }}
            />
            <span className="field-hint">%</span>
          </div>
        }
      >
        {breakEven ? (
          <div className="stack-sm">
            {SENSITIVITY_DIMENSIONS.map(({ id, label }) => {
              const result = breakEven[id];
              return (
                <div key={id} className="data-row">
                  <span className="data-key">Break-even {label.toLowerCase()}</span>
                  <span className="data-value">
                    {result?.break_even_value !== null && result?.break_even_value !== undefined
                      ? fmtSensitivityInput(id, result.break_even_value)
                      : result?.note ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="loading-note">Computing break-even values…</div>
        )}
      </Section>
    </div>
  );
}
