/**
 * MARKET / INDUSTRIAL CONTEXT metrics.
 *
 * Proximity to an existing industrial cluster is a genuine leasing/exit
 * signal for Grade-A logistics: tenants and 3PLs cluster, and lenders read
 * "how many warehouses are already here" as a market-depth proxy. Counts come
 * straight from the preloaded OSM snapshot; density is a DERIVED figure
 * computed from those counts.
 */

import type { Metric, Site } from "@/types/domain";
import type { OsmDataset } from "@/lib/data/osm/types";
import { pointsWithinRadius } from "@/lib/geo/nearest";
import { normalizeLinear } from "../benchmarks";
import { defineMetric } from "../metric";
import { osmDerivedSource, osmSource } from "../sources";

const CONTEXT_RADIUS_M = 2_000;
const INDUSTRIAL_CATEGORIES = new Set(["industrial_zone", "warehouse", "industrial_facility"]);

export function buildMarketMetrics(site: Site, osm: OsmDataset): Metric[] {
  const [lon, lat] = site.measurements.centroid.coordinates;
  const nearby = pointsWithinRadius([lon, lat], osm.pois, CONTEXT_RADIUS_M);
  const industrialNearby = nearby.filter((poi) => INDUSTRIAL_CATEGORIES.has(poi.category));

  const areaSqKm = (Math.PI * CONTEXT_RADIUS_M * CONTEXT_RADIUS_M) / 1_000_000;
  const densityPerSqKm = industrialNearby.length / areaSqKm;

  return [
    defineMetric({
      key: "market.poi_count_2km",
      label: `Mapped POIs within ${CONTEXT_RADIUS_M / 1000} km`,
      category: "market",
      raw_value: nearby.length,
      unit: "count",
      direction: "benefit",
      normalized_value: normalizeLinear(nearby.length, 40, 0, "benefit"),
      confidence: 0.7,
      status: "ok",
      calculation_note: `Count of preloaded OSM points of interest (industrial, warehouse, rail, airport, fuel, power) within ${CONTEXT_RADIUS_M} m straight-line of the site centroid.`,
      source: osmSource(osm.manifest),
    }),
    defineMetric({
      key: "market.industrial_poi_count_2km",
      label: `Industrial/warehouse POIs within ${CONTEXT_RADIUS_M / 1000} km`,
      category: "market",
      raw_value: industrialNearby.length,
      unit: "count",
      direction: "benefit",
      normalized_value: normalizeLinear(industrialNearby.length, 15, 0, "benefit"),
      confidence: 0.7,
      status: "ok",
      calculation_note: `Count of preloaded OSM features tagged landuse=industrial, building=warehouse, or industrial=* within ${CONTEXT_RADIUS_M} m of the site centroid.`,
      source: osmSource(osm.manifest),
    }),
    defineMetric({
      key: "market.industrial_density_proxy",
      label: "Industrial context density (proxy)",
      category: "market",
      raw_value: densityPerSqKm,
      raw_text: `${densityPerSqKm.toFixed(1)} features / km²`,
      unit: "count/sqkm",
      direction: "benefit",
      normalized_value: normalizeLinear(densityPerSqKm, 4, 0, "benefit"),
      confidence: 0.55,
      status: "ok",
      calculation_note: `Industrial/warehouse POI count within ${CONTEXT_RADIUS_M} m, divided by the search circle's area (${areaSqKm.toFixed(2)} km²). A density proxy, not a verified market-depth study.`,
      source: osmDerivedSource(
        osm.manifest,
        "Computed from preloaded OSM point counts, not from a market survey or leasing database.",
      ),
    }),
  ];
}
