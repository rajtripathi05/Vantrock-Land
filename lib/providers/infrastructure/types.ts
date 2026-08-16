import type { Site } from "@/types/domain";

export interface InfrastructureMetricsResult {
  /** Distance to nearest highway (m). Null if unavailable. */
  nearest_highway_distance_m: number | null;
  /** Distance to nearest expressway (m). Null if unavailable. */
  nearest_expressway_distance_m: number | null;
  /** Distance to nearest airport (m). Null if unavailable. */
  nearest_airport_distance_m: number | null;
  /** Distance to nearest railway station (m). Null if unavailable. */
  nearest_railway_distance_m: number | null;
  /** Proximity score (0-1, lower distance = higher score). */
  connectivity_index: number | null;
}

export interface InfrastructureProvider {
  getMetrics(site: Site): InfrastructureMetricsResult;
}
