/**
 * CLIMATE / HAZARD metrics (blueprint Phase 3).
 *
 * Uses a curated ClimateProvider with simplified data for the Pune/Chakan/
 * Talegaon study area. Future integration candidates: India-WRIS, Bhuvan,
 * IMD gridded normals. See docs/ROADMAP.md.
 */

import type { Metric, Site } from "@/types/domain";
import { defineMetric, missingMetric } from "../metric";
import { missingSource } from "../sources";
import { DemoClimateProvider } from "@/lib/providers/climate/demo";
import { normalizeLinear } from "../benchmarks";

const CLIMATE_PROVIDER = new DemoClimateProvider();
const CLIMATE_SOURCE = {
  source_id: "climate:demo-curated",
  name: "Vantrock Climate Proxy (Curated)",
  provider: "DemoClimateProvider",
  source_url: "https://vantrock.local/docs/data-sources#climate",
  license: "CC0 (Curated reference)",
  attribution: "Vantrock Intelligence",
  classification: "CURATED" as const,
  data_timestamp: "2026-08-01",
  retrieved_at: new Date().toISOString(),
  confidence: 0.45,
  notes: "Simplified regional proxy based on IMD normals and flood-risk assessments. Not authoritative.",
};

export function buildClimateMetrics(site: Site): Metric[] {
  try {
    const result = CLIMATE_PROVIDER.getMetrics(site);

    return [
      defineMetric({
        key: "climate.flood_exposure_proxy",
        label: "Flood exposure (proxy)",
        category: "hazard",
        raw_value: result.flood_exposure_index,
        unit: "index",
        direction: "cost",
        normalized_value:
          result.flood_exposure_index !== null
            ? normalizeLinear(result.flood_exposure_index, 0.2, 0.7, "cost")
            : null,
        confidence: CLIMATE_SOURCE.confidence,
        status: result.flood_exposure_index !== null ? "ok" : "missing",
        calculation_note:
          result.flood_exposure_index !== null
            ? `Flood-risk assessment combining topography, waterbody proximity, and historical records. Scale 0–1 (0=minimal, 1=extreme).`
            : "Flood-hazard data unavailable.",
        source: CLIMATE_SOURCE,
      }),
      defineMetric({
        key: "climate.extreme_heat_days",
        label: "Extreme-heat days (annual)",
        category: "climate",
        raw_value: result.extreme_heat_days,
        unit: "days/yr",
        direction: "cost",
        normalized_value:
          result.extreme_heat_days !== null
            ? normalizeLinear(result.extreme_heat_days, 30, 50, "cost")
            : null,
        confidence: CLIMATE_SOURCE.confidence,
        status: result.extreme_heat_days !== null ? "ok" : "missing",
        calculation_note:
          result.extreme_heat_days !== null
            ? `Days per year where daily high exceeds 35°C. Based on IMD climate normals (1981–2010) with regional elevation/exposure adjustments.`
            : "Climate normals unavailable.",
        source: CLIMATE_SOURCE,
      }),
    ];
  } catch {
    // Fallback to missing if provider fails
    return [
      missingMetric(
        "climate.flood_exposure_proxy",
        "Flood exposure (proxy)",
        "hazard",
        "index",
        "cost",
        "Climate provider error.",
        missingSource("ClimateProvider error."),
      ),
      missingMetric(
        "climate.extreme_heat_days",
        "Extreme-heat days (annual)",
        "climate",
        "days/yr",
        "cost",
        "Climate provider error.",
        missingSource("ClimateProvider error."),
      ),
    ];
  }
}
