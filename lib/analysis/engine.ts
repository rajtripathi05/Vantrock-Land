/**
 * SiteAnalysis engine — composes the metric builders into the fixed
 * SiteAnalysis contract (types/domain.ts).
 *
 * Deterministic and pure given its inputs: same site + same OSM snapshot +
 * same project always produce the same analysis. No AI, no randomness, no
 * network call — the OsmDataset is loaded by the caller (lib/data/osm) and
 * passed in, so this module has no I/O of its own.
 */

import type {
  AnalysisWarning,
  Metric,
  Project,
  Site,
  SiteAnalysis,
} from "@/types/domain";
import type { OsmDataset } from "@/lib/data/osm/types";
import { isWithinOsmCoverage } from "@/lib/data/osm/provider";
import type { RoutingProvider } from "@/lib/providers/routing/types";
import { buildGeographyMetrics } from "./metrics/geography";
import { buildAccessibilityMetrics, type RouteOutcome } from "./metrics/accessibility";
import { buildMarketMetrics } from "./metrics/market";
import { buildInfrastructureMetrics } from "./metrics/infrastructure";
import { buildLabourMetrics } from "./metrics/labour";
import { buildClimateMetrics } from "./metrics/climate";

export const ANALYSIS_ENGINE_VERSION = "vantrock-analysis@0.1.0";

function buildWarnings(site: Site, osm: OsmDataset, metrics: Metric[]): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];
  const [lon, lat] = site.measurements.centroid.coordinates;

  if (!isWithinOsmCoverage(osm.manifest, lon, lat)) {
    warnings.push({
      code: "OUTSIDE_OSM_COVERAGE",
      severity: "high",
      message:
        "This site's centroid falls outside the preloaded OpenStreetMap coverage area (Pune / Chakan / Talegaon corridor). Accessibility, market, and infrastructure metrics are unavailable or unreliable here.",
    });
  }

  const missing = metrics.filter((metric) => metric.status === "missing");
  if (missing.length > 0) {
    warnings.push({
      code: "METRICS_MISSING",
      severity: "medium",
      message: `${missing.length} of ${metrics.length} metrics have no data source in this MVP: ${missing.map((m) => m.label).join(", ")}.`,
    });
  }

  const lowConfidence = metrics.filter((metric) => metric.status === "ok" && metric.confidence < 0.5);
  for (const metric of lowConfidence) {
    warnings.push({
      code: "LOW_CONFIDENCE_METRIC",
      severity: "low",
      metric_key: metric.key,
      message: `${metric.label} has low confidence (${metric.confidence.toFixed(2)}): ${metric.calculation_note}`,
    });
  }

  return warnings;
}

export function runSiteAnalysis(
  site: Site,
  project: Project,
  osm: OsmDataset,
  routeOutcome?: RouteOutcome,
  routingProvider?: RoutingProvider,
): SiteAnalysis {
  const startedAt = new Date().toISOString();

  const metrics: Metric[] = [
    ...buildGeographyMetrics(site, project.target_gfa_sqft),
    ...buildAccessibilityMetrics(site, osm, routeOutcome, routingProvider),
    ...buildMarketMetrics(site, osm),
    ...buildInfrastructureMetrics(site, osm),
    ...buildLabourMetrics(site, osm),
    ...buildClimateMetrics(site),
  ];

  const okCount = metrics.filter((metric) => metric.status === "ok").length;
  const coverage = metrics.length > 0 ? okCount / metrics.length : 0;

  return {
    run: {
      id: crypto.randomUUID(),
      site_id: site.id,
      status: "complete",
      engine_version: ANALYSIS_ENGINE_VERSION,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      coverage,
    },
    site,
    metrics,
    score: null,
    warnings: buildWarnings(site, osm, metrics),
  };
}
