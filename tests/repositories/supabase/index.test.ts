import { describe, expect, it } from "vitest";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";
import { createFakeSupabaseClient } from "./fake-client";
import type { Project, Site } from "@/types/domain";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: crypto.randomUUID(),
    owner_id: "local-analyst",
    name: "Test Project",
    asset_class: "grade_a_logistics",
    target_gfa_sqft: 500000,
    region_label: null,
    working_srid: 32643,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSite(projectId: string, overrides: Partial<Site> = {}): Site {
  return {
    id: crypto.randomUUID(),
    project_id: projectId,
    name: "Candidate A",
    source_type: "drawn_polygon",
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [73.86, 18.75],
            [73.87, 18.75],
            [73.87, 18.76],
            [73.86, 18.76],
            [73.86, 18.75],
          ],
        ],
      ],
    },
    point_origin: null,
    buffer_radius_m: null,
    measurements: {
      area_sqm: 12345,
      perimeter_m: 456,
      centroid: { type: "Point", coordinates: [73.865, 18.755] },
      bbox: [73.86, 18.75, 73.87, 18.76],
      vertex_count: 5,
      hole_count: 0,
    },
    land_price_per_acre_inr: null,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("SupabaseProjectRepository", () => {
  it("creates, finds, lists, updates, and deletes a project", async () => {
    const repos = createSupabaseRepositories(createFakeSupabaseClient());
    expect(repos.driver).toBe("supabase");

    const project = makeProject();
    await repos.projects.create(project);

    expect(await repos.projects.findById(project.id)).toEqual(project);
    expect(await repos.projects.listByOwner("local-analyst")).toEqual([project]);
    expect(await repos.projects.findById("missing")).toBeNull();

    const updated = await repos.projects.update(project.id, { name: "Renamed" });
    expect(updated?.name).toBe("Renamed");

    expect(await repos.projects.delete(project.id)).toBe(true);
    expect(await repos.projects.findById(project.id)).toBeNull();
    expect(await repos.projects.delete(project.id)).toBe(false);
  });
});

describe("SupabaseSiteRepository", () => {
  it("creates, finds, lists, updates, counts, and deletes sites", async () => {
    const repos = createSupabaseRepositories(createFakeSupabaseClient());
    const project = makeProject();
    await repos.projects.create(project);

    const site = makeSite(project.id);
    const created = await repos.sites.create(site);
    expect(created.geometry).toEqual(site.geometry);

    expect(await repos.sites.findById(site.id)).toEqual(site);
    expect(await repos.sites.listByProject(project.id)).toEqual([site]);
    expect(await repos.sites.countByProject(project.id)).toBe(1);

    const updated = await repos.sites.update(site.id, { name: "Renamed Site" });
    expect(updated?.name).toBe("Renamed Site");

    const second = makeSite(project.id, { name: "Candidate B" });
    await repos.sites.create(second);
    expect(await repos.sites.countByProject(project.id)).toBe(2);

    const removed = await repos.sites.deleteByProject(project.id);
    expect(removed).toBe(2);
    expect(await repos.sites.listByProject(project.id)).toEqual([]);
  });

  it("carries point_buffer geometry (point_origin) through create and find", async () => {
    const repos = createSupabaseRepositories(createFakeSupabaseClient());
    const project = makeProject();
    await repos.projects.create(project);

    const site = makeSite(project.id, {
      source_type: "point_buffer",
      point_origin: { type: "Point", coordinates: [73.865, 18.755] },
      buffer_radius_m: 200,
    });
    await repos.sites.create(site);

    const found = await repos.sites.findById(site.id);
    expect(found?.point_origin).toEqual(site.point_origin);
    expect(found?.buffer_radius_m).toBe(200);
  });
});
