import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/app/services/projects";
import {
  createSite,
  deleteSite,
  getSite,
  listSites,
  suggestSiteName,
  updateSite,
} from "@/lib/app/services/sites";
import { sqmToAcres } from "@/lib/geo/units";
import { freshRepositories } from "../helpers/repositories";
import { graticuleCellArea, graticuleRing, SELF_INTERSECTING_RING } from "../fixtures/geometry";
import type { RepositoryBundle } from "@/lib/repositories/types";
import type { Project } from "@/types/domain";

let repositories: RepositoryBundle;
let project: Project;

beforeEach(async () => {
  repositories = await freshRepositories();
  const created = await createProject(repositories, {
    name: "Pune Logistics Q3 2026",
    asset_class: "grade_a_logistics",
    target_gfa_sqft: 500_000,
    region_label: "Pune / Chakan / Talegaon",
  });
  if (!created.ok) throw new Error("project fixture failed");
  project = created.value;
});

const chakanPolygon = {
  type: "Polygon" as const,
  coordinates: [graticuleRing(73.8567, 18.7606, 73.8597, 18.76347)],
};

describe("createSite — polygon", () => {
  it("normalizes to MultiPolygon and measures once at write time", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Candidate Site A",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { site } = result.value;
    expect(site.geometry.type).toBe("MultiPolygon");
    expect(site.source_type).toBe("drawn_polygon");
    expect(site.point_origin).toBeNull();
    expect(site.buffer_radius_m).toBeNull();

    const expectedArea = graticuleCellArea(73.8567, 18.7606, 73.8597, 18.76347);
    expect(Math.abs(site.measurements.area_sqm - expectedArea) / expectedArea).toBeLessThan(
      0.0002,
    );
    expect(sqmToAcres(site.measurements.area_sqm)).toBeGreaterThan(24);
    expect(site.measurements.perimeter_m).toBeGreaterThan(1_000);
    expect(site.measurements.centroid.type).toBe("Point");
    expect(site.measurements.bbox).toHaveLength(4);
  });

  it("defaults land price to null rather than zero", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Candidate Site A",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });
    // An unknown assumption must never silently become a number.
    expect(result.ok && result.value.site.land_price_per_acre_inr).toBeNull();
  });
});

describe("createSite — rectangle", () => {
  it("stores a rectangle with its own source type", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Candidate Site B",
      source_type: "drawn_rectangle",
      geometry: chakanPolygon,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.site.source_type).toBe("drawn_rectangle");
    expect(result.value.site.geometry.type).toBe("MultiPolygon");
  });
});

describe("createSite — point", () => {
  it("buffers a dropped point into a measurable boundary", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Candidate Site C",
      source_type: "point_buffer",
      geometry: { type: "Point", coordinates: [73.8567, 18.7606] },
      buffer_radius_m: 300,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { site } = result.value;
    expect(site.geometry.type).toBe("MultiPolygon");
    expect(site.point_origin).toEqual({ type: "Point", coordinates: [73.8567, 18.7606] });
    expect(site.buffer_radius_m).toBe(300);

    const expected = Math.PI * 300 * 300;
    expect(site.measurements.area_sqm / expected).toBeGreaterThan(0.99);
  });

  it("applies the default radius when none is supplied", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Candidate Site D",
      source_type: "point_buffer",
      geometry: { type: "Point", coordinates: [73.8567, 18.7606] },
    });
    expect(result.ok && result.value.site.buffer_radius_m).toBe(250);
  });

  it("rejects a point declared as a polygon", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Mislabelled",
      source_type: "drawn_polygon",
      geometry: { type: "Point", coordinates: [73.8567, 18.7606] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a polygon declared as a point buffer", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Mislabelled",
      source_type: "point_buffer",
      geometry: chakanPolygon,
    });
    expect(result.ok).toBe(false);
  });
});

