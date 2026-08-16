"use client";

/** Runs the deterministic analysis for every site in the shortlist. */

import { useCallback, useEffect, useState } from "react";
import type { AnalysisTools } from "@/lib/ai/tools";
import type { Site, SiteAnalysis } from "@/types/domain";

export interface UseSiteAnalysesResult {
  analyses: Record<string, SiteAnalysis>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSiteAnalyses(
  tools: AnalysisTools | null,
  sites: Site[],
  /**
   * Any value whose identity changes when scoring inputs change outside
   * `tools`/`sites` themselves — the active weight profile's id, for
   * example. `tools.setWeightProfile()` mutates the tools instance in
   * place, so without this, React has no dependency-array signal telling it
   * to re-fetch after a weight-profile change (the AnalysisTools-level
   * metrics/score cache split in lib/ai/tools.ts keeps that re-fetch cheap
   * — a rescore, not a re-analysis).
   */
  refreshKey?: string,
): UseSiteAnalysesResult {
  const [analyses, setAnalyses] = useState<Record<string, SiteAnalysis>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tools || sites.length === 0) {
      setAnalyses({});
      return;
    }
    setLoading(true);
    setError(null);
    const next: Record<string, SiteAnalysis> = {};
    for (const site of sites) {
      const result = await tools.getSiteAnalysis(site.id);
      if (result.ok) {
        next[site.id] = result.value;
      } else {
        setError(result.error.message);
      }
    }
    setAnalyses(next);
    setLoading(false);
  }, [tools, sites]);

  useEffect(() => {
    void refresh();
    // sites is a fresh array each render from the parent; keying on its
    // length + ids (via join) avoids refetching every render while still
    // reacting to actual shortlist/geometry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tools, sites.map((s) => `${s.id}:${s.updated_at}`).join(","), refreshKey]);

  return { analyses, loading, error, refresh };
}
