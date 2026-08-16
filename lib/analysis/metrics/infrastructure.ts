/**
 * INFRASTRUCTURE metrics.
 *
 * Distance to rail freight, air freight, and grid power — all from the
 * preloaded OSM snapshot. These are straight-line distances to a mapped
 * feature, not a service-availability confirmation: a nearby substation does
 * not guarantee spare grid capacity, and a nearby rail yard does not confirm
 * freight siding access. Both are flagged as proxies in calculation_note.
 */

import type { Metric, Site } from "@/types/domain";
import type { OsmDataset, OsmPoi } from "@/lib/data/osm/types";
import { nearestPoint } from "@/lib/geo/nearest";
import { normalizeLinear } from "../benchmarks";
import { defineMetric, missingMetric } from "../metric";
import { osmSource, missingSource } from "../sources";

const MAX_SEARCH_METRES = 60_000;

function nearestOfCategory(
  point: [number, number],
  pois: readonly OsmPoi[],
  category: OsmPoi["category"] | OsmPoi["category"][],
) {
  const categories = Array.isArray(category) ? category : [category];
  const filtered = pois.filter((poi) => categories.includes(poi.category));
  return nearestPoint(point, filtered, MAX_SEARCH_METRES);
}

export function buildInfrastructureMetrics(site: Site, osm: OsmDataset): Metric[] {
  const [lon, lat] = site.measurements.centroid.coordinates;
  const point: [number, number] = [lon, lat];
  const metrics: Metric[] = [];

  const rail = nearestOfCategory(point, osm.pois, ["rail_station", "rail_yard"]);
  metrics.push(
    rail
      ? defineMetric({
          key: "infra.nearest_rail",
          label: "Nearest rail (station/yard)",
          category: "infrastructure",
          raw_value: rail.distance_m,
          raw_text: rail.feature.name,
          unit: "m",
          direction: "cost",
          normalized_value: normalizeLinear(rail.distance_m, 2_000, 25_000, "cost"),
          confidence: 0.7,
          status: "ok",
          calculation_note:
            "Straight-line distance to the nearest mapped rail station or rail yard. Does not confirm freight siding access or rake capacity.",
          source: osmSource(osm.manifest),
        })
      : missingMetric(
          "infra.nearest_rail",
          "Nearest rail (station/yard)",
          "infrastructure",
          "m",
          "cost",
          `No mapped rail station or yard within ${MAX_SEARCH_METRES / 1000} km.`,
          missingSource("Outside OSM ingestion coverage area."),
        ),
  );

  const airport = nearestOfCategory(point, osm.pois, "airport");
  metrics.push(
    airport
      ? defineMetric({
          key: "infra.nearest_airport",
          label: "Nearest airport",
          category: "infrastructure",
          raw_value: airport.distance_m,
          raw_text: airport.feature.name,
          unit: "m",
          direction: "cost",
          normalized_value: normalizeLinear(airport.distance_m, 5_000, 60_000, "cost"),
          confidence: 0.8,
          status: "ok",
          calculation_note: "Straight-line distance to the nearest mapped aerodrome.",
          source: osmSource(osm.manifest),
        })
      : missingMetric(
          "infra.nearest_airport",
          "Nearest airport",
          "infrastructure",
          "m",
          "cost",
          `No mapped aerodrome within ${MAX_SEARCH_METRES / 1000} km.`,
          missingSource("Outside OSM ingestion coverage area."),
        ),
  );

  const power = nearestOfCategory(point, osm.pois, "power_substation");
  metrics.push(
    power
      ? defineMetric({
          key: "infra.nearest_power_substation",
          label: "Nearest power substation",
          category: "infrastructure",
          raw_value: power.distance_m,
          raw_text: power.feature.name,
          unit: "m",
          direction: "cost",
          normalized_value: normalizeLinear(power.distance_m, 1_500, 15_000, "cost"),
          confidence: 0.65,
          status: "ok",
          calculation_note:
            "Straight-line distance to the nearest mapped grid substation. Does not confirm available load capacity for a Grade-A facility's power draw.",
          source: osmSource(osm.manifest),
        })
      : missingMetric(
          "infra.nearest_power_substation",
          "Nearest power substation",
          "infrastructure",
          "m",
          "cost",
          `No mapped substation within ${MAX_SEARCH_METRES / 1000} km.`,
          missingSource("Outside OSM ingestion coverage area."),
        ),
  );

  const cluster = nearestOfCategory(point, osm.pois, "industrial_zone");
  metrics.push(
    cluster
      ? defineMetric({
          key: "infra.industrial_cluster_proximity",
          label: "Nearest industrial cluster boundary",
          category: "infrastructure",
          raw_value: cluster.distance_m,
          raw_text: cluster.feature.name,
          unit: "m",
          direction: "cost",
          normalized_value: normalizeLinear(cluster.distance_m, 500, 10_000, "cost"),
          confidence: 0.7,
          status: "ok",
          calculation_note:
            "Straight-line distance to the nearest mapped landuse=industrial area (e.g. an MIDC zone boundary point).",
          source: osmSource(osm.manifest),
        })
      : missingMetric(
          "infra.industrial_cluster_proximity",
          "Nearest industrial cluster boundary",
          "infrastructure",
          "m",
          "cost",
          `No mapped industrial zone within ${MAX_SEARCH_METRES / 1000} km.`,
          missingSource("Outside OSM ingestion coverage area."),
        ),
  );

  return metrics;
}
