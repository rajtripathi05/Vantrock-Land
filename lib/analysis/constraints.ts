/**
 * Constraints & exclusions engine (ESRI-inspired, blueprint §3/§12).
 *
 * Evaluates a fixed set of deterministic constraint checks over an existing
 * SiteAnalysis + DevelopmentFeasibilityResult + base-case FinancialScenarioResult.
 * Every constraint reports PASS / WARN / FAIL / UNKNOWN — never silently
 * folded into the score. A FAIL on any EXCLUSION-tagged constraint marks the
 * site EXCLUDED with an explicit reason; exclusions are surfaced, never
 * hidden inside a lower score.
 *
 * PURE MODULE: no I/O. Every threshold is CURATED and documented inline.
 */

import type { SiteAnalysis } from "@/types/domain";
import type { DevelopmentFeasibilityResult } from "@/lib/feasibility/types";
import type { FinancialScenarioResult } from "@/lib/financial/types";

export type ConstraintStatus = "PASS" | "WARN" | "FAIL" | "UNKNOWN";

export type ConstraintCategory =
  | "GEOGRAPHY"
  | "SITE_AREA"
  | "ACCESS"
  | "INFRASTRUCTURE"
  | "HAZARD"
  | "CLIMATE"
  | "DEVELOPMENT"
  | "ZONING"
  | "FINANCIAL"
  | "DATA_QUALITY";

export interface ConstraintCheck {
  id: string;
  category: ConstraintCategory;
  label: string;
  status: ConstraintStatus;
  value: string;
  threshold: string;
  source: string;
  method: string;
  confidence: number;
  /** True when a FAIL here should exclude the site outright (blueprint §12 exclusion criteria). */
  is_exclusion: boolean;
}

export interface ConstraintsResult {
  checks: ConstraintCheck[];
  excluded: boolean;
  exclusion_reasons: string[];
  pass_count: number;
  warn_count: number;
  fail_count: number;
  unknown_count: number;
}

/** CURATED minimum viable site area for a 500,000 sq ft Grade-A shed programme. */
const MIN_SITE_AREA_SQFT = 300_000;
/** CURATED — beyond this straight-line distance to a mapped highway, access is considered weak. */
const MAX_HIGHWAY_DISTANCE_WARN_M = 5_000;
const MAX_HIGHWAY_DISTANCE_FAIL_M = 15_000;
/** CURATED flood-exposure-proxy thresholds (0..1 index). */
const FLOOD_WARN = 0.4;
const FLOOD_FAIL = 0.7;

function metric(analysis: SiteAnalysis, key: string) {
  return analysis.metrics.find((m) => m.key === key) ?? null;
}

