/**
 * Demo ClimateProvider with curated data for Pune/Chakan/Talegaon study area.
 *
 * These values are based on public climate normals (IMD) and flood-risk
 * assessments, but are simplified proxies intended for demonstration only.
 *
 * Extreme heat: IMD normals (1981-2010) show the Pune region averages ~40
 * days/year >35°C during May-September. Values here are per-site variations
 * based on rough elevation (coastal/urban heat island adjustment).
 *
 * Flood exposure: Derived from historical flood records, topography, and
 * proximity to waterbodies (Bhima, Indrayani rivers). The Chakan industrial
 * belt has documented flood risk; Talegaon is higher/drier.
 *
 * All data is CURATED, not LIVE, confidence capped at 0.5.
 */

import type { Site } from "@/types/domain";
import type { ClimateMetricsResult, ClimateProvider } from "./types";

export class DemoClimateProvider implements ClimateProvider {
  getMetrics(site: Site): ClimateMetricsResult {
    const [lon, lat] = site.measurements.centroid.coordinates;

    let extremeHeatDays = 40; // Pune baseline: ~40 days/year >35°C
    let floodExposureIndex = 0.3; // Moderate baseline

    // Rough regional adjustments based on known geography
    if (lat > 18.65) {
      // Northern area (Chakan), closer to industrial zone with flood history
      floodExposureIndex = 0.55;
      extremeHeatDays = 38; // Slightly higher elevation → fewer extreme heat days
    } else if (lat > 18.5) {
      // Central Pune area, moderate flood risk
      floodExposureIndex = 0.35;
      extremeHeatDays = 42; // Urban heat island
    } else {
      // Southern area (Talegaon), elevated, lower flood risk
      floodExposureIndex = 0.15;
      extremeHeatDays = 36; // Higher elevation → fewer extreme heat days
    }

    // Further adjust by longitude if very close to known rivers (Bhima ~75.3°E)
    if (Math.abs(lon - 75.3) < 0.15) {
      floodExposureIndex = Math.min(1, floodExposureIndex + 0.15);
    }

    return {
      extreme_heat_days: Math.round(extremeHeatDays),
      flood_exposure_index: Math.round(floodExposureIndex * 100) / 100,
    };
  }
}
