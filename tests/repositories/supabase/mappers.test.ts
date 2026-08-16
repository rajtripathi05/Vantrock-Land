import { describe, expect, it } from "vitest";
import {
  projectToRow,
  rowToProject,
  rowToSite,
  siteToWriteRow,
  type SiteRow,
} from "@/lib/repositories/supabase/mappers";
import type { Project, Site } from "@/types/domain";

const project: Project = {
  id: "proj-1",
  owner_id: "local-analyst",
  name: "Pune Corridor Q1",
  asset_class: "grade_a_logistics",
  target_gfa_sqft: 500000,
  region_label: "Chakan",
  working_srid: 32643,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const site: Site = {
  id: "site-1",
  project_id: "proj-1",
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
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("supabase mappers: projects", () => {
  it("round-trips a project through row form", () => {
    const row = projectToRow(project);
    expect(rowToProject(row)).toEqual(project);
  });

  it("coerces a numeric-string target_gfa_sqft (Postgres numeric over PostgREST)", () => {
    const row = { ...projectToRow(project), target_gfa_sqft: "500000" as unknown as number };
    expect(rowToProject(row).target_gfa_sqft).toBe(500000);
  });
});

describe("supabase mappers: sites", () => {
  it("serializes geometry to a GeoJSON string for the write payload", () => {
    const row = siteToWriteRow(site);
    expect(JSON.parse(row.geom)).toEqual(site.geometry);
    expect(row.point_origin).toBeNull();
  });

  it("round-trips a site read back through the generated geom_geojson columns", () => {
    const readRow: SiteRow = {
      id: site.id,
      project_id: site.project_id,
      name: site.name,
      source_type: site.source_type,
      geom_geojson: site.geometry,
      point_origin_geojson: null,
      buffer_radius_m: site.buffer_radius_m,
      measurements: site.measurements,
      land_price_per_acre_inr: site.land_price_per_acre_inr,
      notes: site.notes,
      created_at: site.created_at,
      updated_at: site.updated_at,
    };
    expect(rowToSite(readRow)).toEqual(site);
  });

  it("carries a point_buffer site's point_origin through both directions", () => {
    const pointSite: Site = {
      ...site,
      source_type: "point_buffer",
      point_origin: { type: "Point", coordinates: [73.865, 18.755] },
      buffer_radius_m: 200,
    };
    const writeRow = siteToWriteRow(pointSite);
    expect(JSON.parse(writeRow.point_origin!)).toEqual(pointSite.point_origin);

    const readRow: SiteRow = {
      ...pointSite,
      geom_geojson: pointSite.geometry,
      point_origin_geojson: pointSite.point_origin,
    };
    expect(rowToSite(readRow)).toEqual(pointSite);
  });
});
