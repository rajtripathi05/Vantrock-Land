/**
 * Development feasibility engine — TestFit-inspired proxy layer.
 *
 * Deterministic, pure, no I/O. Takes a site's own geodesic area (already
 * measured in lib/geo/measure.ts) and the project's target GFA, and produces
 * an area-ratio breakdown: buildable area, warehouse GFA, yard, parking,
 * dock/loading apron, circulation, setbacks, open space.
 *
 * INDICATIVE FEASIBILITY PROXY ONLY. Every ratio below is a CURATED industry
 * rule-of-thumb for a single-storey Grade-A logistics shed in this corridor,
 * not a survey, architectural drawing, or planning approval. Never represent
 * this module's output as "approved" or "buildable as of right."
 */

import { sqmToSqft, sqftToSqm } from "@/lib/geo/units";
import type { DevelopmentFeasibilityResult, FeasibilityLineItem } from "./types";

// ---------------------------------------------------------------------------
// CURATED area-ratio assumptions — Vantrock's own analytical judgement for a
// single-storey Grade-A logistics/warehouse programme. Documented here and in
// docs/FINANCIAL_MODEL.md. Not survey- or design-verified for any given site.
// ---------------------------------------------------------------------------

/** Setbacks + internal roads/buffers removed from gross site area before any building layout. */
const SETBACK_SHARE_OF_SITE = 0.08;
/** Of the buildable area (post-setback), the share occupied by the warehouse footprint (GCR). */
const GROUND_COVERAGE_RATIO = 0.45;
/** Of the buildable area, share reserved for truck yard / trailer parking / maneuvering apron. */
const YARD_SHARE_OF_BUILDABLE = 0.28;
/** Of the yard area, the share specifically allocated to the dock/loading apron (vs. general maneuvering). */
const DOCK_LOADING_SHARE_OF_YARD = 0.35;
/** Of the buildable area, share for car/staff parking. */
const PARKING_SHARE_OF_BUILDABLE = 0.08;
/** Of the buildable area, share for internal circulation (fire lanes, service roads not counted in yard). */
const CIRCULATION_SHARE_OF_BUILDABLE = 0.06;
/** Remainder of buildable area after warehouse + yard + parking + circulation is landscaping/open space. */

/** DeepBlocks-style development-constraint proxies. Never official zoning figures. */
const MAX_COVERAGE_PCT_PROXY = 0.5;
const HEIGHT_PROXY_M = 12; // typical Grade-A clear-height shed incl. parapet
const PARKING_REQUIREMENT_PROXY_RATIO = 1 / 5000; // 1 car space per 5,000 sqft GFA, industry rule of thumb
const FAR_FSI_PROXY = GROUND_COVERAGE_RATIO; // single-storey shed: FAR ≈ ground coverage

function lineItem(
  label: string,
  areaSqft: number,
  siteAreaSqft: number,
  note: string,
): FeasibilityLineItem {
  return {
    label,
    area_sqft: Math.round(areaSqft),
    area_sqm: Math.round(sqftToSqm(areaSqft)),
    share_of_site: siteAreaSqft > 0 ? areaSqft / siteAreaSqft : 0,
    classification: "DERIVED",
    note,
  };
}

