/**
 * FUTURE INFRASTRUCTURE metrics — pipeline projects, kept strictly separate
 * from the "infrastructure" category (which reflects infrastructure that
 * exists today). Never included in a WeightProfile: ANNOUNCED/planned
 * projects must not move a deterministic score the way built infrastructure
 * does. Informational only — status/confidence surfaced to the analyst and
 * to the AI evidence layer, never collapsed into "infrastructure present."
 */

import type { Metric, Site } from "@/types/domain";
import { defineMetric } from "../metric";
import { missingSource } from "../sources";
import {
  CuratedFutureInfrastructureProvider,
  type FutureInfrastructureCategory,
} from "@/lib/providers/infrastructure/future";

const PROVIDER = new CuratedFutureInfrastructureProvider();

const CATEGORIES: FutureInfrastructureCategory[] = [
  "expressway",
  "freight_corridor",
  "metro",
  "industrial_zone",
  "power",
  "logistics_park",
];

export function buildFutureInfrastructureMetrics(site: Site): Metric[] {
  const [lon, lat] = site.measurements.centroid.coordinates;
  const point: [number, number] = [lon, lat];

  return CATEGORIES.map((category) => {
    const nearest = PROVIDER.nearestByCategory(point, category);
    if (!nearest) {
      return defineMetric({
        key: `infra_future.${category}`,
        label: `Nearest future ${category.replace(/_/g, " ")} project`,
        category: "infrastructure_future",
        raw_value: null,
        unit: "m",
        direction: "neutral",
        confidence: 0,
        status: "missing",
        calculation_note: "No tracked pipeline project in this category for the study area.",
        source: missingSource("No curated future-infrastructure entry for this category."),
      });
    }

    const { project, distance_m } = nearest;
    return defineMetric({
      key: `infra_future.${category}`,
      label: `Nearest future ${category.replace(/_/g, " ")} project`,
      category: "infrastructure_future",
      raw_value: Math.round(distance_m),
      raw_text: `${project.name} — ${project.status}`,
      unit: "m",
      direction: "neutral",
      normalized_value: null,
      confidence: project.confidence,
      status: "ok",
      calculation_note:
        `Straight-line distance to "${project.name}" (status: ${project.status}, expected: ${project.expected_date ?? "unspecified"}). ` +
        `Announced/planned status does not imply the asset is operational. Informational only — not scored. ${project.notes}`,
      source: {
        source_id: project.id,
        name: project.source_name,
        provider: "CuratedFutureInfrastructureProvider",
        source_url: project.source_url,
        license: "CC0 (Curated reference)",
        attribution: "Vantrock Intelligence",
        classification: "CURATED",
        data_timestamp: project.source_date,
        retrieved_at: new Date().toISOString(),
        confidence: project.confidence,
        notes: project.notes,
      },
    });
  });
}
