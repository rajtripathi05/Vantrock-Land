/**
 * Weight profiles — the only place scoring weights are defined.
 *
 * A weight profile maps a Metric.key to a share of the total score. Metrics
 * absent from the profile are informational only (shown in the analysis
 * panel) and never affect the score.
 *
 * access.route_distance / access.route_time now carry weight (Phase 1
 * routing): when a route was fetched successfully they participate in the
 * score at full weight; when the OSRM demo server is unreachable or the
 * site falls outside coverage, the scoring engine's own missing-weight
 * redistribution (lib/scoring/engine.ts) carries their weight over to the
 * metrics that ARE available — same handling as any other missing metric,
 * nothing routing-specific.
 *
 * The default profile is Vantrock's own analytical judgement for Grade-A
 * logistics siting (CURATED), documented in docs/SCORING_MODEL.md — not a
 * regulatory or lender-mandated weighting.
 */

export interface WeightProfile {
  id: string;
  name: string;
  description: string;
  /** Metric.key -> weight. Must sum to 1.0. */
  weights: Record<string, number>;
}

export const DEFAULT_WEIGHT_PROFILE: WeightProfile = {
  id: "vantrock_default_v1",
  name: "Vantrock Default — Grade-A Logistics",
  description:
    "Balanced weighting across accessibility, infrastructure, market context, site quality, labour, and climate/hazard for a Grade-A logistics/warehouse mandate.",
  weights: {
    "geo.gfa_adequacy": 0.08,
    "geo.shape_regularity": 0.04,
    "access.nearest_road_distance": 0.07,
    "access.nearest_highway_distance": 0.1,
    "access.route_distance": 0.04,
    "access.route_time": 0.03,
    "market.poi_count_2km": 0.05,
    "market.industrial_poi_count_2km": 0.08,
    "market.industrial_density_proxy": 0.07,
    "infra.nearest_rail": 0.1,
    "infra.nearest_airport": 0.08,
    "infra.nearest_power_substation": 0.08,
    "infra.industrial_cluster_proximity": 0.08,
    "labour.population_proxy": 0.05,
    "labour.labour_proxy": 0.02,
    "climate.flood_exposure_proxy": 0.02,
    "climate.extreme_heat_days": 0.01,
  },
};

/** An analyst override where accessibility to highways dominates the mandate. */
export const ACCESSIBILITY_FOCUSED_WEIGHT_PROFILE: WeightProfile = {
  id: "vantrock_accessibility_focused_v1",
  name: "Accessibility-Focused",
  description:
    "Weights highway and road proximity more heavily, for mandates where last-mile transit time dominates the investment case.",
  weights: {
    "geo.gfa_adequacy": 0.05,
    "geo.shape_regularity": 0.03,
    "access.nearest_road_distance": 0.12,
    "access.nearest_highway_distance": 0.2,
    "access.route_distance": 0.06,
    "access.route_time": 0.04,
    "market.poi_count_2km": 0.03,
    "market.industrial_poi_count_2km": 0.05,
    "market.industrial_density_proxy": 0.04,
    "infra.nearest_rail": 0.08,
    "infra.nearest_airport": 0.08,
    "infra.nearest_power_substation": 0.06,
    "infra.industrial_cluster_proximity": 0.06,
    "labour.population_proxy": 0.05,
    "labour.labour_proxy": 0.02,
    "climate.flood_exposure_proxy": 0.02,
    "climate.extreme_heat_days": 0.01,
  },
};

export const WEIGHT_PROFILES: WeightProfile[] = [
  DEFAULT_WEIGHT_PROFILE,
  ACCESSIBILITY_FOCUSED_WEIGHT_PROFILE,
];

export function totalWeight(profile: WeightProfile): number {
  return Object.values(profile.weights).reduce((sum, w) => sum + w, 0);
}