describe("createSite — invalid geometry", () => {
  it("rejects a self-intersecting boundary with a specific reason", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Bow tie",
      source_type: "drawn_polygon",
      geometry: { type: "Polygon", coordinates: [SELF_INTERSECTING_RING] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GEOMETRY_INVALID");
    expect(result.error.message).toMatch(/crosses itself/i);
  });

  it("rejects a boundary below the area floor", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Accidental click",
      source_type: "drawn_polygon",
      geometry: {
        type: "Polygon",
        coordinates: [graticuleRing(73.8567, 18.7606, 73.85675, 18.76065)],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AREA_OUT_OF_BOUNDS");
  });

  it("rejects a boundary above the area ceiling", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Mis-drag",
      source_type: "drawn_polygon",
      geometry: { type: "Polygon", coordinates: [graticuleRing(73, 18, 74, 19)] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AREA_OUT_OF_BOUNDS");
  });

  it("rejects an unsupported geometry type", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "A road",
      source_type: "drawn_polygon",
      // @ts-expect-error deliberately invalid
      geometry: { type: "LineString", coordinates: [[73.8, 18.7], [73.9, 18.8]] },
    });
    expect(result.ok).toBe(false);
  });

  it("does not persist anything when validation fails", async () => {
    await createSite(repositories, {
      project_id: project.id,
      name: "Bow tie",
      source_type: "drawn_polygon",
      geometry: { type: "Polygon", coordinates: [SELF_INTERSECTING_RING] },
    });
    expect(await repositories.sites.countByProject(project.id)).toBe(0);
  });

  it("rejects a site on a project that does not exist", async () => {
    const result = await createSite(repositories, {
      project_id: "no-such-project",
      name: "Orphan",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("createSite — warnings", () => {
  it("surfaces non-blocking warnings alongside a successful save", async () => {
    const result = await createSite(repositories, {
      project_id: project.id,
      name: "Site with exclusion",
      source_type: "drawn_polygon",
      geometry: {
        type: "Polygon",
        coordinates: [
          graticuleRing(73.8567, 18.7606, 73.8597, 18.76347),
          graticuleRing(73.8577, 18.7616, 73.8587, 18.7626),
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings.map((w) => w.code)).toContain("HAS_HOLES");
    expect(result.value.site.measurements.hole_count).toBe(1);
  });
});

describe("read, update, delete", () => {
  it("reads a site back by id", async () => {
    const created = await createSite(repositories, {
      project_id: project.id,
      name: "Candidate Site A",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });
    if (!created.ok) throw new Error("fixture failed");

    const found = await getSite(repositories, created.value.site.id);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.id).toBe(created.value.site.id);
    expect(found.value.measurements.area_sqm).toBe(created.value.site.measurements.area_sqm);
  });

  it("lists sites for a project, newest first", async () => {
    for (const name of ["Candidate Site A", "Candidate Site B", "Candidate Site C"]) {
      await createSite(repositories, {
        project_id: project.id,
        name,
        source_type: "drawn_polygon",
        geometry: chakanPolygon,
      });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const result = await listSites(repositories, project.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((s) => s.name)).toEqual([
      "Candidate Site C",
      "Candidate Site B",
      "Candidate Site A",
    ]);
  });

  it("does not leak sites across projects", async () => {
    const other = await createProject(repositories, {
      name: "Talegaon Study",
      asset_class: "grade_a_logistics",
      target_gfa_sqft: 500_000,
    });
    if (!other.ok) throw new Error("fixture failed");

    await createSite(repositories, {
      project_id: project.id,
      name: "Candidate Site A",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });

    const otherSites = await listSites(repositories, other.value.id);
    expect(otherSites.ok && otherSites.value).toHaveLength(0);
  });

  it("updates attributes without touching geometry", async () => {
    const created = await createSite(repositories, {
      project_id: project.id,
      name: "Candidate Site A",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });
    if (!created.ok) throw new Error("fixture failed");

    const updated = await updateSite(repositories, created.value.site.id, {
      name: "Chakan Parcel 14",
      land_price_per_acre_inr: 32_000_000,
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.name).toBe("Chakan Parcel 14");
    expect(updated.value.land_price_per_acre_inr).toBe(32_000_000);
    // Geometry and its measurements must remain in lockstep.
    expect(updated.value.geometry).toEqual(created.value.site.geometry);
    expect(updated.value.measurements).toEqual(created.value.site.measurements);
  });

  it("deletes a site", async () => {
    const created = await createSite(repositories, {
      project_id: project.id,
      name: "Candidate Site A",
      source_type: "drawn_polygon",
      geometry: chakanPolygon,
    });
    if (!created.ok) throw new Error("fixture failed");

    expect((await deleteSite(repositories, created.value.site.id)).ok).toBe(true);
    expect((await getSite(repositories, created.value.site.id)).ok).toBe(false);
    expect((await deleteSite(repositories, created.value.site.id)).ok).toBe(false);
  });
});

describe("suggestSiteName", () => {
  it("uses domain language rather than generic labels", () => {
    expect(suggestSiteName(0)).toBe("Candidate Site A");
    expect(suggestSiteName(1)).toBe("Candidate Site B");
    expect(suggestSiteName(25)).toBe("Candidate Site Z");
  });

  it("keeps producing distinct names past 26 sites", () => {
    expect(suggestSiteName(26)).toBe("Candidate Site A2");
    expect(suggestSiteName(52)).toBe("Candidate Site A3");
  });
});
