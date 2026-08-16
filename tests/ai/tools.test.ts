/**
 * AnalysisTools routing integration. NO NETWORK — uses a fixture
 * RoutingProvider, never the real OSRM provider (per tests/setup.ts).
 * Exercises the resolveRoute() wiring in lib/ai/tools.ts: a configured
 * provider produces an "ok" route metric, a disabled/missing route
 * degrades cleanly to "missing" without breaking the rest of the analysis.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@/lib/app/services/projects";
import { createSite } from "@/lib/app/services/sites";
import { LocalApiClient } from "@/lib/client/local-api";
import { AnalysisTools } from "@/lib/ai/tools";
import { ACCESSIBILITY_FOCUSED_WEIGHT_PROFILE, DEFAULT_WEIGHT_PROFILE } from "@/lib/scoring/weights";
import { freshRepositories } from "../helpers/repositories";
import { graticuleRing } from "../fixtures/geometry";
import type { RepositoryBundle } from "@/lib/repositories/types";
import type { OsmDataset } from "@/lib/data/osm/types";
import type { RoutingProvider } from "@/lib/providers/routing/types";
import type { Project } from "@/types/domain";

let repositories: RepositoryBundle;
let project: Project;
let siteId: string;

const OSM: OsmDataset = {
  manifest: {
    source_id: "osm_test_fixture",
    name: "OSM fixture",
    provider: "Test fixture",
    source_url: "https://www.openstreetmap.org",
    license: "ODbL 1.0",
    attribution: "© OpenStreetMap contributors",
    classification: "PRELOADED",
    geography: "Test",
    bbox: [73.5, 18.4, 74.1, 18.9],
    format: "test",
    data_timestamp: "2026-01-01T00:00:00.000Z",
    retrieved_at: "2026-01-01T00:00:00.000Z",
    version: 1,
    roads: { count: 1, by_class: { primary: 1 }, file: "roads.json" },
    pois: { count: 0, by_category: {}, file: "pois.json" },
    places: { count: 0, file: "places.json" },
    notes: "",
  },
  places: [],
  roads: [
    {
      id: "way/1",
      highway: "primary",
      name: "NH60",
      ref: "NH60",
      oneway: false,
      coordinates: [
        [73.86, 18.7],
        [73.86, 18.8],
      ],
    },
  ],
  pois: [],
};

const FIXTURE_PROVIDER: RoutingProvider = {
  id: "test_routing_v1",
  label: "Test routing provider",
  provider: "Test fixture",
  mode: "ordinary_vehicle",
  usageWarning: null,
  confidence: 0.7,
  async getRoute() {
    return { distance_m: 3_500, duration_s: 280 };
  },
  async getDistance() {
    return 3_500;
  },
  async getDuration() {
    return 280;
  },
  async getIsochrone() {
    return null;
  },
};

beforeEach(async () => {
  repositories = await freshRepositories();
  const createdProject = await createProject(repositories, {
    name: "Pune Logistics Q3 2026",
    asset_class: "grade_a_logistics",
    target_gfa_sqft: 500_000,
    region_label: "Pune / Chakan / Talegaon",
  });
  if (!createdProject.ok) throw new Error("project fixture failed");
  project = createdProject.value;

  const createdSite = await createSite(repositories, {
    project_id: project.id,
    name: "Candidate Site A",
    source_type: "drawn_polygon",
    geometry: {
      type: "Polygon",
      coordinates: [graticuleRing(73.8567, 18.7606, 73.8597, 18.76347)],
    },
  });
  if (!createdSite.ok) throw new Error("site fixture failed");
  siteId = createdSite.value.site.id;
});

describe("AnalysisTools routing integration", () => {
  it("reports route metrics as ok when a routing provider resolves a route", async () => {
    const tools = new AnalysisTools({
      api: new LocalApiClient(repositories),
      osm: OSM,
      routing: FIXTURE_PROVIDER,
    });
    const result = await tools.getSiteAnalysis(siteId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const routeDistance = result.value.metrics.find((m) => m.key === "access.route_distance");
    expect(routeDistance?.status).toBe("ok");
    expect(routeDistance?.raw_value).toBe(3_500);
    expect(routeDistance?.source.classification).toBe("LIVE");
  });

  it("reports route metrics as missing (not configured) when routing is explicitly disabled", async () => {
    const tools = new AnalysisTools({
      api: new LocalApiClient(repositories),
      osm: OSM,
      routing: null,
    });
    const result = await tools.getSiteAnalysis(siteId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const routeDistance = result.value.metrics.find((m) => m.key === "access.route_distance");
    expect(routeDistance?.status).toBe("missing");
    expect(routeDistance?.calculation_note).toMatch(/no routing provider/i);
  });

  it("degrades to missing, not a thrown error, when the routing provider itself throws", async () => {
    const throwingProvider: RoutingProvider = {
      ...FIXTURE_PROVIDER,
      async getRoute() {
        throw new Error("simulated provider failure");
      },
    };
    const tools = new AnalysisTools({
      api: new LocalApiClient(repositories),
      osm: OSM,
      routing: throwingProvider,
    });
    const result = await tools.getSiteAnalysis(siteId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const routeDistance = result.value.metrics.find((m) => m.key === "access.route_distance");
    expect(routeDistance?.status).toBe("missing");
  });

  it("rescoring for a different weight profile never re-fetches the route or re-runs spatial queries", async () => {
    const getRouteSpy = vi.fn(async () => ({ distance_m: 3_500, duration_s: 280 }));
    const spiedProvider = { ...FIXTURE_PROVIDER, getRoute: getRouteSpy };
    const tools = new AnalysisTools(
      { api: new LocalApiClient(repositories), osm: OSM, routing: spiedProvider },
      DEFAULT_WEIGHT_PROFILE,
    );

    const first = await tools.getSiteAnalysis(siteId);
    expect(first.ok).toBe(true);
    expect(getRouteSpy).toHaveBeenCalledTimes(1);

    tools.setWeightProfile(ACCESSIBILITY_FOCUSED_WEIGHT_PROFILE);
    const second = await tools.getSiteAnalysis(siteId);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    // Route was NOT re-fetched — the metrics/score cache split in lib/ai/tools.ts
    // means a weight-profile change only reruns the cheap scoreSite() step.
    expect(getRouteSpy).toHaveBeenCalledTimes(1);
    // But the score itself DID change, proving the rescore actually happened.
    expect(second.value.score?.score_config_id).toBe(ACCESSIBILITY_FOCUSED_WEIGHT_PROFILE.id);
    expect(second.value.score?.total).not.toBe(first.value.score?.total);
  });
});

describe("AnalysisTools financial overrides (Phase 8)", () => {
  it("threads overrides through getFinancials and getAllFinancialScenarios", async () => {
    const tools = new AnalysisTools({ api: new LocalApiClient(repositories), osm: OSM, routing: null });

    const defaultResult = await tools.getFinancials(siteId, "base");
    const overriddenResult = await tools.getFinancials(siteId, "base", { rent_inr_per_sqft_per_month: 999 });
    expect(defaultResult.ok).toBe(true);
    expect(overriddenResult.ok).toBe(true);
    if (!defaultResult.ok || !overriddenResult.ok) return;
    expect(overriddenResult.value.inputs.rent_inr_per_sqft_per_month.value).toBeCloseTo(999);
    expect(overriddenResult.value.outputs.noi_inr_annual).toBeGreaterThan(
      defaultResult.value.outputs.noi_inr_annual,
    );

    const allScenarios = await tools.getAllFinancialScenarios(siteId, { rent_inr_per_sqft_per_month: 999 });
    expect(allScenarios.ok).toBe(true);
    if (!allScenarios.ok) return;
    for (const scenario of allScenarios.value) {
      expect(scenario.inputs.rent_inr_per_sqft_per_month.classification).toBe("USER_INPUT");
    }
  });
});
