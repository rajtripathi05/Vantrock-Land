/**
 * ACCESSIBILITY metrics.
 *
 * Straight-line distances to the road network come from the preloaded OSM
 * snapshot, computed synchronously and purely, like every other metric
 * builder. Route distance/time additionally accept a `RouteOutcome` that the
 * caller (lib/ai/tools.ts) fetches live from a RoutingProvider BEFORE
 * calling into the (still synchronous, still I/O-free) analysis engine —
 * the same "pre-fetch, then pass a pure value in" pattern already used for
 * the OSM dataset itself.
 */

import type { Metric, Site } from "@/types/domain";
import type { OsmDataset, OsmRoad } from "@/lib/data/osm/types";
import { MAJOR_HIGHWAY_CLASSES } from "@/lib/data/osm/types";
import type { Position } from "@/types/geojson";
import { nearestPolyline, nearestVertex } from "@/lib/geo/nearest";
import type { RouteResult } from "@/lib/providers/routing/types";
import { normalizeLinear } from "../benchmarks";
import { defineMetric, missingMetric } from "../metric";
import { osmSource, missingSource, routingSource } from "../sources";
import type { RoutingProvider } from "@/lib/providers/routing/types";

/** Beyond this, treat "no road found" as missing rather than a huge number. */
const MAX_SEARCH_METRES = 50_000;

export interface NearestHighwayResult {
  feature: OsmRoad;
  distance_m: number;
  /** Nearest vertex of the highway polyline — a usable routing waypoint. */
  nearest_point: Position;
}

/**
 * Nearest mapped motorway/trunk/primary road to a site, plus a routing
 * waypoint on it. Exported so the caller can resolve a route destination
 * BEFORE building metrics, without duplicating this spatial search.
 */
export function findNearestHighway(site: Site, osm: OsmDataset): NearestHighwayResult | null {
  const [lon, lat] = site.measurements.centroid.coordinates;
  const majorRoads = osm.roads.filter((road) => MAJOR_HIGHWAY_CLASSES.includes(road.highway));
  const nearest = nearestPolyline([lon, lat], majorRoads, MAX_SEARCH_METRES);
  if (!nearest) return null;
  const vertex = nearestVertex([lon, lat], nearest.feature.coordinates);
  if (!vertex) return null;
  return { feature: nearest.feature, distance_m: nearest.distance_m, nearest_point: vertex };
}

/**
 * Outcome of a route-fetch attempt, pre-computed by the caller:
 *  - `undefined` (parameter omitted): routing was never attempted (e.g. a
 *    direct unit test of this module, or `getIsochrone`/site outside
 *    coverage) — reports the original "no routing provider" reason.
 *  - `null`: routing was attempted but returned no result (network error,
 *    timeout, or the OSRM demo server had no route) — reports a distinct
 *    "attempted, unavailable" reason.
 *  - `RouteResult`: a real route was fetched.
 */
export type RouteOutcome = RouteResult | null;

