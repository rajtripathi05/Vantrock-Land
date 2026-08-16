/**
 * OSRM routing provider — the free/open candidate named in
 * docs/API_CATALOGUE.md, using the public OSRM demo server
 * (router.project-osrm.org). Free, keyless, no account.
 *
 * USAGE POLICY: the public demo server is explicitly for light,
 * non-commercial, low-volume use — the same posture this codebase already
 * takes with the OSMF dev tile servers and the Overpass API (see
 * lib/providers/basemap/index.ts). It is NOT a production SLA. A production
 * deployment should self-host OSRM (see docs/MANUAL_ACTIONS.md) and swap
 * the base URL below — the RoutingProvider interface does not change.
 *
 * Vehicle profile: "driving" — an ordinary passenger car. OSRM's public demo
 * only serves the driving/walking/cycling profiles; there is no truck
 * profile without a custom OSRM build with a truck routing profile and
 * restriction data, which this MVP does not have. Every consumer of this
 * provider must label its output "ORDINARY ROAD ACCESS PROXY", never a
 * truck route.
 */

import type { Position } from "@/types/geojson";
import type { RouteResult, RoutingProvider } from "./types";

const OSRM_BASE_URL = "https://router.project-osrm.org";
const REQUEST_TIMEOUT_MS = 7_000;

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{ distance: number; duration: number }>;
}

async function fetchOsrmRoute(origin: Position, destination: Position): Promise<RouteResult | null> {
  const coords = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=false&alternatives=false&steps=false`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const body = (await response.json()) as OsrmRouteResponse;
    const route = body.routes?.[0];
    if (body.code !== "Ok" || !route) return null;
    return { distance_m: route.distance, duration_s: route.duration };
  } catch {
    // Network error, timeout, or malformed response — the caller treats
    // this exactly like "no route available", never a thrown failure that
    // could break the rest of the site analysis.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * In-memory memoization keyed by rounded origin/destination (~10 m
 * precision) so repeated analysis runs against the same site/highway pair
 * in one session don't re-hit the demo server. Not persisted — a page
 * reload starts cold, same as the OSM dataset's in-module cache.
 */
const routeCache = new Map<string, Promise<RouteResult | null>>();

function cacheKey(origin: Position, destination: Position): string {
  const round = (n: number) => n.toFixed(4);
  return `${round(origin[0])},${round(origin[1])}->${round(destination[0])},${round(destination[1])}`;
}

export const osrmDemoRoutingProvider: RoutingProvider = {
  id: "osrm_demo_v1",
  label: "OSRM (public demo server)",
  provider: "Project OSRM — router.project-osrm.org",
  mode: "ordinary_vehicle",
  usageWarning:
    "Routing uses the free public OSRM demo server, intended for light/non-commercial use — not a production SLA. Ordinary passenger-vehicle routing only, not truck routing.",
  confidence: 0.65,

  async getRoute(origin, destination) {
    const key = cacheKey(origin, destination);
    let pending = routeCache.get(key);
    if (!pending) {
      pending = fetchOsrmRoute(origin, destination);
      routeCache.set(key, pending);
      pending.then((result) => {
        if (result === null) routeCache.delete(key);
      }).catch(() => routeCache.delete(key));
    }
    return pending;
  },

  async getDistance(origin, destination) {
    const route = await this.getRoute(origin, destination);
    return route?.distance_m ?? null;
  },

  async getDuration(origin, destination) {
    const route = await this.getRoute(origin, destination);
    return route?.duration_s ?? null;
  },

  async getIsochrone() {
    // Not supported by the OSRM public demo server (no /isochrone
    // endpoint) — honestly returns null rather than approximating one.
    return null;
  },
};

/** Test-only: clear the in-module route cache between test cases. */
export function resetOsrmRouteCacheForTests(): void {
  routeCache.clear();
}