export function buildDevelopmentFeasibility(
  siteAreaSqm: number,
  targetGfaSqft: number,
): DevelopmentFeasibilityResult {
  const siteAreaSqft = sqmToSqft(siteAreaSqm);

  const setbackAreaSqft = siteAreaSqft * SETBACK_SHARE_OF_SITE;
  const buildableAreaSqft = siteAreaSqft - setbackAreaSqft;

  const warehouseGfaSqft = buildableAreaSqft * GROUND_COVERAGE_RATIO;
  const yardAreaSqft = buildableAreaSqft * YARD_SHARE_OF_BUILDABLE;
  const dockLoadingAreaSqft = yardAreaSqft * DOCK_LOADING_SHARE_OF_YARD;
  const parkingAreaSqft = buildableAreaSqft * PARKING_SHARE_OF_BUILDABLE;
  const circulationAreaSqft = buildableAreaSqft * CIRCULATION_SHARE_OF_BUILDABLE;
  const openSpaceAreaSqft = Math.max(
    0,
    buildableAreaSqft - warehouseGfaSqft - yardAreaSqft - parkingAreaSqft - circulationAreaSqft,
  );

  const achievableGfaSqft = warehouseGfaSqft;
  const targetDeltaSqft = achievableGfaSqft - targetGfaSqft;
  const targetDeltaPct = targetGfaSqft > 0 ? targetDeltaSqft / targetGfaSqft : 0;

  return {
    site_area_sqft: Math.round(siteAreaSqft),
    site_area_sqm: Math.round(siteAreaSqm),
    target_gfa_sqft: targetGfaSqft,

    setback_area: lineItem(
      "Setback / constraint proxy",
      setbackAreaSqft,
      siteAreaSqft,
      `${Math.round(SETBACK_SHARE_OF_SITE * 100)}% of gross site area reserved for perimeter setbacks and internal buffers — CURATED proxy, not a verified planning setback.`,
    ),
    buildable_area: lineItem(
      "Buildable area proxy",
      buildableAreaSqft,
      siteAreaSqft,
      "Gross site area minus the setback/constraint proxy. Not a confirmed buildable envelope.",
    ),
    warehouse_gfa: lineItem(
      "Warehouse GFA",
      warehouseGfaSqft,
      siteAreaSqft,
      `${Math.round(GROUND_COVERAGE_RATIO * 100)}% ground-coverage ratio applied to the buildable area — typical single-storey Grade-A shed footprint.`,
    ),
    yard_area: lineItem(
      "Yard area",
      yardAreaSqft,
      siteAreaSqft,
      `${Math.round(YARD_SHARE_OF_BUILDABLE * 100)}% of the buildable area reserved for truck yard / trailer maneuvering, including the dock apron below.`,
    ),
    dock_loading_area: lineItem(
      "Dock / loading area proxy",
      dockLoadingAreaSqft,
      siteAreaSqft,
      `${Math.round(DOCK_LOADING_SHARE_OF_YARD * 100)}% of the yard area allocated to the dock/loading apron. Not a specific dock-door count or bay layout.`,
    ),
    parking_area: lineItem(
      "Parking area",
      parkingAreaSqft,
      siteAreaSqft,
      `${Math.round(PARKING_SHARE_OF_BUILDABLE * 100)}% of the buildable area for staff/visitor parking.`,
    ),
    circulation_area: lineItem(
      "Circulation area",
      circulationAreaSqft,
      siteAreaSqft,
      `${Math.round(CIRCULATION_SHARE_OF_BUILDABLE * 100)}% of the buildable area for internal fire lanes and service roads not already counted in the yard.`,
    ),
    open_space_area: lineItem(
      "Open space / landscaping",
      openSpaceAreaSqft,
      siteAreaSqft,
      "Remainder of buildable area after warehouse, yard, parking, and circulation are allocated.",
    ),

    achievable_gfa_sqft: Math.round(achievableGfaSqft),
    target_delta_sqft: Math.round(targetDeltaSqft),
    target_delta_pct: targetDeltaPct,
    meets_target: achievableGfaSqft >= targetGfaSqft,

    constraints: {
      far_fsi_proxy: FAR_FSI_PROXY,
      max_coverage_pct: MAX_COVERAGE_PCT_PROXY,
      height_proxy_m: HEIGHT_PROXY_M,
      parking_requirement_proxy_ratio: PARKING_REQUIREMENT_PROXY_RATIO,
      zoning_verified: false,
      zoning_note:
        "ZONING DATA NOT VERIFIED — no authoritative FAR/FSI, height, or parking-requirement figure is available for this site. All constraint figures above are CURATED SCENARIO ASSUMPTIONs for demo underwriting, not official zoning values.",
    },

    assumptions_note:
      "INDICATIVE FEASIBILITY PROXY — every area figure is derived from curated industry-standard ratios for a single-storey Grade-A logistics shed, applied to this site's own geodesic area. This is not an architectural layout, site plan, or planning approval.",
  };
}

// ---------------------------------------------------------------------------
// Land economics (blueprint §6)
// ---------------------------------------------------------------------------

export interface LandEconomicsResult {
  land_price_per_acre_inr: number | null;
  land_price_classification: "USER_INPUT" | "UNKNOWN";
  estimated_land_cost_inr: number | null;
  land_cost_per_sqft_inr: number | null;
  land_cost_per_acre_inr: number | null;
  land_cost_per_gfa_sqft_inr: number | null;
}

export function buildLandEconomics(
  siteAreaSqm: number,
  landPricePerAcreInr: number | null,
  achievableGfaSqft: number,
): LandEconomicsResult {
  const siteAreaAcres = siteAreaSqm / 4046.8564224;
  const siteAreaSqft = sqmToSqft(siteAreaSqm);

  if (landPricePerAcreInr === null) {
    return {
      land_price_per_acre_inr: null,
      land_price_classification: "UNKNOWN",
      estimated_land_cost_inr: null,
      land_cost_per_sqft_inr: null,
      land_cost_per_acre_inr: null,
      land_cost_per_gfa_sqft_inr: null,
    };
  }

  const estimatedLandCostInr = landPricePerAcreInr * siteAreaAcres;

  return {
    land_price_per_acre_inr: landPricePerAcreInr,
    land_price_classification: "USER_INPUT",
    estimated_land_cost_inr: estimatedLandCostInr,
    land_cost_per_sqft_inr: siteAreaSqft > 0 ? estimatedLandCostInr / siteAreaSqft : null,
    land_cost_per_acre_inr: landPricePerAcreInr,
    land_cost_per_gfa_sqft_inr: achievableGfaSqft > 0 ? estimatedLandCostInr / achievableGfaSqft : null,
  };
}
