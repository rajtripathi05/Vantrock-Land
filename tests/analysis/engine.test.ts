import { describe, expect, it } from "vitest";
import { runSiteAnalysis } from "@/lib/analysis/engine";
import { scoreSite } from "@/lib/scoring/engine";
import { DEFAULT_WEIGHT_PROFILE } from "@/lib/scoring/weights";
import { measureGeometry } from "@/lib/geo/measure";
import { CHAKAN_SITE, graticuleRing } from "../fixtures/geometry";
import type { OsmDataset } from "@/lib/data/osm/types";
import type { Project, Site } from "@/types/domain";
import type { RoutingProvider } from "@/lib/providers/routing/types";

const FIXTURE_ROUTING_PROVIDER: RoutingProvider = {
  id: "test_routing_v1",
  label: "Test routing provider",
  provider: "Test fixture",
  mode: "ordinary_vehicle",
  usageWarning: null,
  confidence: 0.65,
  async getRoute() {
    return { distance_m: 4_200, duration_s: 360 };
  },
  async getDistance() {
    return 4_200;
  },
  async getDuration() {
    return 360;
  },
  async getIsochrone() {
    return null;
  },
};

function makeSite(overrides: Partial<Site> = {}): Site {
  const geometry = overrides.geometry ?? CHAKAN_SITE;
  return {
    id: "site-1",
    project_id: "project-1",
    name: "Candidate Site A",
    source_type: "drawn_polygon",
    geometry,
    point_origin: null,
    buffer_radius_m: null,
    measurements: measureGeometry(geometry),
    land_price_per_acre_inr: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    owner_id: "local-analyst",
    name: "Chakan Logistics",
    asset_class: "grade_a_logistics",
    target_gfa_sqft: 500_000,
    region_label: "Pune / Chakan / Talegaon",
    working_srid: 32643,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const FIXTURE_MANIFEST: OsmDataset["manifest"] = {
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
  pois: { count: 1, by_category: {}, file: "pois.json" },
  places: { count: 0, file: "places.json" },
  notes: "",
};

function makeOsmDataset(overrides: Partial<OsmDataset> = {}): OsmDataset {
  return {
    manifest: FIXTURE_MANIFEST,
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
    pois: [
      { id: "node/1", category: "warehouse", name: "Test Warehouse", lon: 73.858, lat: 18.761 },
      { id: "node/2", category: "industrial_zone", name: "Chakan MIDC", lon: 73.862, lat: 18.7606 },
      { id: "node/3", category: "rail_station", name: "Talegaon Station", lon: 73.675, lat: 18.735 },
    ],
    ...overrides,
  };
}

describe("runSiteAnalysis", () => {
  it("produces a complete run with metrics across every category", () => {
    const site = makeSite();
    const project = makeProject();
    const osm = makeOsmDataset();

    const analysis = runSiteAnalysis(site, project, osm);

    expect(analysis.run.status).toBe("complete");
    expect(analysis.run.site_id).toBe(site.id);
    expect(analysis.site).toBe(site);
    expect(analysis.score).toBeNull();

    const categories = new Set(analysis.metrics.map((m) => m.category));
    expect(categories).toEqual(
      new Set([
        "geography",
        "accessibility",
        "infrastructure",
        "infrastructure_future",
        "market",
        "labour",
        "climate",
        "hazard",
      ]),
    );
  });

  it("labour reports missing when no places exist; climate reports values from demo provider", () => {
    const analysis = runSiteAnalysis(makeSite(), makeProject(), makeOsmDataset());
    const labour = analysis.metrics.filter((m) => m.category === "labour");
    const climate = analysis.metrics.filter((m) => m.category === "climate" || m.category === "hazard");

    for (const metric of labour) {
      expect(metric.status).toBe("missing");
      expect(metric.raw_value).toBeNull();
    }
    for (const metric of climate) {
      expect(metric.status).toBe("ok");
      expect(metric.raw_value).not.toBeNull();
    }
  });

  it("climate/hazard metrics report values from the demo provider", () => {
    const analysis = runSiteAnalysis(
      makeSite(),
      makeProject(),
      makeOsmDataset({
        places: [{ id: "node/1", place: "town", name: "Chakan", population: 41_100, lon: 73.862, lat: 18.762 }],
      }),
    );
    const climate = analysis.metrics.filter((m) => m.category === "climate" || m.category === "hazard");
    expect(climate.length).toBeGreaterThan(0);
    for (const metric of climate) {
      expect(metric.status).toBe("ok");
      expect(metric.raw_value).not.toBeNull();
      expect(metric.source.classification).toBe("CURATED");
    }
  });

  it("sums population of OSM-tagged places within the labour catchment radius", () => {
    const site = makeSite(); // centroid inside CHAKAN_SITE
    const analysis = runSiteAnalysis(
      site,
      makeProject(),
      makeOsmDataset({
        places: [
          // Within ~15km of the Chakan fixture site.
          { id: "node/1", place: "town", name: "Chakan", population: 41_100, lon: 73.862, lat: 18.762 },
          // Far away (>15km) — must not be counted.
          { id: "node/2", place: "city", name: "Faraway", population: 1_000_000, lon: 74.5, lat: 19.5 },
        ],
      }),
    );
    const population = analysis.metrics.find((m) => m.key === "labour.population_proxy");
    expect(population?.status).toBe("ok");
    expect(population?.raw_value).toBe(41_100);
    expect(population?.source.classification).toBe("PRELOADED");
    expect(population?.calculation_note).toMatch(/POPULATION PROXY/);

    // labour_proxy stays honestly missing even when population is available.
    const labourProxy = analysis.metrics.find((m) => m.key === "labour.labour_proxy");
    expect(labourProxy?.status).toBe("missing");
  });

  it("reports population_proxy as missing when no place is within the catchment radius", () => {
    const analysis = runSiteAnalysis(
      makeSite(),
      makeProject(),
      makeOsmDataset({
        places: [{ id: "node/2", place: "city", name: "Faraway", population: 1_000_000, lon: 74.5, lat: 19.5 }],
      }),
    );
    const population = analysis.metrics.find((m) => m.key === "labour.population_proxy");
    expect(population?.status).toBe("missing");
    expect(population?.raw_value).toBeNull();
  });

  it("computes geography metrics directly from the stored measurements", () => {
    const site = makeSite();
    const analysis = runSiteAnalysis(site, makeProject(), makeOsmDataset());
    const area = analysis.metrics.find((m) => m.key === "geo.site_area");
    expect(area?.raw_value).toBe(site.measurements.area_sqm);
    expect(area?.status).toBe("ok");
    expect(area?.source.classification).toBe("DERIVED");
  });

  it("finds the nearest road and highway from the OSM dataset", () => {
    const analysis = runSiteAnalysis(makeSite(), makeProject(), makeOsmDataset());
    const road = analysis.metrics.find((m) => m.key === "access.nearest_road_distance");
    const highway = analysis.metrics.find((m) => m.key === "access.nearest_highway_distance");
    expect(road?.status).toBe("ok");
    expect(road?.raw_value).toBeGreaterThan(0);
    expect(highway?.status).toBe("ok");
    expect(highway?.source.classification).toBe("PRELOADED");
  });

  it("reports route distance/time as explicit missing when no route outcome is supplied", () => {
    const analysis = runSiteAnalysis(makeSite(), makeProject(), makeOsmDataset());
    const routeDistance = analysis.metrics.find((m) => m.key === "access.route_distance");
    const routeTime = analysis.metrics.find((m) => m.key === "access.route_time");
    expect(routeDistance?.status).toBe("missing");
    expect(routeTime?.status).toBe("missing");
  });

  it("reports route distance/time as explicit missing when the route was attempted but unavailable", () => {
    const analysis = runSiteAnalysis(makeSite(), makeProject(), makeOsmDataset(), null, FIXTURE_ROUTING_PROVIDER);
    const routeDistance = analysis.metrics.find((m) => m.key === "access.route_distance");
    expect(routeDistance?.status).toBe("missing");
    expect(routeDistance?.calculation_note).toMatch(/no result|no road-network path|failed|timed out/i);
  });

  it("reports a real route distance/time when a route outcome is supplied", () => {
    const analysis = runSiteAnalysis(
      makeSite(),
      makeProject(),
      makeOsmDataset(),
      { distance_m: 4_200, duration_s: 360 },
      FIXTURE_ROUTING_PROVIDER,
    );
    const routeDistance = analysis.metrics.find((m) => m.key === "access.route_distance");
    const routeTime = analysis.metrics.find((m) => m.key === "access.route_time");
    expect(routeDistance?.status).toBe("ok");
    expect(routeDistance?.raw_value).toBe(4_200);
    expect(routeDistance?.source.classification).toBe("LIVE");
    expect(routeDistance?.calculation_note).toMatch(/ORDINARY ROAD ACCESS PROXY/);
    expect(routeTime?.status).toBe("ok");
    expect(routeTime?.raw_value).toBeCloseTo(6); // 360s -> 6 min
  });

  it("warns when the site falls outside the OSM coverage bbox", () => {
    const outsideGeometry = {
      type: "MultiPolygon" as const,
      coordinates: [[graticuleRing(77.0, 12.9, 77.01, 12.91)]], // Bengaluru — outside fixture bbox
    };
    const site = makeSite({ geometry: outsideGeometry, measurements: measureGeometry(outsideGeometry) });
    const analysis = runSiteAnalysis(site, makeProject(), makeOsmDataset());
    expect(analysis.warnings.some((w) => w.code === "OUTSIDE_OSM_COVERAGE")).toBe(true);
  });

  it("computes coverage as the fraction of metrics with status ok", () => {
    const analysis = runSiteAnalysis(makeSite(), makeProject(), makeOsmDataset());
    const okCount = analysis.metrics.filter((m) => m.status === "ok").length;
    expect(analysis.run.coverage).toBeCloseTo(okCount / analysis.metrics.length);
    expect(analysis.run.coverage).toBeGreaterThan(0);
    expect(analysis.run.coverage).toBeLessThan(1);
  });

  it("scores higher when a route metric is ok than when the same run has it missing", () => {
    const site = makeSite();
    const project = makeProject();
    const osm = makeOsmDataset();

    const withoutRoute = runSiteAnalysis(site, project, osm);
    const scoreWithoutRoute = scoreSite(withoutRoute.metrics, DEFAULT_WEIGHT_PROFILE);
    const routeBreakdown = scoreWithoutRoute.breakdown.find((b) => b.metric_key === "access.route_distance");
    expect(routeBreakdown?.status).toBe("missing");
    expect(scoreWithoutRoute.coverage).toBeLessThan(1);

    const withRoute = runSiteAnalysis(
      site,
      project,
      osm,
      { distance_m: 2_000, duration_s: 150 },
      FIXTURE_ROUTING_PROVIDER,
    );
    const scoreWithRoute = scoreSite(withRoute.metrics, DEFAULT_WEIGHT_PROFILE);
    const includedBreakdown = scoreWithRoute.breakdown.find((b) => b.metric_key === "access.route_distance");
    expect(includedBreakdown?.status).toBe("ok");
    expect(scoreWithRoute.coverage).toBeGreaterThan(scoreWithoutRoute.coverage);
  });

  it("is deterministic: identical inputs produce identical metric values", () => {
    const site = makeSite();
    const project = makeProject();
    const osm = makeOsmDataset();
    const first = runSiteAnalysis(site, project, osm);
    const second = runSiteAnalysis(site, project, osm);
    const strip = (a: ReturnType<typeof runSiteAnalysis>) =>
      a.metrics.map((m) => ({ key: m.key, raw_value: m.raw_value, status: m.status }));
    expect(strip(first)).toEqual(strip(second));
  });
});
