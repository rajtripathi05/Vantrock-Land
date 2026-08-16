/**
 * SourceMetadata builders shared across the metric modules.
 *
 * Centralised so every metric's provenance is constructed the same way —
 * the classification rules (blueprint rule 51) live here once, not once per
 * metric file.
 */

import type { OsmManifest } from "@/lib/data/osm/types";
import type { RoutingProvider } from "@/lib/providers/routing/types";
import type { SourceMetadata } from "@/types/domain";

const nowIso = (): string => new Date().toISOString();

/** A value computed exactly from the analyst's own drawn geometry. */
export function geometrySource(confidence = 1): SourceMetadata {
  return {
    source_id: "vantrock_geometry_engine_v1",
    name: "Vantrock geometry engine",
    provider: "Vantrock (lib/geo/measure.ts)",
    source_url: "",
    license: "Internal calculation",
    attribution: "Computed from the analyst-drawn boundary",
    classification: "DERIVED",
    data_timestamp: null,
    retrieved_at: nowIso(),
    confidence,
    notes: "Exact geodesic calculation on the WGS84 ellipsoid, not an estimate.",
  };
}

/** A value read directly from the preloaded OSM snapshot. */
export function osmSource(manifest: OsmManifest, confidence = 0.75): SourceMetadata {
  return {
    source_id: manifest.source_id,
    name: manifest.name,
    provider: manifest.provider,
    source_url: manifest.source_url,
    license: manifest.license,
    attribution: manifest.attribution,
    classification: manifest.classification,
    data_timestamp: manifest.data_timestamp,
    retrieved_at: manifest.retrieved_at,
    confidence,
    notes: "Crowd-sourced coverage; completeness varies by area.",
  };
}

/**
 * A POPULATION PROXY derived from OSM `population` tags on nearby
 * settlement nodes. Lower confidence than a road/POI reading: contributor-
 * entered, inconsistent recency, no per-node source citation, and sparse
 * coverage (most villages carry no population tag at all).
 */
export function osmPlaceSource(manifest: OsmManifest, confidence = 0.4): SourceMetadata {
  return {
    source_id: `${manifest.source_id}_places`,
    name: "OpenStreetMap settlement population tags",
    provider: manifest.provider,
    source_url: manifest.source_url,
    license: manifest.license,
    attribution: manifest.attribution,
    classification: "PRELOADED",
    data_timestamp: manifest.data_timestamp,
    retrieved_at: manifest.retrieved_at,
    confidence,
    notes:
      "POPULATION PROXY, not an official census figure or a workforce measurement. " +
      "Sourced from OSM contributors' `population` tags, which are often (not always) " +
      "drawn from the Census of India but carry no per-node source citation or guaranteed " +
      "recency. Sparse coverage: most villages in the corridor carry no population tag at all.",
  };
}

/** A value computed from OSM data but not itself a direct OSM reading. */
export function osmDerivedSource(manifest: OsmManifest, note: string, confidence = 0.6): SourceMetadata {
  return {
    ...osmSource(manifest, confidence),
    source_id: `${manifest.source_id}_derived`,
    classification: "DERIVED",
    notes: note,
  };
}

/** A hand-assembled Vantrock assumption, e.g. a typical site-coverage ratio. */
export function curatedAssumptionSource(name: string, notes: string, confidence = 0.5): SourceMetadata {
  return {
    source_id: `vantrock_curated_${name}`,
    name,
    provider: "Vantrock (analyst-curated assumption)",
    source_url: "",
    license: "Internal assumption",
    attribution: "Vantrock analytical judgement, not a market or regulatory standard",
    classification: "CURATED",
    data_timestamp: null,
    retrieved_at: nowIso(),
    confidence,
    notes,
  };
}

/** A route distance/time fetched live from a RoutingProvider at analysis time. */
export function routingSource(provider: RoutingProvider): SourceMetadata {
  return {
    source_id: provider.id,
    name: provider.label,
    provider: provider.provider,
    source_url: "https://project-osrm.org",
    license: "OSRM: BSD 2-Clause. Road network: OpenStreetMap ODbL 1.0.",
    attribution: "Routing: Project OSRM. Road data: © OpenStreetMap contributors.",
    classification: "LIVE",
    data_timestamp: nowIso(),
    retrieved_at: nowIso(),
    confidence: provider.confidence,
    notes:
      provider.usageWarning ??
      `Ordinary passenger-vehicle route, not a truck route (mode: ${provider.mode}).`,
  };
}

/** Placeholder provenance for a metric that has no data source in this MVP. */
export function missingSource(reason: string): SourceMetadata {
  return {
    source_id: "none",
    name: "No data source configured",
    provider: "N/A",
    source_url: "",
    license: "",
    attribution: "",
    classification: "DERIVED",
    data_timestamp: null,
    retrieved_at: nowIso(),
    confidence: 0,
    notes: reason,
  };
}
