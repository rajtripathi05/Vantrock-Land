/**
 * Financial underwriting engine — deterministic industrial/logistics pro
 * forma. Every formula here is documented in docs/FINANCIAL_MODEL.md so a
 * developer (or an analyst) can reproduce every number by hand.
 *
 * Design rule (blueprint Phase 7): an UNKNOWN input (today: land price,
 * until the analyst enters one) propagates to a `null` output rather than a
 * silently-defaulted number. TDC, yield-on-cost, RLV-dependent equity, IRR,
 * and equity multiple are all `null` when land price is unset — the UI must
 * show "enter a land price" rather than a number computed against an
 * invented land cost.
 *
 * PURE MODULE: no I/O, no framework, no storage.
 */

import { sqmToAcres } from "@/lib/geo/units";
import { irr as solveIrr } from "./irr";
import type {
  FinancialInputs,
  FinancialOutputs,
  FinancialOverrides,
  FinancialScenarioName,
  FinancialScenarioResult,
} from "./types";

const SQFT_PER_ACRE = 43_560;

// ---------------------------------------------------------------------------
// Pure calculation primitives — each independently testable and named after
// the line item it produces, per blueprint Phase 7's explicit test list.
// ---------------------------------------------------------------------------

export function computeAchievableGfaSqft(landAreaAcres: number, groundCoverageRatio: number): number {
  return landAreaAcres * SQFT_PER_ACRE * groundCoverageRatio;
}

export function computeGrossPotentialRent(
  gfaSqft: number,
  rentPerSqftPerMonth: number,
): number {
  return gfaSqft * rentPerSqftPerMonth * 12;
}

export function computeNoi(
  grossPotentialRentAnnual: number,
  occupancyPct: number,
  opexRatioPct: number,
): number {
  return grossPotentialRentAnnual * occupancyPct * (1 - opexRatioPct);
}

export function computeConstructionCost(gfaSqft: number, costPerSqft: number): number {
  return gfaSqft * costPerSqft;
}

export function computeSoftCost(constructionCostInr: number, softCostPct: number): number {
  return constructionCostInr * softCostPct;
}

export function computeLandCost(landAreaAcres: number, pricePerAcre: number | null): number | null {
  return pricePerAcre === null ? null : landAreaAcres * pricePerAcre;
}

/** Total Development Cost = land + construction + soft cost. */
export function computeTdc(
  landCostInr: number | null,
  constructionCostInr: number,
  softCostInr: number,
): number | null {
  if (landCostInr === null) return null;
  return landCostInr + constructionCostInr + softCostInr;
}

/** Gross Development Value = stabilized NOI capitalized at the exit cap rate. */
export function computeGdv(noiAnnual: number, exitCapRatePct: number): number {
  if (exitCapRatePct <= 0) return 0;
  return noiAnnual / exitCapRatePct;
}

export function computeYieldOnCost(noiAnnual: number, tdcInr: number | null): number | null {
  if (tdcInr === null || tdcInr <= 0) return null;
  return noiAnnual / tdcInr;
}

/**
 * Residual Land Value = GDV minus non-land development cost. What the land
 * could be worth for this programme to pencil at the assumed rent, occupancy,
 * and exit cap rate — independent of what the analyst actually entered as
 * land price. Can be negative: that means the project does not cover its
 * build cost at these assumptions, which is a real and useful signal, not an
 * error to be clamped away.
 */
export function computeResidualLandValue(
  gdvInr: number,
  constructionCostInr: number,
  softCostInr: number,
): number {
  return gdvInr - constructionCostInr - softCostInr;
}

export interface CashFlowParams {
  equityInr: number;
  debtInr: number;
  baseNoiAnnual: number;
  rentGrowthPct: number;
  interestRatePct: number;
  holdYears: number;
  exitCapRatePct: number;
}

/**
 * Annual equity cash-flow series for IRR/equity-multiple purposes.
 *
 * Simplifications, documented here and in FINANCIAL_MODEL.md:
 *   - All development cost is drawn at t=0 (no phased construction draw).
 *   - Debt is interest-only for the hold period; principal repaid at exit.
 *   - NOI grows at a flat annual rate; opex ratio is embedded in the
 *     year-0 NOI and assumed to scale with it, not modelled as a separate
 *     escalation.
 *   - Exit value uses the FORWARD (year holdYears+1) NOI on the exit cap
 *     rate — the standard appraisal convention of capitalizing the income the
 *     buyer receives, not the income the seller just earned.
 */
