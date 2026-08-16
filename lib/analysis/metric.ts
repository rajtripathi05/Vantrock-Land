/**
 * Metric construction helper.
 *
 * Every metric builder in lib/analysis/metrics/* funnels through this so the
 * Metric shape (types/domain.ts) is filled consistently: evidence_ids is
 * always derived from the source, resolution_note defaults to null, and a
 * MISSING metric can never carry a normalized_value.
 */

import type { Metric, MetricCategory, MetricDirection, MetricStatus, SourceMetadata } from "@/types/domain";

export interface MetricInput {
  key: string;
  label: string;
  category: MetricCategory;
  raw_value: number | null;
  raw_text?: string | null;
  unit: string;
  direction: MetricDirection;
  normalized_value?: number | null;
  confidence: number;
  status: MetricStatus;
  calculation_note: string;
  resolution_note?: string | null;
  source: SourceMetadata;
}

export function defineMetric(input: MetricInput): Metric {
  return {
    key: input.key,
    label: input.label,
    category: input.category,
    raw_value: input.raw_value,
    raw_text: input.raw_text ?? null,
    unit: input.unit,
    direction: input.direction,
    normalized_value: input.status === "missing" ? null : (input.normalized_value ?? null),
    confidence: input.confidence,
    status: input.status,
    calculation_note: input.calculation_note,
    resolution_note: input.resolution_note ?? null,
    source: input.source,
    evidence_ids: input.source.source_id === "none" ? [] : [input.source.source_id],
  };
}

/** Shorthand for a metric this MVP has no data source for. */
export function missingMetric(
  key: string,
  label: string,
  category: MetricCategory,
  unit: string,
  direction: MetricDirection,
  reason: string,
  source: SourceMetadata,
): Metric {
  return defineMetric({
    key,
    label,
    category,
    raw_value: null,
    unit,
    direction,
    confidence: 0,
    status: "missing",
    calculation_note: reason,
    source,
  });
}
