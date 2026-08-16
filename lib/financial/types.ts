/**
 * Financial engine types.
 *
 * Every input carries a classification (blueprint rule 51) so the UI and the
 * investment summary can never present a CURATED assumption as a verified
 * fact. `UNKNOWN` inputs (today: land price, when the analyst has not entered
 * one) propagate to `null` outputs rather than a silently-defaulted number —
 * blueprint rule: "Never silently fill UNKNOWN."
 */

export type AssumptionClassification = "USER_INPUT" | "CURATED" | "DERIVED" | "UNKNOWN";

export interface FinancialAssumption<T> {
  value: T;
  classification: AssumptionClassification;
  label: string;
  unit: string;
  note: string;
}

export interface FinancialInputs {
  land_area_acres: FinancialAssumption<number>;
  land_price_per_acre_inr: FinancialAssumption<number | null>;
  target_gfa_sqft: FinancialAssumption<number>;
  ground_coverage_ratio: FinancialAssumption<number>;
  rent_inr_per_sqft_per_month: FinancialAssumption<number>;
  rent_growth_pct_per_year: FinancialAssumption<number>;
  stabilized_occupancy_pct: FinancialAssumption<number>;
  opex_ratio_pct: FinancialAssumption<number>;
  construction_cost_inr_per_sqft: FinancialAssumption<number>;
  soft_cost_pct: FinancialAssumption<number>;
  loan_to_cost_pct: FinancialAssumption<number>;
  debt_interest_rate_pct: FinancialAssumption<number>;
  development_period_months: FinancialAssumption<number>;
  hold_period_years: FinancialAssumption<number>;
  exit_cap_rate_pct: FinancialAssumption<number>;
}

export interface FinancialOutputs {
  achievable_gfa_sqft: number;
  gross_potential_rent_inr_annual: number;
  noi_inr_annual: number;
  land_cost_inr: number | null;
  construction_cost_inr: number;
  soft_cost_inr: number;
  total_development_cost_inr: number | null;
  gdv_inr: number;
  yield_on_cost_pct: number | null;
  residual_land_value_inr: number;
  debt_inr: number | null;
  equity_inr: number | null;
  annual_equity_cash_flows_inr: number[] | null;
  irr_pct: number | null;
  equity_multiple: number | null;
}

export type FinancialScenarioName = "downside" | "base" | "upside";

export interface FinancialScenarioResult {
  scenario: FinancialScenarioName;
  inputs: FinancialInputs;
  outputs: FinancialOutputs;
}

export interface FinancialOverrides {
  land_price_per_acre_inr?: number | null;
  rent_inr_per_sqft_per_month?: number;
  stabilized_occupancy_pct?: number;
  construction_cost_inr_per_sqft?: number;
  soft_cost_pct?: number;
  development_period_months?: number;
  exit_cap_rate_pct?: number;
}