export function buildAnnualEquityCashFlows(params: CashFlowParams): number[] {
  const { equityInr, debtInr, baseNoiAnnual, rentGrowthPct, interestRatePct, holdYears, exitCapRatePct } =
    params;
  const flows: number[] = [-equityInr];
  const annualInterest = debtInr * interestRatePct;

  let noi = baseNoiAnnual;
  for (let year = 1; year <= holdYears; year += 1) {
    if (year > 1) noi *= 1 + rentGrowthPct;
    let cashFlow = noi - annualInterest;
    if (year === holdYears) {
      const forwardNoi = noi * (1 + rentGrowthPct);
      const exitValue = exitCapRatePct > 0 ? forwardNoi / exitCapRatePct : 0;
      cashFlow += exitValue - debtInr;
    }
    flows.push(cashFlow);
  }
  return flows;
}

export function computeEquityMultiple(cashFlows: readonly number[]): number | null {
  if (cashFlows.length < 2) return null;
  const equity = -cashFlows[0]!;
  if (equity <= 0) return null;
  const distributed = cashFlows.slice(1).reduce((sum, cf) => sum + Math.max(0, cf), 0);
  return distributed / equity;
}

// ---------------------------------------------------------------------------
// Default (BASE) assumptions and scenario multipliers — CURATED, documented
// in docs/FINANCIAL_MODEL.md. Vantrock's own analytical judgement for the
// Pune/Chakan/Talegaon Grade-A logistics corridor, not a verified market quote.
// ---------------------------------------------------------------------------

const BASE_ASSUMPTIONS = {
  ground_coverage_ratio: 0.45,
  rent_inr_per_sqft_per_month: 24,
  rent_growth_pct_per_year: 0.05,
  stabilized_occupancy_pct: 0.92,
  opex_ratio_pct: 0.08,
  construction_cost_inr_per_sqft: 1_800,
  soft_cost_pct: 0.12,
  loan_to_cost_pct: 0.6,
  debt_interest_rate_pct: 0.11,
  development_period_months: 18,
  hold_period_years: 5,
  exit_cap_rate_pct: 0.0825,
};

interface ScenarioAdjustment {
  rentMultiplier: number;
  occupancyDeltaPct: number;
  constructionCostMultiplier: number;
  exitCapRateDeltaPct: number;
}

const SCENARIO_ADJUSTMENTS: Record<FinancialScenarioName, ScenarioAdjustment> = {
  downside: {
    rentMultiplier: 0.9,
    occupancyDeltaPct: -0.05,
    constructionCostMultiplier: 1.1,
    exitCapRateDeltaPct: 0.0075,
  },
  base: { rentMultiplier: 1, occupancyDeltaPct: 0, constructionCostMultiplier: 1, exitCapRateDeltaPct: 0 },
  upside: {
    rentMultiplier: 1.1,
    occupancyDeltaPct: 0.03,
    constructionCostMultiplier: 0.95,
    exitCapRateDeltaPct: -0.005,
  },
};

export interface BuildScenarioParams {
  scenario: FinancialScenarioName;
  landAreaSqm: number;
  landPricePerAcreInr: number | null;
  targetGfaSqft: number;
  overrides?: FinancialOverrides;
}

