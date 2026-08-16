"use client";

/**
 * Site-selection workspace for one project.
 *
 * Resolves the project through the ApiClient, then hands off to Workspace.
 * The loading and not-found states are handled here so Workspace can assume a
 * project exists.
 */

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import type { AppError, Project } from "@/types/domain";
import { getApiClient } from "@/lib/client";
import { AppHeader } from "@/components/AppHeader";
import { Workspace } from "@/components/workspace/Workspace";

export default function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const api = useMemo(() => getApiClient(), []);

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await api.getProject(id);
      if (cancelled) return;
      if (result.ok) setProject(result.value);
      else setError(result.error);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  return (
    <div className="app-shell">
      <AppHeader>
        {project ? (
          <div className="row" style={{ gap: 10 }}>
            <Link href="/" className="muted" style={{ fontSize: 11 }}>
              Projects
            </Link>
            <span className="muted" style={{ fontSize: 11 }}>
              /
            </span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{project.name}</span>
          </div>
        ) : null}
      </AppHeader>

      {loading ? (
        <div className="loading-note">Loading project…</div>
      ) : error || !project ? (
        <div className="page-scroll">
          <div className="page-container">
            <div className="alert alert-error">
              <div className="alert-title">{error?.code ?? "NOT_FOUND"}</div>
              {error?.message ?? "This project could not be found."}
            </div>
            <div style={{ marginTop: 16 }}>
              <Link className="btn" href="/">
                Back to projects
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <Workspace project={project} />
      )}
    </div>
  );
}
