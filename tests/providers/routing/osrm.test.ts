/**
 * OSRM provider tests. NO NETWORK — global fetch is stubbed for every case,
 * per tests/setup.ts's "no test may reach the network" rule. These tests
 * verify the provider's contract (success, non-ok response, malformed body,
 * thrown/aborted fetch all degrade to `null`, never a thrown error) against
 * a fake fetch, not against the real OSRM demo server.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { osrmDemoRoutingProvider, resetOsrmRouteCacheForTests } from "@/lib/providers/routing/osrm";
import type { Position } from "@/types/geojson";

const ORIGIN: Position = [73.8567, 18.5204];
const DESTINATION: Position = [73.8367, 18.6547];

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe("osrmDemoRoutingProvider", () => {
  beforeEach(() => {
    resetOsrmRouteCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns distance and duration from a successful OSRM response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          code: "Ok",
          routes: [{ distance: 21_379.5, duration: 1_272.9 }],
        }),
      ),
    );

    const route = await osrmDemoRoutingProvider.getRoute(ORIGIN, DESTINATION);
    expect(route).toEqual({ distance_m: 21_379.5, duration_s: 1_272.9 });
  });

  it("getDistance / getDuration read from the same route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "Ok", routes: [{ distance: 5_000, duration: 400 }] })),
    );
    await expect(osrmDemoRoutingProvider.getDistance(ORIGIN, DESTINATION)).resolves.toBe(5_000);
    await expect(osrmDemoRoutingProvider.getDuration(ORIGIN, DESTINATION)).resolves.toBe(400);
  });

  it("returns null on a non-ok HTTP response, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false)));
    await expect(osrmDemoRoutingProvider.getRoute(ORIGIN, DESTINATION)).resolves.toBeNull();
  });

  it("returns null when OSRM reports no route (code !== Ok)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ code: "NoRoute", routes: [] })));
    await expect(osrmDemoRoutingProvider.getRoute(ORIGIN, DESTINATION)).resolves.toBeNull();
  });

  it("returns null when fetch throws (network error), never propagates the error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(osrmDemoRoutingProvider.getRoute(ORIGIN, DESTINATION)).resolves.toBeNull();
  });

  it("memoizes a successful route so a second call does not re-fetch", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ code: "Ok", routes: [{ distance: 1_000, duration: 100 }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await osrmDemoRoutingProvider.getRoute(ORIGIN, DESTINATION);
    await osrmDemoRoutingProvider.getRoute(ORIGIN, DESTINATION);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("getIsochrone is honestly unsupported — resolves null, does not throw", async () => {
    await expect(osrmDemoRoutingProvider.getIsochrone(ORIGIN, 600)).resolves.toBeNull();
  });

  it("never claims truck routing", () => {
    expect(osrmDemoRoutingProvider.mode).toBe("ordinary_vehicle");
  });
});
