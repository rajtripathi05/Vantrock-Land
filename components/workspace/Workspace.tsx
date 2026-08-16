"use client";

/**
 * Workspace — the DRAW / SELECT screen.
 *
 * Layout: project + site controls on the left, map in the centre, selected
 * site detail on the right.
 *
 * This component orchestrates. It does not compute geometry (that is
 * previewGeometry / lib/geo), it does not talk to storage (that is the
 * ApiClient), and it does not know IndexedDB exists.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppError, Project, Site } from "@/types/domain";
import { ASSET_CLASS_LABELS } from "@/types/domain";
import type { InputGeometry } from "@/types/geojson";
import type { BasemapId } from "@/lib/config/env";
import { getBasemapStyle, BASEMAP_OPTIONS } from "@/lib/providers/basemap";
import { getApiClient } from "@/lib/client";
import { previewGeometry, type GeometryPreview } from "@/lib/app/services/preview";
import { suggestSiteName } from "@/lib/app/services/sites";
import { DEFAULT_POINT_BUFFER_RADIUS_M } from "@/lib/geo/normalize";
import { formatArea, formatDistance, formatIndianNumber, sqmToSqft } from "@/lib/geo/units";
import type { DrawTool } from "@/components/map/SiteMap";
import { DataRow, IssueList, Section } from "@/components/ui/Primitives";
import { SiteDetailsPanel } from "./SiteDetailsPanel";
import { AnalysisWorkspace, type AnalysisMainTab } from "@/components/analysis/AnalysisWorkspace";

// MapLibre touches `window` at module scope, so it cannot be server-rendered.
const SiteMap = dynamic(() => import("@/components/map/SiteMap").then((m) => m.SiteMap), {
  ssr: false,
  loading: () => <div className="loading-note">Loading map…</div>,
});

const TOOLS: Array<{ id: DrawTool; name: string; hint: string }> = [
  { id: "polygon", name: "Polygon", hint: "Click corners, click first to close" },
  { id: "rectangle", name: "Rectangle", hint: "Click and drag" },
  { id: "point", name: "Point", hint: "Click to place, buffered to a site" },
  { id: "select", name: "Edit", hint: "Drag the draft or its vertices" },
];

type MainTab = "map" | AnalysisMainTab;

const MAIN_TABS: Array<{ id: MainTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Map" },
  { id: "analysis", label: "Analyze" },
  { id: "compare", label: "Compare" },
  { id: "simulation", label: "Simulate" },
  { id: "feasibility", label: "Feasibility" },
  { id: "financials", label: "Financials" },
  { id: "evidence", label: "Evidence" },
  { id: "analyst", label: "AI" },
  { id: "report", label: "Memo" },
];

export function Workspace({ project }: { project: Project }) {
  const api = useMemo(() => getApiClient(), []);
  const [mainTab, setMainTab] = useState<MainTab>("overview");

  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [saving, setSaving] = useState(false);

  const [activeTool, setActiveTool] = useState<DrawTool>("none");
  const [draft, setDraft] = useState<InputGeometry | null>(null);
  const [bufferRadius, setBufferRadius] = useState(DEFAULT_POINT_BUFFER_RADIUS_M);

  const [basemapId, setBasemapId] = useState<BasemapId>("osm-dev");
  const [showAnchors, setShowAnchors] = useState(true);

  const clearDraftRef = useRef<(() => void) | null>(null);

  // ------------------------------------------------------------- data load
  const refresh = useCallback(async () => {
    const result = await api.listSites(project.id);
    if (result.ok) {
      setSites(result.value);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [api, project.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Draft preview: normalize → validate → measure, through the same pipeline
  // the save path uses, so the previewed number is the stored number.
  const preview: GeometryPreview | null = useMemo(
    () => (draft ? previewGeometry(draft, bufferRadius) : null),
    [draft, bufferRadius],
  );

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );

  // --------------------------------------------------------------- actions
  const handleSaveDraft = useCallback(async () => {
    if (!draft || !preview?.valid) return;
    setSaving(true);

    const sourceType =
      draft.type === "Point"
        ? ("point_buffer" as const)
        : activeTool === "rectangle"
          ? ("drawn_rectangle" as const)
          : ("drawn_polygon" as const);

    const result = await api.createSite({
      project_id: project.id,
      name: suggestSiteName(sites.length),
      source_type: sourceType,
      geometry: draft,
      buffer_radius_m: draft.type === "Point" ? bufferRadius : undefined,
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    clearDraftRef.current?.();
    setDraft(null);
    setActiveTool("none");
    setSelectedSiteId(result.value.site.id);
    await refresh();
  }, [api, draft, preview, project.id, sites.length, activeTool, bufferRadius, refresh]);

  const handleDiscardDraft = useCallback(() => {
    clearDraftRef.current?.();
    setDraft(null);
    setActiveTool("none");
  }, []);

  const handleSelectTool = useCallback(
    (tool: DrawTool) => {
      // Switching away from a draw tool abandons an unsaved draft. Only the
      // Edit tool preserves it, because editing the draft is its purpose.
      if (tool !== "select" && draft) {
        clearDraftRef.current?.();
        setDraft(null);
      }
      setActiveTool((current) => (current === tool ? "none" : tool));
    },
    [draft],
  );

  const handleRename = useCallback(
    async (siteId: string, name: string) => {
      const result = await api.updateSite(siteId, { name });
      if (!result.ok) setError(result.error);
      else await refresh();
    },
    [api, refresh],
  );

  const handleSetLandPrice = useCallback(
    async (siteId: string, value: number | null) => {
      const result = await api.updateSite(siteId, { land_price_per_acre_inr: value });
      if (!result.ok) setError(result.error);
      else await refresh();
    },
    [api, refresh],
  );

  const handleDeleteSite = useCallback(
    async (siteId: string) => {
      const result = await api.deleteSite(siteId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (selectedSiteId === siteId) setSelectedSiteId(null);
      await refresh();
    },
    [api, refresh, selectedSiteId],
  );

  const handleMapReady = useCallback((controls: { clearDraft: () => void }) => {
    clearDraftRef.current = controls.clearDraft;
  }, []);

  const basemap = getBasemapStyle(basemapId);
  const totalArea = sites.reduce((sum, site) => sum + site.measurements.area_sqm, 0);

  return (
    <div className="workspace-shell">
      <div className="tabs">
        {MAIN_TABS.map((tabDef) => (
          <button
            key={tabDef.id}
            className={mainTab === tabDef.id ? "tab-btn is-active" : "tab-btn"}
            onClick={() => setMainTab(tabDef.id)}
          >
            {tabDef.label}
          </button>
        ))}
      </div>

      <div className="workspace-body">
        {mainTab === "map" ? (
          <div className="workspace">
      {/* ============================================ LEFT: project + sites */}
      <div className="rail">
        <Section title="Project">
          <div className="stack-sm">
            <div style={{ fontSize: 13, fontWeight: 600 }}>{project.name}</div>
            <DataRow label="Asset class" value={ASSET_CLASS_LABELS[project.asset_class]} />
            <DataRow
              label="Target GFA"
              value={`${formatIndianNumber(project.target_gfa_sqft, 0)} sq ft`}
            />
            {project.region_label ? (
              <DataRow label="Submarket" value={project.region_label} />
            ) : null}
            <DataRow label="Working SRID" value={`EPSG:${project.working_srid}`} mono />
          </div>
        </Section>

        <Section title="Define Candidate Site">
          <div className="tool-grid">
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                className={activeTool === tool.id ? "tool-btn is-active" : "tool-btn"}
                onClick={() => handleSelectTool(tool.id)}
                disabled={tool.id === "select" && !draft}
                title={tool.hint}
              >
                <span className="tool-btn-name">{tool.name}</span>
                <span className="tool-btn-hint">{tool.hint}</span>
              </button>
            ))}
          </div>

          {activeTool === "point" ? (
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label htmlFor="buffer-radius">Point buffer radius (m)</label>
              <input
                id="buffer-radius"
                className="input"
                type="number"
                min={10}
                max={5000}
                step={10}
                value={bufferRadius}
                onChange={(event) => setBufferRadius(Number(event.target.value) || 10)}
              />
              <span className="field-hint">
                A point has no area, so it is buffered into a circular boundary before
                measurement.
              </span>
            </div>
          ) : null}

          {activeTool === "none" && !draft ? (
            <div className="field-hint" style={{ marginTop: 9 }}>
              Choose a tool to begin. Boundaries are validated before they can be saved.
            </div>
          ) : null}
        </Section>

        <Section
          title={`Candidate Sites (${sites.length})`}
          action={
            sites.length > 0 ? (
              <span className="badge">{formatArea(totalArea, "acres")} total</span>
            ) : null
          }
        >
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : sites.length === 0 ? (
            <div className="empty-state">
              No candidate sites yet.
              <br />
              Draw a boundary to begin the shortlist.
            </div>
          ) : (
            <div className="site-list">
              {sites.map((site) => (
                <button
                  key={site.id}
                  className={
                    site.id === selectedSiteId ? "site-item is-selected" : "site-item"
                  }
                  onClick={() => setSelectedSiteId(site.id)}
                >
                  <div className="site-item-top">
                    <span className="site-item-name">{site.name}</span>
                    <span className="numeric" style={{ fontSize: 11, fontWeight: 600 }}>
                      {formatArea(site.measurements.area_sqm, "acres")}
                    </span>
                  </div>
                  <div className="site-item-meta">
                    <span>{formatIndianNumber(sqmToSqft(site.measurements.area_sqm), 0)} sq ft</span>
                    <span>·</span>
                    <span>{formatDistance(site.measurements.perimeter_m)} perimeter</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Map Layers">
          <div className="stack-sm">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="data-key">Basemap</span>
              <div className="layer-toggle">
                {BASEMAP_OPTIONS.map((option) => (
                  <button
                    key={option}
                    className={option === basemapId ? "is-active" : ""}
                    onClick={() => setBasemapId(option)}
                  >
                    {getBasemapStyle(option).label}
                  </button>
                ))}
              </div>
            </div>
            <label className="row" style={{ justifyContent: "space-between", cursor: "pointer" }}>
              <span className="data-key">Reference anchors</span>
              <input
                type="checkbox"
                checked={showAnchors}
                onChange={(event) => setShowAnchors(event.target.checked)}
              />
            </label>
            {showAnchors ? (
              <div className="field-hint">
                Orientation points are hand-entered curated data, not authoritative, and are
                not used in any calculation.
              </div>
            ) : null}
          </div>
        </Section>
      </div>

      {/* =========================================================== CENTRE */}
      <div className="map-region">
        <SiteMap
          sites={sites}
          selectedSiteId={selectedSiteId}
          activeTool={activeTool}
          basemapId={basemapId}
          showAnchors={showAnchors}
          onDraftChange={setDraft}
          onSelectSite={setSelectedSiteId}
          onReady={handleMapReady}
        />

        <div className="map-overlay map-overlay-top-left">
          {basemap.usageWarning ? (
            <div className="alert alert-warning" style={{ maxWidth: 360 }}>
              <div className="alert-title">Development basemap</div>
              {basemap.usageWarning}
            </div>
          ) : null}

          {error ? (
            <div className="alert alert-error" style={{ maxWidth: 360 }}>
              <div className="alert-title">{error.code}</div>
              {error.message}
            </div>
          ) : null}

          {draft && preview ? (
            <div className="map-card draft-card">
              <div className="draft-head">
                <span className="section-title">Unsaved boundary</span>
                {preview.buffered ? <span className="badge badge-accent">buffered</span> : null}
              </div>

              {preview.valid && preview.measurements ? (
                <>
                  <div className="draft-measures">
                    <div>
                      <div className="draft-measure-label">Area</div>
                      <div className="draft-measure-value">
                        {formatArea(preview.measurements.area_sqm, "acres")}
                      </div>
                      <div className="field-hint">
                        {formatIndianNumber(sqmToSqft(preview.measurements.area_sqm), 0)} sq ft
                      </div>
                    </div>
                    <div>
                      <div className="draft-measure-label">Perimeter</div>
                      <div className="draft-measure-value">
                        {formatDistance(preview.measurements.perimeter_m)}
                      </div>
                      <div className="field-hint">
                        {preview.measurements.vertex_count} vertices
                      </div>
                    </div>
                  </div>

                  {preview.warnings.length > 0 ? <IssueList issues={preview.warnings} /> : null}

                  <div className="draft-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => void handleSaveDraft()}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save candidate site"}
                    </button>
                    <button className="btn" onClick={handleDiscardDraft} disabled={saving}>
                      Discard
                    </button>
                    {activeTool !== "select" ? (
                      <button className="btn" onClick={() => setActiveTool("select")}>
                        Edit
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <IssueList issues={preview.errors} />
                  <div className="draft-actions">
                    <button className="btn" onClick={handleDiscardDraft}>
                      Discard and redraw
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ============================================================ RIGHT */}
      <SiteDetailsPanel
        site={selectedSite}
        siteCount={sites.length}
        onRename={(id, name) => void handleRename(id, name)}
        onSetLandPrice={(id, value) => void handleSetLandPrice(id, value)}
        onDelete={(id) => void handleDeleteSite(id)}
      />
          </div>
        ) : (
          <div className="workspace-tab-content">
            <AnalysisWorkspace
              project={project}
              sites={sites}
              tab={mainTab}
              selectedSiteId={selectedSiteId}
              onSelectSite={setSelectedSiteId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
