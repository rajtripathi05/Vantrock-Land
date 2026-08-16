/**
 * Future infrastructure provider — curated pipeline projects for the
 * Pune/Chakan/Talegaon study area.
 *
 * These are NOT live authoritative records. Each entry is CURATED from
 * public planning announcements and carries an explicit lifecycle status.
 * ANNOUNCED does not mean OPERATIONAL — status must never be collapsed into
 * a single "infrastructure exists" signal. See docs/DATA_SOURCES.md.
 */

import type { PointGeometry } from "@/types/geojson";

export type FutureInfrastructureStatus =
  | "ANNOUNCED"
  | "FEASIBILITY"
  | "DPR"
  | "APPROVED"
  | "LAND_ACQUISITION"
  | "TENDER"
  | "CONSTRUCTION"
  | "PARTIAL_OPERATION"
  | "OPERATIONAL";

export type FutureInfrastructureCategory =
  | "highway"
  | "expressway"
  | "rail"
  | "freight_corridor"
  | "metro"
  | "airport"
  | "industrial_zone"
  | "power"
  | "logistics_park";

export interface FutureInfrastructureProject {
  id: string;
  name: string;
  category: FutureInfrastructureCategory;
  status: FutureInfrastructureStatus;
  location: PointGeometry;
  source_name: string;
  source_url: string;
  source_date: string;
  expected_date: string | null;
  confidence: number;
  notes: string;
}

export interface FutureInfrastructureProvider {
  listProjects(): readonly FutureInfrastructureProject[];
  nearestByCategory(
    point: [number, number],
    category?: FutureInfrastructureCategory,
  ): { project: FutureInfrastructureProject; distance_m: number } | null;
}

/** CURATED — public planning announcements, not live/authoritative. */
export const CURATED_FUTURE_INFRASTRUCTURE: readonly FutureInfrastructureProject[] = [
  {
    id: "fi-pune-ring-road-north",
    name: "Pune Ring Road (North package, incl. Chakan/Talegaon)",
    category: "expressway",
    status: "LAND_ACQUISITION",
    location: { type: "Point", coordinates: [73.86, 18.72] },
    source_name: "MSRDC public project announcements",
    source_url: "https://vantrock.local/docs/data-sources#future-infrastructure",
    source_date: "2025-11-01",
    expected_date: "2028",
    confidence: 0.5,
    notes:
      "Ring road package intended to connect Chakan-Talegaon-Pune industrial belt. Land acquisition in progress in parts; not operational.",
  },
  {
    id: "fi-chakan-talegaon-freight-line",
    name: "Chakan-Talegaon rail freight spur (DFC feeder)",
    category: "freight_corridor",
    status: "DPR",
    location: { type: "Point", coordinates: [73.81, 18.75] },
    source_name: "Dedicated Freight Corridor Corporation feeder-route planning notes",
    source_url: "https://vantrock.local/docs/data-sources#future-infrastructure",
    source_date: "2025-06-01",
    expected_date: null,
    confidence: 0.35,
    notes:
      "Proposed feeder spur linking the Chakan industrial belt to the Western DFC. DPR stage — alignment not finalized.",
  },
  {
    id: "fi-pune-metro-phase2-chakan",
    name: "Pune Metro extension toward Chakan corridor",
    category: "metro",
    status: "FEASIBILITY",
    location: { type: "Point", coordinates: [73.85, 18.68] },
    source_name: "Maharashtra Metro (MahaMetro) phase-2 feasibility announcements",
    source_url: "https://vantrock.local/docs/data-sources#future-infrastructure",
    source_date: "2025-03-01",
    expected_date: null,
    confidence: 0.3,
    notes: "Feasibility-stage extension proposal. Route and stations not finalized.",
  },
  {
    id: "fi-talegaon-midc-expansion",
    name: "Talegaon MIDC industrial area expansion",
    category: "industrial_zone",
    status: "APPROVED",
    location: { type: "Point", coordinates: [73.68, 18.73] },
    source_name: "MIDC land-notification announcements",
    source_url: "https://vantrock.local/docs/data-sources#future-infrastructure",
    source_date: "2025-09-01",
    expected_date: "2027",
    confidence: 0.5,
    notes: "Additional industrial land parcels approved for MIDC allotment near Talegaon.",
  },
  {
    id: "fi-chakan-substation-upgrade",
    name: "Chakan industrial belt 220kV substation upgrade",
    category: "power",
    status: "CONSTRUCTION",
    location: { type: "Point", coordinates: [73.87, 18.76] },
    source_name: "MSEDCL grid-strengthening project notices",
    source_url: "https://vantrock.local/docs/data-sources#future-infrastructure",
    source_date: "2025-12-01",
    expected_date: "2026",
    confidence: 0.45,
    notes: "Grid capacity upgrade under construction to serve expanding industrial load in Chakan.",
  },
  {
    id: "fi-talegaon-logistics-park",
    name: "Talegaon multi-modal logistics park (proposed)",
    category: "logistics_park",
    status: "ANNOUNCED",
    location: { type: "Point", coordinates: [73.67, 18.74] },
    source_name: "State logistics-policy announcement",
    source_url: "https://vantrock.local/docs/data-sources#future-infrastructure",
    source_date: "2026-02-01",
    expected_date: null,
    confidence: 0.25,
    notes: "Early-stage announcement of a proposed multi-modal logistics park. No land acquisition confirmed.",
  },
];

function haversineMetres(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export class CuratedFutureInfrastructureProvider implements FutureInfrastructureProvider {
  constructor(private readonly projects: readonly FutureInfrastructureProject[] = CURATED_FUTURE_INFRASTRUCTURE) {}

  listProjects(): readonly FutureInfrastructureProject[] {
    return this.projects;
  }

  nearestByCategory(
    point: [number, number],
    category?: FutureInfrastructureCategory,
  ): { project: FutureInfrastructureProject; distance_m: number } | null {
    const candidates = category ? this.projects.filter((p) => p.category === category) : this.projects;
    let best: { project: FutureInfrastructureProject; distance_m: number } | null = null;
    for (const project of candidates) {
      const distance_m = haversineMetres(point, project.location.coordinates as [number, number]);
      if (!best || distance_m < best.distance_m) best = { project, distance_m };
    }
    return best;
  }
}
