"use client";

/**
 * SiteMap — MapLibre canvas with Terra Draw editing.
 *
 * Division of responsibility, which is what keeps this component tractable:
 *
 *   Terra Draw  owns the DRAFT only — the boundary currently being drawn or
 *               edited, before it has been saved.
 *   MapLibre    owns SAVED sites, rendered from a plain GeoJSON source.
 *
 * Keeping them separate means a saved site can never be silently mutated by a
 * stray drag, and the "draft pending save" state is unambiguous both to the
 * user and in the code.
 *
 * This component performs NO geometry mathematics. It emits raw GeoJSON
 * upward and renders numbers it was handed. Area, perimeter, and centroid come
 * from lib/geo/measure via the workspace.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type MapMouseEvent } from "maplibre-gl";
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { InputGeometry } from "@/types/geojson";
import type { Site } from "@/types/domain";
import type { BasemapId } from "@/lib/config/env";
import { getBasemapStyle } from "@/lib/providers/basemap";
import { referenceAnchorsGeoJson } from "@/data/reference/anchors";
import { DEFAULT_MAP_CENTRE, DEFAULT_MAP_ZOOM } from "@/lib/app/services/projects";

import "maplibre-gl/dist/maplibre-gl.css";

export type DrawTool = "polygon" | "rectangle" | "point" | "select" | "none";

const TOOL_TO_MODE: Record<DrawTool, string> = {
  polygon: "polygon",
  rectangle: "rectangle",
  point: "point",
  select: "select",
  none: "static",
};

const SITES_SOURCE = "vantrock-sites";
const ANCHORS_SOURCE = "vantrock-anchors";

export interface SiteMapProps {
  sites: Site[];
  selectedSiteId: string | null;
  activeTool: DrawTool;
  basemapId: BasemapId;
  showAnchors: boolean;
  /** Fired when a draft boundary is completed or edited. Null when cleared. */
  onDraftChange: (geometry: InputGeometry | null) => void;
  onSelectSite: (siteId: string) => void;
  /** Exposes a clearDraft callback so the workspace can reset after saving. */
  onReady: (controls: { clearDraft: () => void }) => void;
}