export function buildAccessibilityMetrics(
  site: Site,
  osm: OsmDataset,
  routeOutcome?: RouteOutcome,
  routingProvider?: RoutingProvider,
): Metric[] {
  const [lon, lat] = site.measurements.centroid.coordinates;
  const metrics: Metric[] = [];

  const nearestRoad = nearestPolyline(
    [lon, lat],
    osm.roads,
    MAX_SEARCH_METRES,
  );
  if (nearestRoad) {
    metrics.push(
      defineMetric({
        key: "access.nearest_road_distance",
        label: "Nearest road (straight-line)",
        category: "accessibility",
        raw_value: nearestRoad.distance_m,
        raw_text: nearestRoad.feature.name ?? nearestRoad.feature.ref ?? nearestRoad.feature.highway,
        unit: "m",
        direction: "cost",
        normalized_value: normalizeLinear(nearestRoad.distance_m, 0, 1500, "cost"),
        confidence: 0.75,
        status: "ok",
        calculation_note:
          "Straight-line (geodesic) distance from the site centroid to the nearest mapped road segment of class motorway/trunk/primary/secondary. NOT a route distance — see lib/geo/nearest.ts.",
        source: osmSource(osm.manifest),
      }),
    );
  } else {
    metrics.push(
      missingMetric(
        "access.nearest_road_distance",
        "Nearest road (straight-line)",
        "accessibility",
        "m",
        "cost",
        `No mapped road found within ${MAX_SEARCH_METRES / 1000} km. The site likely falls outside the preloaded OSM coverage area (Pune / Chakan / Talegaon corridor).`,
        missingSource("Outside OSM ingestion coverage area."),
      ),
    );
  }

  const nearestHighway = findNearestHighway(site, osm);
  if (nearestHighway) {
    metrics.push(
      defineMetric({
        key: "access.nearest_highway_distance",
        label: "Nearest highway (straight-line)",
        category: "accessibility",
        raw_value: nearestHighway.distance_m,
        raw_text:
          nearestHighway.feature.ref ?? nearestHighway.feature.name ?? nearestHighway.feature.highway,
        unit: "m",
        direction: "cost",
        normalized_value: normalizeLinear(nearestHighway.distance_m, 0, 8_000, "cost"),
        confidence: 0.75,
        status: "ok",
        calculation_note:
          "Straight-line distance to the nearest mapped motorway/trunk/primary road (national/state highway proxy). NOT a route distance.",
        source: osmSource(osm.manifest),
      }),
    );
  } else {
    metrics.push(
      missingMetric(
        "access.nearest_highway_distance",
        "Nearest highway (straight-line)",
        "accessibility",
        "m",
        "cost",
        `No mapped motorway/trunk/primary road found within ${MAX_SEARCH_METRES / 1000} km.`,
        missingSource("Outside OSM ingestion coverage area."),
      ),
    );
  }

  metrics.push(...buildRouteMetrics(nearestHighway, routeOutcome, routingProvider));

  return metrics;
}

function buildRouteMetrics(
  nearestHighway: NearestHighwayResult | null,
  routeOutcome: RouteOutcome | undefined,
  routingProvider: RoutingProvider | undefined,
): Metric[] {
  if (routeOutcome && routingProvider) {
    const source = routingSource(routingProvider);
    const note = `ORDINARY ROAD ACCESS PROXY — ordinary passenger-vehicle route (not truck routing) from the site centroid to the nearest mapped highway (${nearestHighway?.feature.ref ?? nearestHighway?.feature.name ?? "unnamed"}), computed live via ${routingProvider.label}.`;
    return [
      defineMetric({
        key: "access.route_distance",
        label: "Route distance to highway (ordinary vehicle)",
        category: "accessibility",
        raw_value: routeOutcome.distance_m,
        unit: "m",
        direction: "cost",
        normalized_value: normalizeLinear(routeOutcome.distance_m, 0, 10_000, "cost"),
        confidence: routingProvider.confidence,
        status: "ok",
        calculation_note: note,
        source,
      }),
      defineMetric({
        key: "access.route_time",
        label: "Route time to highway (ordinary vehicle)",
        category: "accessibility",
        raw_value: routeOutcome.duration_s / 60,
        unit: "min",
        direction: "cost",
        normalized_value: normalizeLinear(routeOutcome.duration_s / 60, 0, 20, "cost"),
        confidence: routingProvider.confidence,
        status: "ok",
        calculation_note: note,
        source,
      }),
    ];
  }

  const reason =
    routeOutcome === undefined
      ? "No routing provider was configured for this analysis run. Straight-line distance is reported separately and must not be read as a route distance."
      : "The routing provider (OSRM public demo server) returned no route — the request failed, timed out, or no road-network path was found from this site. Straight-line distance is reported separately and must not be read as a route distance.";
  const sourceNote =
    routeOutcome === undefined
      ? "RoutingProvider not configured for this call."
      : "RoutingProvider attempted, no result — see docs/API_CATALOGUE.md.";

  return [
    missingMetric(
      "access.route_distance",
      "Route distance to highway (ordinary vehicle)",
      "accessibility",
      "m",
      "cost",
      reason,
      missingSource(sourceNote),
    ),
    missingMetric(
      "access.route_time",
      "Route time to highway (ordinary vehicle)",
      "accessibility",
      "min",
      "cost",
      reason,
      missingSource(sourceNote),
    ),
  ];
}
