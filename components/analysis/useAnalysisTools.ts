"use client";

/**
 * Loads the preloaded OSM dataset and constructs the deterministic
 * AnalysisTools instance the analysis/compare/financials/evidence/analyst
 * views all share.
 *
 * One AnalysisTools per mounted workspace, memoized so its internal
 * per-site cache survives tab switches — recomputing a full site analysis
 * (a spatial query over ~65k road segments) on every tab click would be
 * wasteful (blueprint Phase 16).
 */

import { useEffect, useMemo, useState } from "react";
import { getApiClient } from "@/lib/client";
import { loadOsmDataset } from "@/lib/data/osm/provider";
import type { OsmDataset } from "@/lib/data/osm/types";
import { AnalysisTools } from "@/lib/ai/tools";
import type { WeightProfile } from "@/lib/scoring/weights";
import { DEFAULT_WEIGHT_PROFILE } from "@/lib/scoring/weights";

export interface UseAnalysisToolsResult {
  tools: AnalysisTools | null;
  osm: OsmDataset | null;
  loading: boolean;
  error: string | null;
}

export function useAnalysisTools(weightProfile: WeightProfile = DEFAULT_WEIGHT_PROFILE): UseAnalysisToolsResult {
  const [osm, setOsm] = useState<OsmDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const api = useMemo(() => getApiClient(), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadOsmDataset()
      .then((dataset) => {
        if (!cancelled) {
          setOsm(dataset);
          setError(null);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tools = useMemo(() => (osm ? new AnalysisTools({ api, osm }) : null), [api, osm]);

  useEffect(() => {
    tools?.setWeightProfile(weightProfile);
  }, [tools, weightProfile]);

  return { tools, osm, loading, error };
}
