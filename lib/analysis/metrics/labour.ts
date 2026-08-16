/**
 * LABOUR metrics.
 *
 * `labour.population_proxy` sums the population of nearby settlements
 * carrying an OSM `population` tag (Phase 2: labour/population, 2026-08-16)
 * — a real, if sparse and contributor-entered, population signal. This is
 * NOT a workforce measurement: it says how many people live nearby, not how
 * many are available, skilled, or employable for Grade-A logistics work.
 *
 * `labour.labour_proxy` stays explicit MISSING. Deriving a "labour
 * availability" number from population alone (e.g. population × a generic
 * labour-force-participation rate) would dress up the same population
 * figure in false sector-specific precision — a defensible logistics-labour
 * signal needs an actual labour-market dataset, which this MVP does not
 * have (blueprint rule 51: missing is more honest than invented).
 */

import type { Metric, Site } from "@/types/domain";
import type { OsmDataset } from "@/lib/data/osm/types";
import { pointsWithinRadius } from "@/lib/geo/nearest";
import { normalizeLinear } from "../benchmarks";
import { defineMetric, missingMetric } from "../metric";
import { osmPlaceSource, missingSource } from "../sources";

/**
 * A defensible commuting-distance catchment for a logistics/warehouse
 * workforce — CURATED judgement (like every benchmark band in this MVP),
 * not itself a measured commute-shed.
 */
const CATCHMENT_RADIUS_METRES = 15_000;

export function buildLabourMetrics(site: Site, osm: OsmDataset): Metric[] {
  const [lon, lat] = site.measurements.centroid.coordinates;
  const nearbyPlaces = pointsWithinRadius([lon, lat], osm.places, CATCHMENT_RADIUS_METRES);

  const metrics: Metric[] = [];

  if (nearbyPlaces.length > 0) {
    const totalPopulation = nearbyPlaces.reduce((sum, place) => sum + place.population, 0);
    const names = nearbyPlaces.map((place) => place.name ?? place.place).join(", ");
    metrics.push(
      defineMetric({
        key: "labour.population_proxy",
        label: "Population within catchment",
        category: "labour",
        raw_value: totalPopulation,
        raw_text: `${nearbyPlaces.length} settlement${nearbyPlaces.length === 1 ? "" : "s"}: ${names}`,
        unit: "count",
        direction: "benefit",
        normalized_value: normalizeLinear(totalPopulation, 500_000, 0, "benefit"),
        confidence: 0.4,
        status: "ok",
        calculation_note:
          `POPULATION PROXY — sum of OSM \`population\` tags for settlements within ${CATCHMENT_RADIUS_METRES / 1000} km ` +
          "of the site centroid (CURATED catchment radius). NOT a workforce measurement, and NOT an " +
          "official census total: coverage is sparse (most villages carry no population tag) and figures " +
          "are contributor-entered with no guaranteed recency.",
        source: osmPlaceSource(osm.manifest),
      }),
    );
  } else {
    metrics.push(
      missingMetric(
        "labour.population_proxy",
        "Population within catchment",
        "labour",
        "count",
        "benefit",
        `No OSM settlement carries a usable population tag within ${CATCHMENT_RADIUS_METRES / 1000} km of this site. Population-tag coverage in OpenStreetMap is sparse — this reports missing rather than a fabricated zero.`,
        missingSource("No population-tagged OSM place within the catchment radius."),
      ),
    );
  }

  metrics.push(
    missingMetric(
      "labour.labour_proxy",
      "Warehouse/logistics labour availability (proxy)",
      "labour",
      "index",
      "benefit",
      "No labour-market data source is wired into this MVP. Deriving a sector-specific labour figure from population alone (e.g. via a generic participation rate) would be false precision, not a real signal — see labour.population_proxy for the best available (population) proxy instead.",
      missingSource("No LabourProvider implemented."),
    ),
  );

  return metrics;
}
