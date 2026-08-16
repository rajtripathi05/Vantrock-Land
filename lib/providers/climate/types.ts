import type { Site } from "@/types/domain";

export interface ClimateMetricsResult {
  /** Annual extreme-heat days (>35°C), 0..365. Null if unavailable. */
  extreme_heat_days: number | null;
  /** Flood exposure index, 0..1 where 1=high risk. Null if unavailable. */
  flood_exposure_index: number | null;
}

export interface ClimateProvider {
  getMetrics(site: Site): ClimateMetricsResult;
}
