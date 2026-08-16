import { beforeEach, describe, expect, it } from "vitest";
import { createProject, deleteProject, getProject, listProjects } from "@/lib/app/services/projects";
import { createSite } from "@/lib/app/services/sites";
import { freshRepositories } from "../helpers/repositories";
import { graticuleRing } from "../fixtures/geometry";
import type { RepositoryBundle } from "@/lib/repositories/types";

let repositories: RepositoryBundle;

beforeEach(async () => {
  repositories = await freshRepositories();
});

describe("createProject", () => {
  it("creates a project with derived defaults", async () => {
    const result = await createProject(repositories, {
      name: "Pune Logistics Q3 2026",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
      region_label: "Pune / Chakan / Talegaon",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.name).toBe("Pune Logistics Q3 2026");
    expect(result.value.asset_class).toBe("grade_a_logistics");
    expect(result.value.target_gfa_sqft).toBe(500_000);
    // Derived from the project centre, never hardcoded into the type.
    expect(result.value.working_srid).toBe(32643);
    expect(result.value.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.value.created_at).toBe(result.value.updated_at);
  });

  it("trims whitespace from the name", async () => {
    const result = await createProject(repositories, {
      name: "   Chakan Warehouse Study   ",
      asset_class: "warehouse",
      target_gfa_sqft: 500_000,
    });
    expect(result.ok && result.value.name).toBe("Chakan Warehouse Study");
  });

  it("rejects an empty name with a specific message", async () => {
    const result = await createProject(repositories, {
      name: "   ",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.message).toMatch(/name is required/i);
  });

  it("rejects an out-of-range target GFA", async () => {
    const tooSmall = await createProject(repositories, {
      name: "Tiny",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 10,
    });
    expect(tooSmall.ok).toBe(false);

    const tooLarge = await createProject(repositories, {
      name: "Enormous",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 99_000_000,
    });
    expect(tooLarge.ok).toBe(false);
  });

  it("rejects an unknown asset class", async () => {
    const result = await createProject(repositories, {
      name: "Retail Park",
      // @ts-expect-error deliberately invalid at the type level too
      asset_class: "retail",
      target_gfa_sqft: 500_000,
    });
    expect(result.ok).toBe(false);
  });
});

describe("getProject / listProjects", () => {
  it("reads a project back by id", async () => {
    const created = await createProject(repositories, {
      name: "Talegaon Study",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const found = await getProject(repositories, created.value.id);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toEqual(created.value);
  });

  it("returns NOT_FOUND for an unknown id", async () => {
    const result = await getProject(repositories, "does-not-exist");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("lists projects newest first", async () => {
    for (const name of ["First", "Second", "Third"]) {
      await createProject(repositories, {
        name,
        asset_class: "grade_a_logistics",
        target_gfa_sqft: 500_000,
      });
      // Distinct ISO timestamps; ordering is by created_at.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const result = await listProjects(repositories);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((p) => p.name)).toEqual(["Third", "Second", "First"]);
  });

  it("returns an empty list when nothing has been created", async () => {
    const result = await listProjects(repositories);
    expect(result.ok && result.value).toEqual([]);
  });
});

describe("deleteProject", () => {
  it("cascades to the project's sites", async () => {
    const project = await createProject(repositories, {
      name: "Chakan Shortlist",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
    });
    expect(project.ok).toBe(true);
    if (!project.ok) return;

    for (let i = 0; i < 3; i += 1) {
      await createSite(repositories, {
        project_id: project.value.id,
        name: `Candidate Site ${String.fromCharCode(65 + i)}`,
        source_type: "drawn_polygon",
        geometry: {
          type: "Polygon",
          coordinates: [graticuleRing(73.8567 + i * 0.01, 18.7606, 73.8597 + i * 0.01, 18.76347)],
        },
      });
    }

    expect(await repositories.sites.countByProject(project.value.id)).toBe(3);

    const deleted = await deleteProject(repositories, project.value.id);
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.deleted_sites).toBe(3);
    expect(await repositories.sites.countByProject(project.value.id)).toBe(0);
  });

  it("returns NOT_FOUND for an unknown project", async () => {
    const result = await deleteProject(repositories, "does-not-exist");
    expect(result.ok).toBe(false);
  });
});
