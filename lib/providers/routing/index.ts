/**
 * RoutingProvider factory — one place that decides which implementation
 * backs route distance/time, mirroring lib/providers/basemap/index.ts.
 *
 * Today there is exactly one implementation (the free OSRM public demo
 * server). A self-hosted OSRM instance or a commercial truck-routing
 * provider slots in here later without touching any caller.
 */

import { osrmDemoRoutingProvider } from "./osrm";
import type { RoutingProvider } from "./types";

export function getRoutingProvider(): RoutingProvider {
  return osrmDemoRoutingProvider;
}

export type { RouteResult, RoutingMode, RoutingProvider } from "./types";
