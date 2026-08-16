"use client";

/**
 * Right panel — everything known about the selected candidate site.
 *
 * The slice's acceptance criteria live here: area, perimeter, centroid,
 * geometry, and source type must all be visible for a selected site.
 *
 * Every value is read from site.measurements, which was computed once at write
 * time. Nothing on this screen is recalculated during render.
 */

import { useEffect, useState } from "react";
import type { Site } from "@/types/domain";
import { SITE_SOURCE_TYPE_LABELS } from "@/types/domain";
import {
  formatArea,
  formatDistance,
  formatIndianNumber,
  formatInr,
  formatLatLon,
  sqmToAcres,
  sqmToGuntha,
  sqmToHectares,
  sqmToSqft,
} from "@/lib/geo/units";
import { DataRow, MetricCell, Section } from "@/components/ui/Primitives";

export interface SiteDetailsPanelProps {
  site: Site | null;
  siteCount: number;
  onRename: (siteId: string, name: string) => void;
  onSetLandPrice: (siteId: string, value: number | null) => void;
  onDelete: (siteId: string) => void;
}

export function SiteDetailsPanel({
  site,
  siteCount,
  onRename,
  onSetLandPrice,
  onDelete,
}: SiteDetailsPanelProps) {
  const [nameDraft, setNameDraft] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const [showGeometry, setShowGeometry] = useState(false);

  useEffect(() => {
    setNameDraft(site?.name ?? "");
    setPriceDraft(
      site?.land_price_per_acre_inr != null ? String(site.land_price_per_acre_inr) : "",
    );
    setShowGeometry(false);
  }, [site]);

  if (!site) {
    return (
      <aside className="panel">
        <Section title="Candidate Site">
          <div className="empty-state">
            {siteCount === 0
              ? "No candidate sites yet. Use the drawing tools to define a boundary, then save it."
              : "Select a candidate site from the list or click its boundary on the map."}
          </div>
        </Section>
      </aside>
    );
  }

  const m = site.measurements;
  const [lon, lat] = m.centroid.coordinates;

  return (
    <aside className="panel">
      <Section
        title="Candidate Site"
        action={<span className="badge">{SITE_SOURCE_TYPE_LABELS[site.source_type]}</span>}
      >
        <div className="stack">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="site-name">Name</label>
            <input
              id="site-name"
              className="input"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => {
                const trimmed = nameDraft.trim();
                if (trimmed && trimmed !== site.name) onRename(site.id, trimmed);
                else setNameDraft(site.name);
              }}
            />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------ measurements */}
      <Section title="Site Area">
        <div className="metric-stack">
          <MetricCell
            label="Area"
            value={formatArea(m.area_sqm, "acres")}
            sub={`${formatIndianNumber(sqmToSqft(m.area_sqm), 0)} sq ft`}
          />
          <MetricCell
            label="Perimeter"
            value={formatDistance(m.perimeter_m)}
            sub={`${formatIndianNumber(m.perimeter_m, 0)} m`}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <DataRow label="Square metres" value={formatArea(m.area_sqm, "sqm")} />
          <DataRow label="Hectares" value={`${formatIndianNumber(sqmToHectares(m.area_sqm), 3)} ha`} />
          <DataRow label="Guntha" value={`${formatIndianNumber(sqmToGuntha(m.area_sqm), 1)}`} />
          <DataRow label="Acres" value={formatIndianNumber(sqmToAcres(m.area_sqm), 3)} />
        </div>
      </Section>

      {/* ---------------------------------------------------------- geometry */}
      <Section title="Geometry">
        <DataRow label="Type" value="MultiPolygon" mono />
        <DataRow label="Reference system" value="EPSG:4326" mono />
        <DataRow label="Source" value={SITE_SOURCE_TYPE_LABELS[site.source_type]} />
        <DataRow label="Vertices" value={formatIndianNumber(m.vertex_count, 0)} mono />
        <DataRow label="Interior rings" value={formatIndianNumber(m.hole_count, 0)} mono />
        <DataRow label="Parts" value={formatIndianNumber(site.geometry.coordinates.length, 0)} mono />

        {site.source_type === "point_buffer" && site.point_origin ? (
          <>
            <DataRow
              label="Point origin"
              value={formatLatLon(
                site.point_origin.coordinates[0],
                site.point_origin.coordinates[1],
              )}
              mono
            />
            <DataRow label="Buffer radius" value={`${site.buffer_radius_m} m`} mono />
          </>
        ) : null}
      </Section>

      {/* ---------------------------------------------------------- centroid */}
      <Section title="Centroid">
        <DataRow label="Position" value={formatLatLon(lon, lat)} mono />
        <DataRow label="Longitude" value={lon.toFixed(7)} mono />
        <DataRow label="Latitude" value={lat.toFixed(7)} mono />
        <div style={{ marginTop: 8 }} className="field-hint">
          Bounding box {m.bbox.map((value) => value.toFixed(4)).join(", ")}
        </div>
      </Section>

      {/* ---------------------------------------------------- commercial input */}
      <Section title="Commercial">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="land-price">Land price (₹ per acre)</label>
          <input
            id="land-price"
            className="input"
            inputMode="numeric"
            placeholder="Not set"
            value={priceDraft}
            onChange={(event) => setPriceDraft(event.target.value)}
            onBlur={() => {
              const trimmed = priceDraft.trim();
              if (trimmed === "") {
                if (site.land_price_per_acre_inr != null) onSetLandPrice(site.id, null);
                return;
              }
              const parsed = Number(trimmed.replace(/[,\s₹]/g, ""));
              if (Number.isFinite(parsed) && parsed > 0) onSetLandPrice(site.id, parsed);
              else
                setPriceDraft(
                  site.land_price_per_acre_inr != null
                    ? String(site.land_price_per_acre_inr)
                    : "",
                );
            }}
          />
          <span className="field-hint">
            {site.land_price_per_acre_inr != null
              ? `${formatInr(site.land_price_per_acre_inr)} per acre · ${formatInr(
                  site.land_price_per_acre_inr * sqmToAcres(m.area_sqm),
                )} for this site`
              : "Left unset. An unknown assumption is never given a default value."}
          </span>
        </div>
      </Section>

      {/* ------------------------------------------------------------- raw */}
      <Section
        title="Stored Geometry"
        action={
          <button className="btn btn-sm" onClick={() => setShowGeometry((value) => !value)}>
            {showGeometry ? "Hide" : "Inspect"}
          </button>
        }
      >
        {showGeometry ? (
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: 9,
              maxHeight: 220,
              overflow: "auto",
              background: "var(--surface-0)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              fontSize: 10,
              lineHeight: 1.5,
              color: "var(--text-secondary)",
            }}
          >
            {JSON.stringify(site.geometry, null, 1)}
          </pre>
        ) : (
          <div className="field-hint">
            Canonical GeoJSON as persisted. This is the exact payload the PostGIS
            column will receive.
          </div>
        )}
      </Section>

      <Section title="Record">
        <DataRow label="Site ID" value={<span style={{ fontSize: 10 }}>{site.id}</span>} mono />
        <DataRow label="Created" value={new Date(site.created_at).toLocaleString()} />
        <DataRow label="Updated" value={new Date(site.updated_at).toLocaleString()} />
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-danger btn-block"
            onClick={() => {
              if (confirm(`Delete "${site.name}"? This cannot be undone.`)) onDelete(site.id);
            }}
          >
            Delete candidate site
          </button>
        </div>
      </Section>
    </aside>
  );
}
