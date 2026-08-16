"use client";

/**
 * Fetches the deterministic feasibility/constraints/decision/insights bundle
 * for one selected site (blueprint §2/§3/§4/§6/§11), all read straight from
 * lib/ai/tools.ts. Same "fetch once per site, cache in component state"
 * shape as useSiteAnalyses.ts.
 */

import { useEffect, useState } from "react";
import type { AnalysisTools } from "@/lib/ai/tools";
import type { Site } from "@/types/domain";
import type { LandEconomicsResult } from "@/lib/feasibility/engine";
import type { DevelopmentFeasibilityResult } from "@/lib/feasibility/types";
import type { ConstraintsResult } from "@/lib/analysis/constraints";
import type { QuickInsight } from "@/lib/analysis/insights";
import type { DecisionResult } from "@/lib/scoring/decision";
import type { FinancialScenarioResult } from "@/lib/financial/types";
import type { Result } from "@/types/domain";

function firstErrorMessage(results: ReadonlyArray<Result<unknown>>): string | null {
  const failed = results.find((r) => !r.ok);
  return failed && !failed.ok ? failed.error.message : null;
}

export interface FeasibilityBundle {
  feasibility: DevelopmentFeasibilityResult | null;
  landEconomics: LandEconomicsResult | null;
  constraints: ConstraintsResult | null;
  insights: QuickInsight[];
  decision: DecisionResult | null;
  baseFinancials: FinancialScenarioResult | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: FeasibilityBundle = {
  feasibility: null,
  landEconomics: null,
  constraints: null,
  insights: [],
  decision: null,
  baseFinancials: null,
  loading: false,
  error: null,
};

export function useFeasibilityBundle(tools: AnalysisTools | null, site: Site | null): FeasibilityBundle {
  const [bundle, setBundle] = useState<FeasibilityBundle>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    if (!tools || !site) {
      setBundle(EMPTY);
      return;
    }
    setBundle((prev) => ({ ...prev, loading: true, error: null }));

    (async () => {
      const [feasibilityRes, landRes, constraintsRes, insightsRes, decisionRes, financialsRes] = await Promise.all([
        tools.getFeasibility(site.id),
        tools.getLandEconomics(site.id),
        tools.getConstraints(site.id),
        tools.getQuickInsights(site.id),
        tools.getRecommendation(site.id),
        tools.getFinancials(site.id, "base"),
      ]);
      if (cancelled) return;

      setBundle({
        feasibility: feasibilityRes.ok ? feasibilityRes.value : null,
        landEconomics: landRes.ok ? landRes.value : null,
        constraints: constraintsRes.ok ? constraintsRes.value : null,
        insights: insightsRes.ok ? insightsRes.value : [],
        decision: decisionRes.ok ? decisionRes.value : null,
        baseFinancials: financialsRes.ok ? financialsRes.value : null,
        loading: false,
        error: firstErrorMessage([feasibilityRes, landRes, constraintsRes, insightsRes, decisionRes]),
      });
    })();

    return () => {
      cancelled = true;
    };
    // `site` itself is a fresh object each render from the parent; keying on
    // id/updated_at (like useSiteAnalyses.ts) avoids refetching every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tools, site?.id, site?.updated_at]);

  return bundle;
}
