/**
 * Shapes of the preloaded OpenStreetMap snapshot written by
 * ingest/sources/osm/fetch.mjs to public/data/osm/*.json.
 *
 * These are storage/transport shapes, not domain types — the analysis engine
 * converts query results into Metric/SourceMetadata at the boundary.
 */

import type { Position } from "@/types/geojson";

export type OsmHighwayClass =
  | "motorway"
  | "motorway_link"
  | "trunk"
  | "trunk_link"
  | "primary"
  | "primary_link"
  | "secondary"
  | "secondary_link"
  | "unknown";

export interface OsmRoad {
  id: string;
  highway: OsmHighwayClass;
  name: string | null;
  ref: string | null;
  oneway: boolean;
  coordinates: Position[];
}

export type OsmPoiCategory =
  | "airport"
  | "rail_station"
  | "rail_yard"
  | "warehouse"
  | "industrial_zone"
  | "fuel_station"
  | "power_substation"
  | "industrial_facility";

export interface OsmPoi {
  id: string;
  category: OsmPoiCategory;
  name: string | null;
  lon: number;
  lat: number;
}

export type OsmPlaceType = "city" | "town" | "village" | "suburb";

/**
 * A settlement node carrying an OSM `population` tag — self-reported by
 * contributors, often (not always) sourced from the Census of India, but
 * with inconsistent recency and no guaranteed provenance per-node. Used as
 * a POPULATION PROXY, never presented as an official census figure or a
 * workforce measurement — see lib/analysis/metrics/labour.ts.
 */
export interface OsmPlace {
  id: string;
  place: OsmPlaceType;
  name: string | null;
  population: number;
  lon: number;
  lat: number;
}

export interface OsmManifest {
  source_id: string;
  name: string;
  provider: string;
  source_url: string;
  license: string;
  attribution: string;
  classification: "PRELOADED";
  geography: string;
  bbox: [number, number, number, number];
  format: string;
  data_timestamp: string;
  retrieved_at: string;
  version: number;
  roads: { count: number; by_class: Record<string, number>; file: string };
  pois: { count: number; by_category: Record<string, number>; file: string };
  places: { count: number; file: string };
  notes: string;
}

export interface OsmDataset {
  manifest: OsmManifest;
  roads: OsmRoad[];
  pois: OsmPoi[];
  places: OsmPlace[];
}

/** Major-highway subset used for the "nearest highway" metric. */
export const MAJOR_HIGHWAY_CLASSES: readonly OsmHighwayClass[] = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
];
