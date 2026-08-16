/**
 * BasemapProvider — map tile styles behind an interface.
 *
 * Two implementations today, neither requiring an API key or a paid account:
 *
 *   "blank"   Zero network requests. A flat canvas plus locally-held
 *             reference points. The application is fully functional offline.
 *
 *   "osm-dev" OpenStreetMap raster tiles. Free and keyless, but the OSMF tile
 *             usage policy does NOT permit production applications, so this is
 *             labelled DEVELOPMENT ONLY in the UI and must not ship.
 *
 * The production answer, per the blueprint, is a Protomaps PMTiles extract of
 * the Pune corridor served from Supabase Storage — still keyless, still free,
 * but self-hosted and policy-clean. It slots in as a third case below.
 */

import type { StyleSpecification } from "maplibre-gl";
import type { BasemapId } from "@/lib/config/env";

export interface BasemapStyle {
  id: BasemapId;
  label: string;
  style: StyleSpecification;
  attribution: string;
  /** Shown in the UI when the source has terms that block production use. */
  usageWarning: string | null;
  requiresNetwork: boolean;
}

const BLANK_STYLE: StyleSpecification = {
  version: 8,
  // An empty glyphs/sprite set keeps MapLibre from reaching out for fonts.
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0f1418" },
    },
  ],
};

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "osm-raster": {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0f1418" },
    },
    {
      id: "osm-raster",
      type: "raster",
      source: "osm-raster",
      paint: {
        // Desaturated and dimmed so drawn boundaries stay the focus. An
        // analyst is reading geometry, not sightseeing.
        "raster-saturation": -0.6,
        "raster-brightness-max": 0.82,
        "raster-contrast": -0.05,
      },
    },
  ],
};

export function getBasemapStyle(id: BasemapId): BasemapStyle {
  switch (id) {
    case "blank":
      return {
        id: "blank",
        label: "Offline",
        style: BLANK_STYLE,
        attribution: "No basemap — offline mode",
        usageWarning: null,
        requiresNetwork: false,
      };
    case "osm-dev":
    default:
      return {
        id: "osm-dev",
        label: "OSM (dev)",
        style: OSM_STYLE,
        attribution: "© OpenStreetMap contributors",
        usageWarning:
          "OpenStreetMap tiles are for development only. Production requires a self-hosted PMTiles basemap.",
        requiresNetwork: true,
      };
  }
}

export const BASEMAP_OPTIONS: BasemapId[] = ["osm-dev", "blank"];
