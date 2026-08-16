/**
 * ============================================================================
 * CURATED DEMO DATA — NOT AUTHORITATIVE
 * ============================================================================
 *
 * Approximate coordinates for well-known logistics anchors in the Pune
 * corridor, hand-entered for orientation while drawing. They are NOT survey
 * grade, NOT verified, and NOT used in any calculation.
 *
 * Blueprint rules 10-12: mock and curated data must be explicitly marked and
 * never presented as authoritative. The SourceMetadata below carries
 * classification "CURATED", and the UI renders these with a visible
 * qualifier for exactly that reason.
 *
 * These become PRELOADED OpenStreetMap features in the ingestion slice, at
 * which point this file is deleted rather than promoted.
 */

import type { SourceMetadata } from "@/types/domain";

export interface ReferenceAnchor {
  code: string;
  name: string;
  kind: "port" | "airport" | "interchange" | "industrial_zone" | "city";
  /** [longitude, latitude], EPSG:4326. Approximate. */
  position: [number, number];
}

export const REFERENCE_ANCHOR_SOURCE: SourceMetadata = {
  source_id: "vantrock_curated_anchors_v1",
  name: "Pune corridor orientation anchors",
  provider: "Vantrock (hand-entered)",
  source_url: "",
  license: "Internal demo data",
  attribution: "Vantrock curated demo dataset",
  classification: "CURATED",
  data_timestamp: null,
  retrieved_at: "2026-08-16T00:00:00Z",
  confidence: 0.4,
  notes:
    "Approximate coordinates for map orientation only. Not survey grade. Not used in any calculation. Replaced by OpenStreetMap features in the ingestion slice.",
};

export const REFERENCE_ANCHORS: ReferenceAnchor[] = [
  { code: "chakan_midc", name: "Chakan MIDC", kind: "industrial_zone", position: [73.8626, 18.7606] },
  { code: "talegaon_midc", name: "Talegaon MIDC", kind: "industrial_zone", position: [73.6752, 18.7351] },
  { code: "ranjangaon_midc", name: "Ranjangaon MIDC", kind: "industrial_zone", position: [74.2447, 18.7767] },
  { code: "pune_airport", name: "Pune Airport", kind: "airport", position: [73.9197, 18.5822] },
  { code: "pune_city", name: "Pune City Centre", kind: "city", position: [73.8567, 18.5204] },
  { code: "nh48_talegaon", name: "NH-48 Talegaon Interchange", kind: "interchange", position: [73.6775, 18.7378] },
  { code: "jnpt", name: "JNPT (Nhava Sheva)", kind: "port", position: [72.9489, 18.9490] },
];

/** Rendered as a MapLibre GeoJSON source. */
export function referenceAnchorsGeoJson() {
  return {
    type: "FeatureCollection" as const,
    features: REFERENCE_ANCHORS.map((anchor) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: anchor.position },
      properties: {
        code: anchor.code,
        name: anchor.name,
        kind: anchor.kind,
        classification: REFERENCE_ANCHOR_SOURCE.classification,
      },
    })),
  };
}
