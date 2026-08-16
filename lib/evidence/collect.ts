/**
 * Evidence collection — every source cited by a SiteAnalysis, deduplicated.
 *
 * Metric.source IS the evidence record (blueprint Phase 9: "Every analytical
 * value should be traceable to source_id, source_name, provider, ..."). This
 * module does not introduce a second evidence store; it aggregates the
 * SourceMetadata already embedded in each metric so the UI/AI-tool layer has
 * one place to ask "what is evidence_id X" and get back a full citation.
 */

import type { Metric, SiteAnalysis, SourceMetadata } from "@/types/domain";

/** Every distinct source cited across an analysis, in first-seen order. */
export function collectEvidence(analysis: Pick<SiteAnalysis, "metrics">): SourceMetadata[] {
  const seen = new Map<string, SourceMetadata>();
  for (const metric of analysis.metrics) {
    if (!seen.has(metric.source.source_id)) {
      seen.set(metric.source.source_id, metric.source);
    }
  }
  return [...seen.values()];
}

/** Resolve a set of evidence ids (source_id values) to their full citations. */
export function getEvidenceByIds(
  analysis: Pick<SiteAnalysis, "metrics">,
  evidenceIds: readonly string[],
): SourceMetadata[] {
  const all = collectEvidence(analysis);
  const byId = new Map(all.map((source) => [source.source_id, source]));
  return evidenceIds.map((id) => byId.get(id)).filter((source): source is SourceMetadata => !!source);
}

/** All metrics that cite a given evidence id. */
export function metricsForEvidence(
  analysis: Pick<SiteAnalysis, "metrics">,
  evidenceId: string,
): Metric[] {
  return analysis.metrics.filter((metric) => metric.evidence_ids.includes(evidenceId));
}