export function SiteMap({
  sites,
  selectedSiteId,
  activeTool,
  basemapId,
  showAnchors,
  onDraftChange,
  onSelectSite,
  onReady,
}: SiteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null);

  // Handlers are held in refs so the map effect can stay dependency-free and
  // run exactly once. Re-creating a MapLibre instance on every render would
  // destroy in-progress drawing.
  const onDraftChangeRef = useRef(onDraftChange);
  const onSelectSiteRef = useRef(onSelectSite);
  onDraftChangeRef.current = onDraftChange;
  onSelectSiteRef.current = onSelectSite;

  const basemap = useMemo(() => getBasemapStyle(basemapId), [basemapId]);

  const clearDraft = useCallback(() => {
    drawRef.current?.clear();
    onDraftChangeRef.current(null);
  }, []);

  // ---------------------------------------------------------------- map init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getBasemapStyle(basemapId).style,
      center: DEFAULT_MAP_CENTRE,
      zoom: DEFAULT_MAP_ZOOM,
      attributionControl: false,
      // The analyst is reading a plan, not flying a camera.
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    map.on("mousemove", (event: MapMouseEvent) => {
      setCursor({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    });
    map.on("mouseout", () => setCursor(null));

    map.on("load", () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: "#e8b04b",
              fillOpacity: 0.18,
              outlineColor: "#e8b04b",
              outlineWidth: 2,
              closingPointColor: "#e8b04b",
              closingPointWidth: 5,
            },
          }),
          new TerraDrawRectangleMode({
            // Terra Draw's default is "click-move" (click a corner, move,
            // click again). The rail's tool hint documents rectangles as a
            // click-and-drag gesture, so the mode is configured to match.
            drawInteraction: "click-drag",
            styles: {
              fillColor: "#e8b04b",
              fillOpacity: 0.18,
              outlineColor: "#e8b04b",
              outlineWidth: 2,
            },
          }),
          new TerraDrawPointMode({
            styles: { pointColor: "#e8b04b", pointWidth: 7, pointOutlineColor: "#0b0e11" },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: { midpoints: true, draggable: true, deletable: true },
                },
              },
              rectangle: {
                feature: { draggable: true, coordinates: { draggable: true } },
              },
              point: { feature: { draggable: true } },
            },
            styles: {
              selectedPolygonColor: "#e8b04b",
              selectedPolygonFillOpacity: 0.22,
              selectedPolygonOutlineColor: "#f0c877",
              selectedPolygonOutlineWidth: 2,
              selectionPointColor: "#f0c877",
              midPointColor: "#e8b04b",
            },
          }),
        ],
      });

      draw.start();
      draw.setMode("static");
      drawRef.current = draw;

      const publishDraft = () => {
        const snapshot = draw.getSnapshot();
        // Only ever one draft. If a second shape is started, the earlier one
        // is dropped rather than silently accumulating unsaved geometry.
        const drawn = snapshot.filter(
          (feature) => feature.properties?.["mode"] !== "select",
        );
        if (drawn.length === 0) {
          onDraftChangeRef.current(null);
          return;
        }
        const latest = drawn[drawn.length - 1]!;
        if (drawn.length > 1) {
          draw.removeFeatures(drawn.slice(0, -1).map((feature) => feature.id!));
        }
        onDraftChangeRef.current(latest.geometry as unknown as InputGeometry);
      };

      draw.on("finish", publishDraft);
      // "change" also fires while editing a saved-but-unsaved draft in select
      // mode, which is how vertex drags reach the measurement readout. It
      // ALSO fires continuously while a shape is still being drawn (Terra
      // Draw emits "update" on every provisional-vertex move, and again for
      // its own closing-point marker features once a polygon has enough
      // vertices to close). publishDraft's "keep only the latest feature"
      // dedup logic must not run against those in-progress, non-select-mode
      // events — doing so fights Terra Draw's own bookkeeping for the
      // closing-point markers and corrupts the draw session. Restrict this
      // handler to select mode, matching what it is actually for.
      draw.on("change", (_ids, type) => {
        if ((type === "delete" || type === "update") && draw.getMode() === "select") {
          publishDraft();
        }
      });

      setMapLoaded(true);
      onReady({ clearDraft });
    });

    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
    // Intentionally run-once: basemapId changes are handled by a separate
    // effect via setStyle, which preserves the drawing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------ basemap swap
  //
  // Only fires on an actual basemap change. Without this guard, the initial
  // mapLoaded: false -> true transition (which happens moments after Terra
  // Draw adds its own sources/layers in the map "load" handler) would also
  // match this effect's dependency array and trigger a redundant setStyle,
  // tearing down the style — and Terra Draw's freshly-created layers with it
  // — for no reason, since the map was already constructed with this style.
  const appliedBasemapIdRef = useRef(basemapId);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (appliedBasemapIdRef.current === basemapId) return;
    appliedBasemapIdRef.current = basemapId;
    map.setStyle(basemap.style, { diff: false });
  }, [basemap, basemapId, mapLoaded]);

  // ------------------------------------------------------------- tool switch
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !mapLoaded) return;
    draw.setMode(TOOL_TO_MODE[activeTool]);
  }, [activeTool, mapLoaded]);

  // -------------------------------------------------- saved site rendering
  //
  // Re-applied on every style load as well as every data change, because
  // setStyle() tears down all sources and layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const render = () => {
      if (!map.isStyleLoaded()) return;

      const collection = {
        type: "FeatureCollection" as const,
        features: sites.map((site) => ({
          type: "Feature" as const,
          id: site.id,
          geometry: site.geometry,
          properties: {
            id: site.id,
            name: site.name,
            selected: site.id === selectedSiteId,
          },
        })),
      };

      const existing = map.getSource(SITES_SOURCE);
      if (existing && "setData" in existing) {
        (existing as maplibregl.GeoJSONSource).setData(collection);
      } else {
        map.addSource(SITES_SOURCE, { type: "geojson", data: collection });
        map.addLayer({
          id: "sites-fill",
          type: "fill",
          source: SITES_SOURCE,
          paint: {
            "fill-color": ["case", ["get", "selected"], "#e8b04b", "#4c8dd6"],
            "fill-opacity": ["case", ["get", "selected"], 0.26, 0.14],
          },
        });
        map.addLayer({
          id: "sites-line",
          type: "line",
          source: SITES_SOURCE,
          paint: {
            "line-color": ["case", ["get", "selected"], "#e8b04b", "#6ba4e3"],
            "line-width": ["case", ["get", "selected"], 2.5, 1.5],
          },
        });
        map.addLayer({
          id: "sites-label",
          type: "symbol",
          source: SITES_SOURCE,
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-offset": [0, 0.4],
          },
          paint: {
            "text-color": "#e8edf2",
            "text-halo-color": "#0b0e11",
            "text-halo-width": 1.5,
          },
        });

        map.on("click", "sites-fill", (event) => {
          const id = event.features?.[0]?.properties?.["id"];
          if (typeof id === "string") onSelectSiteRef.current(id);
        });
        map.on("mouseenter", "sites-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "sites-fill", () => {
          map.getCanvas().style.cursor = "";
        });
      }
    };

    render();
    map.on("styledata", render);
    return () => {
      map.off("styledata", render);
    };
  }, [sites, selectedSiteId, mapLoaded]);

  // ------------------------------------------------- reference anchor layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const render = () => {
      if (!map.isStyleLoaded()) return;

      if (!showAnchors) {
        for (const layer of ["anchors-label", "anchors-point"]) {
          if (map.getLayer(layer)) map.removeLayer(layer);
        }
        if (map.getSource(ANCHORS_SOURCE)) map.removeSource(ANCHORS_SOURCE);
        return;
      }

      if (!map.getSource(ANCHORS_SOURCE)) {
        map.addSource(ANCHORS_SOURCE, { type: "geojson", data: referenceAnchorsGeoJson() });
      }
      if (!map.getLayer("anchors-point")) {
        map.addLayer({
          id: "anchors-point",
          type: "circle",
          source: ANCHORS_SOURCE,
          paint: {
            "circle-radius": 4,
            "circle-color": "#9dabb9",
            "circle-stroke-color": "#0b0e11",
            "circle-stroke-width": 1.5,
          },
        });
      }
      if (!map.getLayer("anchors-label")) {
        map.addLayer({
          id: "anchors-label",
          type: "symbol",
          source: ANCHORS_SOURCE,
          layout: {
            "text-field": ["get", "name"],
            "text-size": 10,
            "text-offset": [0, 1],
            "text-anchor": "top",
          },
          paint: {
            "text-color": "#9dabb9",
            "text-halo-color": "#0b0e11",
            "text-halo-width": 1.5,
          },
        });
      }
    };

    render();
    map.on("styledata", render);
    return () => {
      map.off("styledata", render);
    };
  }, [showAnchors, mapLoaded]);

  // ------------------------------------------- fly to the selected site
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedSiteId) return;
    const site = sites.find((candidate) => candidate.id === selectedSiteId);
    if (!site) return;

    const [west, south, east, north] = site.measurements.bbox;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 120, maxZoom: 16, duration: 550 },
    );
  }, [selectedSiteId, sites, mapLoaded]);

  return (
    <>
      <div ref={containerRef} className="map-canvas" />

      <div className="map-overlay map-overlay-bottom-left">
        <div className="map-scale-readout">
          <span>
            {cursor
              ? `${cursor.lat.toFixed(5)}°N  ${cursor.lng.toFixed(5)}°E`
              : "— move cursor over map —"}
          </span>
          <span className="muted">EPSG:4326</span>
        </div>
      </div>

      <div className="map-overlay map-overlay-bottom-right" style={{ bottom: 42 }}>
        <div className="map-attribution">{basemap.attribution}</div>
      </div>
    </>
  );
}