export function buildFinancialScenario(params: BuildScenarioParams): FinancialScenarioResult {
  const { scenario, landAreaSqm, landPricePerAcreInr, targetGfaSqft, overrides } = params;
  const adjustment = SCENARIO_ADJUSTMENTS[scenario];
  const landAreaAcres = sqmToAcres(landAreaSqm);

  const rent = (overrides?.rent_inr_per_sqft_per_month ?? BASE_ASSUMPTIONS.rent_inr_per_sqft_per_month) *
    adjustment.rentMultiplier;
  const occupancy = clamp01(
    (overrides?.stabilized_occupancy_pct ?? BASE_ASSUMPTIONS.stabilized_occupancy_pct) +
      adjustment.occupancyDeltaPct,
  );
  const constructionCostPerSqft =
    (overrides?.construction_cost_inr_per_sqft ?? BASE_ASSUMPTIONS.construction_cost_inr_per_sqft) *
    adjustment.constructionCostMultiplier;
  const softCostPct = overrides?.soft_cost_pct ?? BASE_ASSUMPTIONS.soft_cost_pct;
  const developmentPeriodMonths =
    overrides?.development_period_months ?? BASE_ASSUMPTIONS.development_period_months;
  const exitCapRate =
    (overrides?.exit_cap_rate_pct ?? BASE_ASSUMPTIONS.exit_cap_rate_pct) + adjustment.exitCapRateDeltaPct;
  const landPrice = overrides?.land_price_per_acre_inr !== undefined
    ? overrides.land_price_per_acre_inr
    : landPricePerAcreInr;

  const inputs: FinancialInputs = {
    land_area_acres: assumption(landAreaAcres, "DERIVED", "Land area", "acres", "From the site's stored geodesic measurement."),
    land_price_per_acre_inr: assumption(
      landPrice,
      landPrice === null ? "UNKNOWN" : "USER_INPUT",
      "Land price",
      "INR/acre",
      landPrice === null
        ? "Not entered for this site. Land cost, TDC, yield-on-cost, RLV-dependent equity, IRR, and equity multiple cannot be computed without it."
        : "Analyst-entered on the site detail panel.",
    ),
    target_gfa_sqft: assumption(targetGfaSqft, "USER_INPUT", "Target GFA", "sq ft", "Project mandate."),
    ground_coverage_ratio: assumption(
      BASE_ASSUMPTIONS.ground_coverage_ratio,
      "CURATED",
      "Ground coverage ratio",
      "ratio",
      "Typical single-storey Grade-A warehouse footprint-to-site ratio.",
    ),
    rent_inr_per_sqft_per_month: assumption(
      rent,
      overrides?.rent_inr_per_sqft_per_month !== undefined ? "USER_INPUT" : "CURATED",
      "Achieved rent",
      "INR/sqft/month",
      overrides?.rent_inr_per_sqft_per_month !== undefined
        ? `Analyst-entered override (${scenario} case scenario multiplier still applied).`
        : `Indicative Grade-A logistics rent for the Pune/Chakan/Talegaon corridor (${scenario} case), not a verified market quote.`,
    ),
    rent_growth_pct_per_year: assumption(
      BASE_ASSUMPTIONS.rent_growth_pct_per_year,
      "CURATED",
      "Rent growth",
      "%/yr",
      "Applied only within the multi-year IRR cash flow, not to the single-period NOI/GDV figures.",
    ),
    stabilized_occupancy_pct: assumption(
      occupancy,
      overrides?.stabilized_occupancy_pct !== undefined ? "USER_INPUT" : "CURATED",
      "Stabilized occupancy",
      "%",
      overrides?.stabilized_occupancy_pct !== undefined
        ? `Analyst-entered override (${scenario} case scenario delta still applied).`
        : `Assumed stabilized occupancy (${scenario} case).`,
    ),
    opex_ratio_pct: assumption(
      BASE_ASSUMPTIONS.opex_ratio_pct,
      "CURATED",
      "Operating expense ratio",
      "% of gross potential rent",
      "Typical opex ratio for a single-tenant Grade-A shed.",
    ),
    construction_cost_inr_per_sqft: assumption(
      constructionCostPerSqft,
      overrides?.construction_cost_inr_per_sqft !== undefined ? "USER_INPUT" : "CURATED",
      "Construction cost",
      "INR/sqft",
      overrides?.construction_cost_inr_per_sqft !== undefined
        ? `Analyst-entered override (${scenario} case scenario multiplier still applied).`
        : `Grade-A shell + interior construction cost (${scenario} case).`,
    ),
    soft_cost_pct: assumption(
      softCostPct,
      overrides?.soft_cost_pct !== undefined ? "USER_INPUT" : "CURATED",
      "Soft cost",
      "% of construction cost",
      overrides?.soft_cost_pct !== undefined
        ? "Analyst-entered override."
        : "Design, approvals, and project management as a share of hard cost.",
    ),
    loan_to_cost_pct: assumption(
      BASE_ASSUMPTIONS.loan_to_cost_pct,
      "CURATED",
      "Loan to cost",
      "%",
      "Typical construction/permanent debt sizing for institutional industrial development.",
    ),
    debt_interest_rate_pct: assumption(
      BASE_ASSUMPTIONS.debt_interest_rate_pct,
      "CURATED",
      "Debt interest rate",
      "%/yr",
      "Indicative rate for Indian commercial real estate debt; interest-only for the hold period.",
    ),
    development_period_months: assumption(
      developmentPeriodMonths,
      overrides?.development_period_months !== undefined ? "USER_INPUT" : "CURATED",
      "Development period",
      "months",
      overrides?.development_period_months !== undefined
        ? "Analyst-entered override. Informational only — not yet a driver of any output formula (no phased construction draw is modelled; see FINANCIAL_MODEL.md)."
        : "Design-to-handover for a build-to-suit Grade-A shed of this size.",
    ),
    hold_period_years: assumption(
      BASE_ASSUMPTIONS.hold_period_years,
      "CURATED",
      "Hold period",
      "years",
      "Assumed hold from stabilization to exit.",
    ),
    exit_cap_rate_pct: assumption(
      exitCapRate,
      overrides?.exit_cap_rate_pct !== undefined ? "USER_INPUT" : "CURATED",
      "Exit cap rate",
      "%",
      overrides?.exit_cap_rate_pct !== undefined
        ? `Analyst-entered override (${scenario} case scenario delta still applied).`
        : `Indicative Grade-A industrial exit cap rate for the corridor (${scenario} case).`,
    ),
  };

  const outputs = computeOutputs(inputs);

  return { scenario, inputs, outputs };
}

