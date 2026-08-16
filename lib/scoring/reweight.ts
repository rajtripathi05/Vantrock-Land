/**
 * Category reweighting — build a derived WeightProfile where one
 * MetricCategory's share of total weight is set to a new value, and every
 * other category is scaled proportionally to keep the total at 1.0.
 *
 * Backs both the weight-adjustment UI ("instant recomputation" per blueprint
 * Phase 5) and the analyst-assistant "what happens if accessibility is
 * weighted 35%?" question — both need the same deterministic operation.
 *
 * PURE MODULE: no I/O, no framework, no storage.
 */

import type { Metric, MetricCategory } from "@/types/domain";
import type { WeightProfile } from "./weights";

/** One category, or a group of categories treated as a single UI control (e.g. "Climate/Risk" spans both the `climate` and `hazard` metric categories). */
type CategoryOrGroup = MetricCategory | readonly MetricCategory[];

function toCategorySet(categories: CategoryOrGroup): Set<MetricCategory> {
  return new Set(Array.isArray(categories) ? categories : [categories as MetricCategory]);
}

export function categoryWeight(
  profile: WeightProfile,
  metrics: readonly Metric[],
  categories: CategoryOrGroup,
): number {
  const categorySet = toCategorySet(categories);
  const categoryOf = new Map(metrics.map((m) => [m.key, m.category]));
  let sum = 0;
  for (const [key, weight] of Object.entries(profile.weights)) {
    const category = categoryOf.get(key);
    if (category !== undefined && categorySet.has(category)) sum += weight;
  }
  return sum;
}

export function reweightCategory(
  profile: WeightProfile,
  metrics: readonly Metric[],
  categories: CategoryOrGroup,
  newCategoryWeight: number,
): WeightProfile {
  const categorySet = toCategorySet(categories);
  const categoryOf = new Map(metrics.map((m) => [m.key, m.category]));
  const currentCategoryWeight = categoryWeight(profile, metrics, categories);
  const clampedNew = Math.max(0, Math.min(1, newCategoryWeight));
  const remainderOld = 1 - currentCategoryWeight;
  const remainderNew = 1 - clampedNew;
  const otherScale = remainderOld > 0 ? remainderNew / remainderOld : 0;
  const inCategoryScale = currentCategoryWeight > 0 ? clampedNew / currentCategoryWeight : 0;

  const weights: Record<string, number> = {};
  for (const [key, weight] of Object.entries(profile.weights)) {
    const category = categoryOf.get(key);
    const inCategory = category !== undefined && categorySet.has(category);
    weights[key] = weight * (inCategory ? inCategoryScale : otherScale);
  }

  const label = [...categorySet].join("+");
  return {
    id: `${profile.id}_reweighted_${label}_${clampedNew.toFixed(2)}`,
    name: `${profile.name} (${label} → ${(clampedNew * 100).toFixed(0)}%)`,
    description: `Derived from "${profile.name}" with ${label} set to ${(clampedNew * 100).toFixed(0)}% of total weight; every other category scaled proportionally.`,
    weights,
  };
}
