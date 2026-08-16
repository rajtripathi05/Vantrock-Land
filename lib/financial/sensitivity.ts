/**
 * Sensitivity and break-even analysis (blueprint §9/§10) — built entirely on
 * top of the existing deterministic financial engine (buildFinancialScenario).
 * No new math beyond calling that engine repeatedly with different overrides
 * and reading off IRR; no LLM involvement anywhere in this module.
 */

import { buildFinancialScenario } from "./engine";
import type { FinancialOverrides } from "./types";

export interface SensitivityParams {
  landAreaSqm: number;
  landPricePerAcreInr: number | null;
  targetGfaSqft: number;
  baseOverrides?: FinancialOverrides;
}

export type SensitivityDimension =
  | "land_price"
  | "rent"
  | "construction_cost"
  | "occupancy"
  | "target_gfa";

export interface SensitivityPoint {
  /** Multiplier applied to the base value for this dimension, e.g. 0.9 = -10%. */
  multiplier: number;
  input_value: number;
  irr_pct: number | null;
}

const SENSITIVITY_MULTIPLIERS = [0.8, 0.9, 1.0, 1.1, 1.2];

/**
 * Reads the base (pre-override) value for a dimension from a "base" scenario
 * so the sweep is centered on whatever the analyst has already set, not a
 * hardcoded default.
 */
function baseValueFor(dimension: SensitivityDimension, params: SensitivityParams): number | null {
  const base = buildFinancialScenario({
    scenario: "base",
    landAreaSqm: params.landAreaSqm,
    landPricePerAcreInr: params.landPricePerAcreInr,
    targetGfaSqft: params.targetGfaSqft,
    overrides: params.baseOverrides,
  });
  switch (dimension) {
    case "land_price":
      return base.inputs.land_price_per_acre_inr.value;
    case "rent":
      return base.inputs.rent_inr_per_sqft_per_month.value;
    case "construction_cost":
      return base.inputs.construction_cost_inr_per_sqft.value;
    case "occupancy":
      return base.inputs.stabilized_occupancy_pct.value;
    case "target_gfa":
      return params.targetGfaSqft;
  }
}

function scenarioWithOverride(
  dimension: SensitivityDimension,
  value: number,
  params: SensitivityParams,
): number | null {
  const overrides: FinancialOverrides = { ...params.baseOverrides };
  let targetGfa = params.targetGfaSqft;

  switch (dimension) {
    case "land_price":
      overrides.land_price_per_acre_inr = value;
      break;
    case "rent":
      overrides.rent_inr_per_sqft_per_month = value;
      break;
    case "construction_cost":
      overrides.construction_cost_inr_per_sqft = value;
      break;
    case "occupancy":
      overrides.stabilized_occupancy_pct = Math.min(1, value);
      break;
    case "target_gfa":
      targetGfa = value;
      break;
  }

  const result = buildFinancialScenario({
    scenario: "base",
    landAreaSqm: params.landAreaSqm,
    landPricePerAcreInr: params.landPricePerAcreInr,
    targetGfaSqft: targetGfa,
    overrides,
  });
  return result.outputs.irr_pct;
}

/** IRR sweep across ±20% of the base value for one dimension. */
export function runSensitivity(
  dimension: SensitivityDimension,
  params: SensitivityParams,
): SensitivityPoint[] {
  const baseValue = baseValueFor(dimension, params);
  if (baseValue === null) return [];

  return SENSITIVITY_MULTIPLIERS.map((multiplier) => {
    const inputValue = baseValue * multiplier;
    return {
      multiplier,
      input_value: inputValue,
      irr_pct: scenarioWithOverride(dimension, inputValue, params),
    };
  });
}

export function runAllSensitivities(
  params: SensitivityParams,
): Record<SensitivityDimension, SensitivityPoint[]> {
  const dims: SensitivityDimension[] = ["land_price", "rent", "construction_cost", "occupancy", "target_gfa"];
  const result = {} as Record<SensitivityDimension, SensitivityPoint[]>;
  for (const dim of dims) {
    result[dim] = runSensitivity(dim, params);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Break-even analysis — binary search over a single dimension until IRR
// crosses a target threshold. Deterministic, bounded iteration count.
// ---------------------------------------------------------------------------

export interface BreakEvenResult {
  dimension: SensitivityDimension;
  target_irr_pct: number;
  /** null when no value in the search bounds achieves the target IRR. */
  break_even_value: number | null;
  search_bounds: [number, number];
  note: string;
}

const BREAK_EVEN_ITERATIONS = 40;

function irrAt(dimension: SensitivityDimension, value: number, params: SensitivityParams): number | null {
  return scenarioWithOverride(dimension, value, params);
}

/**
 * `irr()` returns null when a scenario's cash flows never cross zero (e.g.
 * land price so high the deal never returns equity) — a real "deeply
 * unprofitable" result, not a numerical failure. For bisection direction and
 * range checks only, treat that as worse than any realistic target rather
 * than aborting the search.
 */
function irrForCompare(value: number | null): number {
  return value === null ? -1 : value;
}

/**
 * Finds the break-even value for `dimension` at which base-case IRR equals
 * `targetIrrPct`, via bisection over `[lo, hi]`. Assumes IRR is monotonic in
 * the dimension over the search range (true for land price, construction
 * cost — inverse; rent, occupancy, target GFA — direct), which holds for
 * this engine's formulas (see docs/FINANCIAL_MODEL.md).
 */
export function findBreakEven(
  dimension: SensitivityDimension,
  targetIrrPct: number,
  params: SensitivityParams,
  bounds?: [number, number],
): BreakEvenResult {
  const baseValue = baseValueFor(dimension, params);
  if (baseValue === null) {
    return {
      dimension,
      target_irr_pct: targetIrrPct,
      break_even_value: null,
      search_bounds: bounds ?? [0, 0],
      note: "No land price entered — IRR cannot be computed for this site, so no break-even value exists.",
    };
  }

  const [lo, hi] = bounds ?? [baseValue * 0.1, baseValue * 5];
  const irrLo = irrForCompare(irrAt(dimension, lo, params));
  const irrHi = irrForCompare(irrAt(dimension, hi, params));

  // Direction: does IRR rise or fall as the dimension value rises?
  const increasing = irrHi > irrLo;
  const targetInRange = targetIrrPct >= Math.min(irrLo, irrHi) && targetIrrPct <= Math.max(irrLo, irrHi);

  if (!targetInRange) {
    return {
      dimension,
      target_irr_pct: targetIrrPct,
      break_even_value: null,
      search_bounds: [lo, hi],
      note: `Target IRR of ${(targetIrrPct * 100).toFixed(1)}% is not reachable within the search range [${lo.toFixed(0)}, ${hi.toFixed(0)}] for this dimension.`,
    };
  }

  let low = lo;
  let high = hi;
  for (let i = 0; i < BREAK_EVEN_ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    const irrMid = irrForCompare(irrAt(dimension, mid, params));
    const midAboveTarget = irrMid >= targetIrrPct;
    const highIsAboveTarget = increasing ? irrHi >= targetIrrPct : irrLo >= targetIrrPct;
    if (midAboveTarget === highIsAboveTarget) {
      high = mid;
    } else {
      low = mid;
    }
  }

  const breakEvenValue = (low + high) / 2;

  return {
    dimension,
    target_irr_pct: targetIrrPct,
    break_even_value: breakEvenValue,
    search_bounds: [lo, hi],
    note: `Deterministic bisection over lib/financial/engine.ts buildFinancialScenario(), ${BREAK_EVEN_ITERATIONS} iterations.`,
  };
}
