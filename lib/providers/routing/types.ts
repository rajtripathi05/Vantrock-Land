/**
 * RoutingProvider — real road-network route distance/time behind an
 * interface, so the analysis engine and UI never depend on a specific
 * routing backend (blueprint rule 19: keep provider interfaces
 * replaceable).
 *
 * IMPORTANT: every implementation of this interface routes an ORDINARY
 * PASSENGER VEHICLE unless `mode` says otherwise. Heavy-truck routing
 * (turn radii, weight/height restrictions, axle load) is a materially
 * different problem this MVP does not solve — see docs/API_CATALOGUE.md.
 * Callers must label output "ORDINARY ROAD ACCESS PROXY", never "truck
 * route", until a real truck-routing provider is configured.
 */

import type { Position, PolygonGeometry } from "@/types/geojson";

export type RoutingMode = "ordinary_vehicle";

export interface RouteResult {
  distance_m: number;
  duration_s: number;
}

export interface RoutingProvider {
  readonly id: string;
  readonly label: string;
  readonly provider: string;
  readonly mode: RoutingMode;
  /** Shown in the UI whenever this provider has a usage-policy caveat. */
  readonly usageWarning: string | null;
  /** How much to trust a successful result from this provider, 0..1. */
  readonly confidence: number;

  /** Full route: distance and duration together, one request. */
  getRoute(origin: Position, destination: Position): Promise<RouteResult | null>;
  getDistance(origin: Position, destination: Position): Promise<number | null>;
  getDuration(origin: Position, destination: Position): Promise<number | null>;
  /**
   * Reachable-area polygon within `seconds` of `origin`. Not every provider
   * supports this — OSRM's public demo does not expose an isochrone
   * service, so the OSRM implementation always resolves `null`. Kept in the
   * interface so a future isochrone-capable provider (e.g. OpenRouteService)
   * slots in without an interface change.
   */
  getIsochrone(origin: Position, seconds: number): Promise<PolygonGeometry | null>;
}
