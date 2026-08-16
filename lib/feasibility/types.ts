/**
 * Development feasibility types (TestFit-inspired proxy layer, blueprint
 * §4/§6/§7).
 *
 * This is NOT generative CAD and is never represented as architectural or
 * planning approval — every figure here is an INDICATIVE FEASIBILITY PROXY
 * derived from curated area-ratio assumptions applied to the site's own
 * geodesic measurements. See docs/FINANCIAL_MODEL.md for the ratio table.
 */

export type FeasibilityClassification = "CURATED" | "DERIVED";

export interface FeasibilityLineItem {
  label: string;
  area_sqft: number;
  area_sqm: number;
  /** Share of gross site area this line item consumes. */
  share_of_site: number;
  classification: FeasibilityClassification;
  note: string;
}

export interface DevelopmentFeasibilityResult {
  site_area_sqft: number;
  site_area_sqm: number;
  target_gfa_sqft: number;

  /** Buildable area after setback/constraint proxy is removed from gross site area. */
  buildable_area: FeasibilityLineItem;
  /** Warehouse building footprint / GFA (single-storey Grade-A shed assumption). */
  warehouse_gfa: FeasibilityLineItem;
  yard_area: FeasibilityLineItem;
  parking_area: FeasibilityLineItem;
  /** Dock/loading apron, a subset of yard area called out separately for TestFit-style review. */
  dock_loading_area: FeasibilityLineItem;
  circulation_area: FeasibilityLineItem;
  setback_area: FeasibilityLineItem;
  open_space_area: FeasibilityLineItem;

  /** Indicative achievable GFA vs the project's target GFA. */
  achievable_gfa_sqft: number;
  target_delta_sqft: number;
  target_delta_pct: number;
  /** achievable_gfa_sqft >= target_gfa_sqft */
  meets_target: boolean;

  /** DeepBlocks-inspired development-constraint proxies. Never official zoning. */
  constraints: {
    far_fsi_proxy: number;
    max_coverage_pct: number;
    height_proxy_m: number;
    parking_requirement_proxy_ratio: number;
    zoning_verified: false;
    zoning_note: string;
  };

  assumptions_note: string;
}