export function evaluateConstraints(
  analysis: SiteAnalysis,
  feasibility: DevelopmentFeasibilityResult,
  baseFinancials: FinancialScenarioResult | null,
): ConstraintsResult {
  const checks: ConstraintCheck[] = [];

  // ---- GEOGRAPHY / SITE AREA -----------------------------------------------
  const siteAreaSqft = feasibility.site_area_sqft;
  checks.push({
    id: "site_area_minimum",
    category: "SITE_AREA",
    label: "Minimum site area",
    status: siteAreaSqft >= MIN_SITE_AREA_SQFT ? "PASS" : "FAIL",
    value: `${siteAreaSqft.toLocaleString("en-IN")} sq ft`,
    threshold: `≥ ${MIN_SITE_AREA_SQFT.toLocaleString("en-IN")} sq ft`,
    source: "Site geometry (geodesic measurement)",
    method: "lib/geo/measure.ts area, converted to sq ft",
    confidence: 1,
    is_exclusion: true,
  });

  const outsideCoverage = analysis.warnings.some((w) => w.code === "OUTSIDE_OSM_COVERAGE");
  checks.push({
    id: "study_area",
    category: "GEOGRAPHY",
    label: "Within study area",
    status: outsideCoverage ? "FAIL" : "PASS",
    value: outsideCoverage ? "Outside Pune/Chakan/Talegaon OSM coverage" : "Within study area",
    threshold: "Site centroid within the preloaded OSM coverage bounding box",
    source: "OSM ingest manifest",
    method: "lib/data/osm/provider.ts isWithinOsmCoverage()",
    confidence: 1,
    is_exclusion: true,
  });

  // ---- ACCESS ---------------------------------------------------------------
  const highway = metric(analysis, "access.nearest_highway_distance");
  if (highway && highway.status === "ok" && highway.raw_value !== null) {
    const dist = highway.raw_value;
    const status: ConstraintStatus =
      dist <= MAX_HIGHWAY_DISTANCE_WARN_M ? "PASS" : dist <= MAX_HIGHWAY_DISTANCE_FAIL_M ? "WARN" : "FAIL";
    checks.push({
      id: "highway_access",
      category: "ACCESS",
      label: "Highway access",
      status,
      value: `${Math.round(dist).toLocaleString("en-IN")} m straight-line`,
      threshold: `≤ ${MAX_HIGHWAY_DISTANCE_WARN_M.toLocaleString("en-IN")} m PASS, ≤ ${MAX_HIGHWAY_DISTANCE_FAIL_M.toLocaleString("en-IN")} m WARN`,
      source: highway.source.name,
      method: highway.calculation_note,
      confidence: highway.confidence,
      is_exclusion: false,
    });
  } else {
    checks.push({
      id: "highway_access",
      category: "ACCESS",
      label: "Highway access",
      status: "UNKNOWN",
      value: "No mapped highway found within search radius",
      threshold: `≤ ${MAX_HIGHWAY_DISTANCE_WARN_M.toLocaleString("en-IN")} m PASS`,
      source: "OSM road network",
      method: "lib/geo/nearest.ts nearestPolyline()",
      confidence: 0,
      is_exclusion: false,
    });
  }

  // ---- HAZARD / CLIMATE -------------------------------------------------------
  const flood = metric(analysis, "climate.flood_exposure_proxy");
  if (flood && flood.status === "ok" && flood.raw_value !== null) {
    const status: ConstraintStatus = flood.raw_value < FLOOD_WARN ? "PASS" : flood.raw_value < FLOOD_FAIL ? "WARN" : "FAIL";
    checks.push({
      id: "flood_exposure",
      category: "HAZARD",
      label: "Flood exposure proxy",
      status,
      value: flood.raw_value.toFixed(2),
      threshold: `< ${FLOOD_WARN} PASS, < ${FLOOD_FAIL} WARN`,
      source: flood.source.name,
      method: flood.calculation_note,
      confidence: flood.confidence,
      is_exclusion: status === "FAIL",
    });
  } else {
    checks.push({
      id: "flood_exposure",
      category: "HAZARD",
      label: "Flood exposure proxy",
      status: "UNKNOWN",
      value: "No data",
      threshold: `< ${FLOOD_WARN} PASS`,
      source: "n/a",
      method: "No hazard provider configured for this metric",
      confidence: 0,
      is_exclusion: false,
    });
  }

  const heat = metric(analysis, "climate.extreme_heat_days");
  checks.push({
    id: "extreme_heat",
    category: "CLIMATE",
    label: "Extreme heat days",
    status: heat && heat.status === "ok" ? "PASS" : "UNKNOWN",
    value: heat && heat.raw_value !== null ? `${Math.round(heat.raw_value)} days/yr` : "No data",
    threshold: "Informational — no PASS/FAIL threshold set for this MVP",
    source: heat?.source.name ?? "n/a",
    method: heat?.calculation_note ?? "No provider configured",
    confidence: heat?.confidence ?? 0,
    is_exclusion: false,
  });

  // ---- INFRASTRUCTURE ---------------------------------------------------------
  const power = metric(analysis, "infra.nearest_power_substation");
  checks.push({
    id: "power_infrastructure",
    category: "INFRASTRUCTURE",
    label: "Power substation proximity",
    status: power && power.status === "ok" ? (power.confidence >= 0.5 ? "PASS" : "WARN") : "UNKNOWN",
    value: power && power.raw_value !== null ? `${Math.round(power.raw_value).toLocaleString("en-IN")} m` : "No data",
    threshold: "Informational proximity signal",
    source: power?.source.name ?? "n/a",
    method: power?.calculation_note ?? "No provider configured",
    confidence: power?.confidence ?? 0,
    is_exclusion: false,
  });

  // ---- DEVELOPMENT (feasibility) -----------------------------------------------
  checks.push({
    id: "development_feasibility",
    category: "DEVELOPMENT",
    label: "Target GFA feasibility",
    status: feasibility.meets_target ? "PASS" : feasibility.target_delta_pct >= -0.15 ? "WARN" : "FAIL",
    value: `${feasibility.achievable_gfa_sqft.toLocaleString("en-IN")} sq ft achievable vs ${feasibility.target_gfa_sqft.toLocaleString("en-IN")} sq ft target (${feasibility.target_delta_pct >= 0 ? "+" : ""}${Math.round(feasibility.target_delta_pct * 100)}%)`,
    threshold: "Achievable GFA ≥ target PASS; within 15% shortfall WARN; beyond that FAIL",
    source: "lib/feasibility/engine.ts (INDICATIVE FEASIBILITY PROXY)",
    method: "Curated ground-coverage-ratio area breakdown applied to the site's geodesic area",
    confidence: 0.5,
    is_exclusion: false,
  });

  // ---- ZONING -------------------------------------------------------------------
  checks.push({
    id: "zoning_verified",
    category: "ZONING",
    label: "Zoning / FAR-FSI verification",
    status: "UNKNOWN",
    value: "ZONING DATA NOT VERIFIED",
    threshold: "Requires an authoritative planning/zoning data source (not available in this MVP)",
    source: "n/a — no PlanningProvider configured",
    method: "CURATED SCENARIO ASSUMPTION only (see feasibility.constraints)",
    confidence: 0,
    is_exclusion: false,
  });

  // ---- FINANCIAL ------------------------------------------------------------------
  if (baseFinancials) {
    const landKnown = baseFinancials.inputs.land_price_per_acre_inr.classification !== "UNKNOWN";
    checks.push({
      id: "land_price_known",
      category: "FINANCIAL",
      label: "Land price entered",
      status: landKnown ? "PASS" : "WARN",
      value: landKnown ? "Land price entered" : "No land price entered",
      threshold: "A land price is required to compute TDC, yield-on-cost, IRR, and equity multiple",
      source: "Analyst-entered site field",
      method: "Site.land_price_per_acre_inr",
      confidence: 1,
      is_exclusion: false,
    });

    if (baseFinancials.outputs.irr_pct !== null) {
      const irr = baseFinancials.outputs.irr_pct;
      checks.push({
        id: "irr_viability",
        category: "FINANCIAL",
        label: "Base-case IRR",
        status: irr >= 0.14 ? "PASS" : irr >= 0.08 ? "WARN" : "FAIL",
        value: `${(irr * 100).toFixed(1)}%`,
        threshold: "≥ 14% PASS, ≥ 8% WARN (CURATED — see docs/FINANCIAL_MODEL.md)",
        source: "lib/financial/engine.ts (deterministic)",
        method: "Bisection IRR solver over the base-case annual equity cash-flow series",
        confidence: 1,
        is_exclusion: false,
      });
    }
  } else {
    checks.push({
      id: "land_price_known",
      category: "FINANCIAL",
      label: "Land price entered",
      status: "UNKNOWN",
      value: "Financials not computed",
      threshold: "n/a",
      source: "n/a",
      method: "n/a",
      confidence: 0,
      is_exclusion: false,
    });
  }

  // ---- DATA QUALITY -----------------------------------------------------------
  const coverage = analysis.score?.coverage ?? analysis.run.coverage;
  checks.push({
    id: "data_coverage",
    category: "DATA_QUALITY",
    label: "Score data coverage",
    status: coverage >= 0.8 ? "PASS" : coverage >= 0.5 ? "WARN" : "FAIL",
    value: `${Math.round(coverage * 100)}%`,
    threshold: "≥ 80% PASS, ≥ 50% WARN",
    source: "lib/scoring/engine.ts",
    method: "Fraction of total scoring weight backed by non-missing, non-low-confidence metrics",
    confidence: 1,
    is_exclusion: false,
  });

  const passCount = checks.filter((c) => c.status === "PASS").length;
  const warnCount = checks.filter((c) => c.status === "WARN").length;
  const failCount = checks.filter((c) => c.status === "FAIL").length;
  const unknownCount = checks.filter((c) => c.status === "UNKNOWN").length;

  const exclusionFailures = checks.filter((c) => c.is_exclusion && c.status === "FAIL");

  return {
    checks,
    excluded: exclusionFailures.length > 0,
    exclusion_reasons: exclusionFailures.map((c) => `${c.label}: ${c.value} (threshold: ${c.threshold})`),
    pass_count: passCount,
    warn_count: warnCount,
    fail_count: failCount,
    unknown_count: unknownCount,
  };
}
