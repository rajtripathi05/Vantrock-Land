/**
 * Metric normalization — raw values to a 0..1 scale against a fixed benchmark
 * band, documented in docs/SCORING_MODEL.md.
 *
 * Benchmark bands are Vantrock's own analytical judgement for Grade-A
 * industrial/logistics siting in the Pune corridor (CURATED), not a
 * regulatory or market-derived standard. They are deliberately simple linear
 * ramps: below the "good" edge normalizes to 1, beyond the "poor" edge
 * normalizes to 0, and the metric's `direction` decides which edge is which.
 *
 * PURE MODULE: no I/O, no framework, no storage.
 */

import type { MetricDirection } from "@/types/domain";

/**
 * Normalize `value` against [goodEdge, poorEdge] according to `direction`.
 *
 * For a "cost" metric (lower is better, e.g. distance), goodEdge < poorEdge:
 * a value at or below goodEdge normalizes to 1, at or above poorEdge to 0.
 * For a "benefit" metric (higher is better, e.g. POI density), goodEdge >
 * poorEdge: a value at or above goodEdge normalizes to 1.
 */
export function normalizeLinear(
  value: number,
  goodEdge: number,
  poorEdge: number,
  direction: Extract<MetricDirection, "benefit" | "cost">,
): number {
  if (goodEdge === poorEdge) return value <= goodEdge ? 1 : 0;

  const t = (value - poorEdge) / (goodEdge - poorEdge);
  const clamped = Math.max(0, Math.min(1, t));
  // For a cost metric, goodEdge < poorEdge, so t already runs 0 (at poorEdge)
  // to 1 (at goodEdge) in the right direction. For a benefit metric it's
  // reversed by construction of the edges, so no further flip is needed —
  // callers pass edges consistent with `direction`.
  void direction;
  return clamped;
}

export interface BenchmarkBand {
  /** Value at or beyond which the metric normalizes to 1. */
  goodEdge: number;
  /** Value at or beyond which the metric normalizes to 0. */
  poorEdge: number;
  direction: Extract<MetricDirection, "benefit" | "cost">;
  unit: string;
  /** Human-readable description of where the band came from. */
  rationale: string;
}

export function normalizeAgainstBand(value: number, band: BenchmarkBand): number {
  return normalizeLinear(value, band.goodEdge, band.poorEdge, band.direction);
}
