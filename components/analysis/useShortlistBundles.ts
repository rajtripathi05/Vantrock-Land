"use client";

/**
 * Per-shortlist data used by both Compare and Overview: base-case financials
 * and constraints for every site in the shortlist, fetched once and cached.
 * Factored out of CompareTab so Overview can reuse the same fetch instead of
 * duplicating it.
 */

import { useEffect, useState } from "react";
import type { SiteAnalysis } from "@/types/domain";
import type { AnalysisTools } from "@/lib/ai/tools";
import type { FinancialScenarioResult } from "@/lib/financial/types";
import type { ConstraintsResult } from "@/lib/analysis/constraints";

export function useBaseCaseFinancials(
  tools: AnalysisTools | null,
  analyses: readonly SiteAnalysis[],
): Record<string, FinancialScenarioResult | null> {
  const [financials, setFinancials] = useState<Record<string, FinancialScenarioResult | null>>({});
  const siteIds = analyses.map((a) => a.site.id).join(",");

  useEffect(() => {
    if (!tools || analyses.length === 0) {
      setFinancials({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      analyses.map(async (a) => {
        const result = await tools.getFinancials(a.site.id, "base");
        return [a.site.id, result.ok ? result.value : null] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setFinancials(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tools, siteIds]);

  return financials;
}

export function useConstraints(
  tools: AnalysisTools | null,
  analyses: readonly SiteAnalysis[],
): Record<string, ConstraintsResult | null> {
  const [constraints, setConstraints] = useState<Record<string, ConstraintsResult | null>>({});
  const siteIds = analyses.map((a) => a.site.id).join(",");

  useEffect(() => {
    if (!tools || analyses.length === 0) {
      setConstraints({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      analyses.map(async (a) => {
        const result = await tools.getConstraints(a.site.id);
        return [a.site.id, result.ok ? result.value : null] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setConstraints(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tools, siteIds]);

  return constraints;
}
