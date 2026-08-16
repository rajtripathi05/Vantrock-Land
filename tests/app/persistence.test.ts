/**
 * Persistence and reload.
 *
 * The acceptance criterion for this slice is "refresh the browser and the site
 * is still there". simulateReload() drops every in-process handle and
 * reconnects to the same database, which is what a page reload does. Anything
 * that survives that survives F5.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createProject, getProject, listProjects } from "@/lib/app/services/projects";
import { createSite, getSite, listSites } from "@/lib/app/services/sites";
import { LocalApiClient } from "@/lib/client/local-api";
import { freshRepositories, simulateReload } from "../helpers/repositories";
import { graticuleRing } from "../fixtures/geometry";
import type { RepositoryBundle } from "@/lib/repositories/types";

let repositories: RepositoryBundle;

beforeEach(async () => {
  repositories = await freshRepositories();
});

const chakanPolygon = {
  type: "Polygon" as const,
  coordinates: [graticuleRing(73.8567, 18.7606, 73.8597, 18.76347)],
};

describe("survives a browser refresh", () => {
  it("keeps projects across a reload", async () => {
    const created = await createProject(repositories, {
      name: "Pune Logistics Q3 2026",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
      region_label: "Pune / Chakan / Talegaon",
    });
    if (!created.ok) throw new Error("fixture failed");

    const reloaded = await simulateReload();
    const found = await getProject(reloaded, created.value.id);

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toEqual(created.value);
  });

  it("keeps sites, geometry, and measurements byte-for-byte across a reload", async () => {
    const project = await createProject(repositories, {
      name: "Chakan Shortlist",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
    });
    if (!project.ok) throw new Error("fixture failed");

    const created = await createSite(repositories, {
      project_id: project.value.id,
      name: "Candidate Site A",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });
    if (!created.ok) throw new Error("fixture failed");

    const reloaded = await simulateReload();
    const found = await getSite(reloaded, created.value.site.id);

    expect(found.ok).toBe(true);
    if (!found.ok) return;

    // Measurements are stored, not recomputed on read. If they were
    // recomputed, a change to the geometry engine would silently rewrite
    // history — which is exactly what analysis-run immutability forbids.
    expect(found.value).toEqual(created.value.site);
    expect(found.value.geometry).toEqual(created.value.site.geometry);
    expect(found.value.measurements.area_sqm).toBe(created.value.site.measurements.area_sqm);
    expect(found.value.measurements.perimeter_m).toBe(
      created.value.site.measurements.perimeter_m,
    );
    expect(found.value.measurements.centroid).toEqual(created.value.site.measurements.centroid);
  });

  it("keeps all three geometry source types across a reload", async () => {
    const project = await createProject(repositories, {
      name: "Mixed Sources",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
    });
    if (!project.ok) throw new Error("fixture failed");

    await createSite(repositories, {
      project_id: project.value.id,
      name: "Candidate Site A",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });
    await createSite(repositories, {
      project_id: project.value.id,
      name: "Candidate Site B",
      source_type: "drawn_rectangle",
      geometry: {
        type: "Polygon",
        coordinates: [graticuleRing(73.87, 18.77, 73.873, 18.7729)],
      },
    });
    await createSite(repositories, {
      project_id: project.value.id,
      name: "Candidate Site C",
      source_type: "point_buffer",
      geometry: { type: "Point", coordinates: [73.89, 18.79] },
      buffer_radius_m: 300,
    });

    const reloaded = await simulateReload();
    const sites = await listSites(reloaded, project.value.id);

    expect(sites.ok).toBe(true);
    if (!sites.ok) return;
    expect(sites.value).toHaveLength(3);

    const bySourceType = new Map(sites.value.map((s) => [s.source_type, s]));
    expect(bySourceType.get("drawn_polygon")).toBeDefined();
    expect(bySourceType.get("drawn_rectangle")).toBeDefined();

    const point = bySourceType.get("point_buffer");
    expect(point?.point_origin).toEqual({ type: "Point", coordinates: [73.89, 18.79] });
    expect(point?.buffer_radius_m).toBe(300);
    expect(point?.geometry.type).toBe("MultiPolygon");
  });

  it("keeps the project/site relationship across a reload", async () => {
    const first = await createProject(repositories, {
      name: "Chakan",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
    });
    const second = await createProject(repositories, {
      name: "Talegaon",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
    });
    if (!first.ok || !second.ok) throw new Error("fixture failed");

    await createSite(repositories, {
      project_id: first.value.id,
      name: "Candidate Site A",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });

    const reloaded = await simulateReload();
    expect((await listSites(reloaded, first.value.id)).ok).toBe(true);
    expect(((await listSites(reloaded, first.value.id)) as { value: unknown[] }).value).toHaveLength(1);
    expect(
      ((await listSites(reloaded, second.value.id)) as { value: unknown[] }).value,
    ).toHaveLength(0);
  });

  it("lists every project after a reload", async () => {
    for (const name of ["Chakan", "Talegaon", "Ranjangaon"]) {
      await createProject(repositories, {
        name,
        asset_class: "grade_a_logistics",
        target_gfa_sqft: 500_000,
      });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const reloaded = await simulateReload();
    const result = await listProjects(reloaded);
    expect(result.ok && result.value).toHaveLength(3);
  });
});

describe("LocalApiClient", () => {
  it("exposes the full slice through the ApiClient seam the UI depends on", async () => {
    // The UI never touches services or repositories directly. This proves the
    // seam is complete enough to build the whole vertical slice on.
    const api = new LocalApiClient(repositories);

    const project = await api.createProject({
      name: "Pune Logistics Q3 2026",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
      region_label: "Pune / Chakan / Talegaon",
    });
    expect(project.ok).toBe(true);
    if (!project.ok) return;

    const site = await api.createSite({
      project_id: project.value.id,
      name: "Candidate Site A",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });
    expect(site.ok).toBe(true);
    if (!site.ok) return;

    expect((await api.listProjects()).ok).toBe(true);
    expect((await api.listSites(project.value.id)).ok).toBe(true);
    expect((await api.getSite(site.value.site.id)).ok).toBe(true);

    const updated = await api.updateSite(site.value.site.id, {
      land_price_per_acre_inr: 32_000_000,
    });
    expect(updated.ok && updated.value.land_price_per_acre_inr).toBe(32_000_000);

    const health = await api.health();
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    expect(health.value.driver).toBe("indexeddb");
    expect(health.value.project_count).toBe(1);
    expect(health.value.site_count).toBe(1);

    expect((await api.deleteSite(site.value.site.id)).ok).toBe(true);
    expect((await api.deleteProject(project.value.id)).ok).toBe(true);
  });

  it("returns errors as values rather than throwing", async () => {
    const api = new LocalApiClient(repositories);
    const result = await api.getSite("does-not-exist");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