function computeOutputs(inputs: FinancialInputs): FinancialOutputs {
  const achievableGfaSqft = computeAchievableGfaSqft(
    inputs.land_area_acres.value,
    inputs.ground_coverage_ratio.value,
  );
  const grossPotentialRent = computeGrossPotentialRent(
    achievableGfaSqft,
    inputs.rent_inr_per_sqft_per_month.value,
  );
  const noi = computeNoi(
    grossPotentialRent,
    inputs.stabilized_occupancy_pct.value,
    inputs.opex_ratio_pct.value,
  );
  const constructionCost = computeConstructionCost(
    achievableGfaSqft,
    inputs.construction_cost_inr_per_sqft.value,
  );
  const softCost = computeSoftCost(constructionCost, inputs.soft_cost_pct.value);
  const landCost = computeLandCost(inputs.land_area_acres.value, inputs.land_price_per_acre_inr.value);
  const tdc = computeTdc(landCost, constructionCost, softCost);
  const gdv = computeGdv(noi, inputs.exit_cap_rate_pct.value);
  const yieldOnCost = computeYieldOnCost(noi, tdc);
  const residualLandValue = computeResidualLandValue(gdv, constructionCost, softCost);

  let debt: number | null = null;
  let equity: number | null = null;
  let cashFlows: number[] | null = null;
  let irrPct: number | null = null;
  let equityMultiple: number | null = null;

  if (tdc !== null) {
    debt = tdc * inputs.loan_to_cost_pct.value;
    equity = tdc - debt;
    cashFlows = buildAnnualEquityCashFlows({
      equityInr: equity,
      debtInr: debt,
      baseNoiAnnual: noi,
      rentGrowthPct: inputs.rent_growth_pct_per_year.value,
      interestRatePct: inputs.debt_interest_rate_pct.value,
      holdYears: inputs.hold_period_years.value,
      exitCapRatePct: inputs.exit_cap_rate_pct.value,
    });
    irrPct = solveIrr(cashFlows);
    equityMultiple = computeEquityMultiple(cashFlows);
  }

  return {
    achievable_gfa_sqft: achievableGfaSqft,
    gross_potential_rent_inr_annual: grossPotentialRent,
    noi_inr_annual: noi,
    land_cost_inr: landCost,
    construction_cost_inr: constructionCost,
    soft_cost_inr: softCost,
    total_development_cost_inr: tdc,
    gdv_inr: gdv,
    yield_on_cost_pct: yieldOnCost,
    residual_land_value_inr: residualLandValue,
    debt_inr: debt,
    equity_inr: equity,
    annual_equity_cash_flows_inr: cashFlows,
    irr_pct: irrPct,
    equity_multiple: equityMultiple,
  };
}

function assumption<T>(
  value: T,
  classification: FinancialInputs["target_gfa_sqft"]["classification"],
  label: string,
  unit: string,
  note: string,
) {
  return { value, classification, label, unit, note };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function buildAllScenarios(params: Omit<BuildScenarioParams, "scenario">): FinancialScenarioResult[] {
  return (["downside", "base", "upside"] as const).map((scenario) =>
    buildFinancialScenario({ ...params, scenario }),
  );
}
