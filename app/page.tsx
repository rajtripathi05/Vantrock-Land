"use client";

/**
 * Project index — create a project, or open an existing one.
 *
 * A client component because the local persistence driver is IndexedDB, which
 * only exists in the browser. Once the Supabase repository lands this becomes
 * a Server Component reading through a route handler; the ApiClient call sites
 * below do not change.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppError, AssetClass, Project } from "@/types/domain";
import { ASSET_CLASS_LABELS } from "@/types/domain";
import { getApiClient } from "@/lib/client";
import { formatIndianNumber } from "@/lib/geo/units";
import { AppHeader } from "@/components/AppHeader";

export default function ProjectIndexPage() {
  const api = useMemo(() => getApiClient(), []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [siteCounts, setSiteCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("grade_a_logistics");
  const [targetGfa, setTargetGfa] = useState("500000");
  const [regionLabel, setRegionLabel] = useState("Pune / Chakan / Talegaon");

  const refresh = useCallback(async () => {
    const result = await api.listProjects();
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setProjects(result.value);
    setError(null);

    const counts: Record<string, number> = {};
    for (const project of result.value) {
      const sites = await api.listSites(project.id);
      counts[project.id] = sites.ok ? sites.value.length : 0;
    }
    setSiteCounts(counts);
    setLoading(false);
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setSubmitting(true);

      const result = await api.createProject({
        name,
        asset_class: assetClass,
        target_gfa_sqft: Number(targetGfa.replace(/[,\s]/g, "")),
        region_label: regionLabel.trim() || null,
      });

      setSubmitting(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setName("");
      await refresh();
    },
    [api, name, assetClass, targetGfa, regionLabel, refresh],
  );

  const handleDelete = useCallback(
    async (project: Project) => {
      const count = siteCounts[project.id] ?? 0;
      const message =
        count > 0
          ? `Delete "${project.name}" and its ${count} candidate site${count === 1 ? "" : "s"}? This cannot be undone.`
          : `Delete "${project.name}"? This cannot be undone.`;
      if (!confirm(message)) return;

      const result = await api.deleteProject(project.id);
      if (!result.ok) setError(result.error);
      else await refresh();
    },
    [api, siteCounts, refresh],
  );

  return (
    <div className="app-shell">
      <AppHeader />

      <div className="page-scroll">
        <div className="page-container">
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">
            A project holds a shortlist of candidate sites for one acquisition mandate.
          </p>

          {error ? (
            <div className="alert alert-error" style={{ marginBottom: 18 }}>
              <div className="alert-title">{error.code}</div>
              {error.message}
            </div>
          ) : null}

          <div className="split">
            {/* --------------------------------------------------- list */}
            <div>
              {loading ? (
                <div className="loading-note">Loading projects…</div>
              ) : projects.length === 0 ? (
                <div className="empty-state" style={{ padding: 34 }}>
                  No projects yet.
                  <br />
                  Create one to begin building a site shortlist.
                </div>
              ) : (
                projects.map((project) => (
                  <div key={project.id} className="project-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="project-row-name">{project.name}</div>
                      <div className="project-row-meta">
                        <span>{ASSET_CLASS_LABELS[project.asset_class]}</span>
                        <span>{formatIndianNumber(project.target_gfa_sqft, 0)} sq ft target</span>
                        <span>
                          {siteCounts[project.id] ?? 0} candidate site
                          {(siteCounts[project.id] ?? 0) === 1 ? "" : "s"}
                        </span>
                        {project.region_label ? <span>{project.region_label}</span> : null}
                      </div>
                    </div>
                    <div className="project-row-actions">
                      <Link className="btn btn-primary btn-sm" href={`/projects/${project.id}`}>
                        Open
                      </Link>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => void handleDelete(project)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ------------------------------------------------- create */}
            <form className="card" onSubmit={(event) => void handleCreate(event)}>
              <h2 style={{ fontSize: 13, marginBottom: 14 }}>New project</h2>

              <div className="field">
                <label htmlFor="project-name">Project name</label>
                <input
                  id="project-name"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Pune Logistics Q3 2026"
                  required
                  maxLength={120}
                />
              </div>

              <div className="field">
                <label htmlFor="asset-class">Asset class</label>
                <select
                  id="asset-class"
                  className="select"
                  value={assetClass}
                  onChange={(event) => setAssetClass(event.target.value as AssetClass)}
                >
                  {(Object.keys(ASSET_CLASS_LABELS) as AssetClass[]).map((value) => (
                    <option key={value} value={value}>
                      {ASSET_CLASS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="target-gfa">Target GFA (sq ft)</label>
                <input
                  id="target-gfa"
                  className="input"
                  inputMode="numeric"
                  value={targetGfa}
                  onChange={(event) => setTargetGfa(event.target.value)}
                  required
                />
                <span className="field-hint">
                  The development programme size. Drives site-adequacy scoring later.
                </span>
              </div>

              <div className="field">
                <label htmlFor="region-label">Submarket</label>
                <input
                  id="region-label"
                  className="input"
                  value={regionLabel}
                  onChange={(event) => setRegionLabel(event.target.value)}
                  maxLength={120}
                />
                <span className="field-hint">Display label only. Never used in calculations.</span>
              </div>

              <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create project"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
