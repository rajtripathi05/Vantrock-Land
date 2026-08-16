/**
 * GEOGRAPHY / SITE QUALITY metrics.
 *
 * Everything here is computed directly from the site's own stored geometry —
 * no external data, no network. This is the one metric category that can
 * never be "missing": a saved site always has measurements.
 */

import type { Metric } from "@/types/domain";
import type { Site } from "@/types/domain";
import { sqmToSqft } from "@/lib/geo/units";
import { normalizeLinear } from "../benchmarks";
import { defineMetric } from "../metric";
import { curatedAssumptionSource, geometrySource } from "../sources";

/**
 * Typical Grade-A logistics ground-coverage ratio (built footprint / site
 * area) for a single-storey warehouse with yard, dock apron, and setbacks.
 * CURATED — an industry rule of thumb, not a project-specific FSI figure.
 */
const TYPICAL_GROUND_COVERAGE_RATIO = 0.45;

export function buildGeographyMetrics(site: Site, targetGfaSqft: number): Metric[] {
  const m = site.measurements;
  const metrics: Metric[] = [];

  metrics.push(
    defineMetric({
      key: "geo.site_area",
      label: "Site area",
      category: "geography",
      raw_value: m.area_sqm,
      unit: "sqm",
      direction: "neutral",
      confidence: 1,
      status: "ok",
      calculation_note: "lib/geo/measure.ts measureArea() — geodesic area on the WGS84 ellipsoid.",
      source: geometrySource(),
    }),
  );

  // Achievable GFA under the typical coverage assumption, vs the project's
  // target. Capped at 1: a site far larger than needed is not "more benefit".
  const achievableGfaSqft = sqmToSqft(m.area_sqm) * TYPICAL_GROUND_COVERAGE_RATIO;
  const adequacyRatio = targetGfaSqft > 0 ? achievableGfaSqft / targetGfaSqft : 0;
  metrics.push(
    defineMetric({
      key: "geo.gfa_adequacy",
      label: "Target GFA adequacy",
      category: "geography",
      raw_value: achievableGfaSqft,
      raw_text: `${Math.round(achievableGfaSqft).toLocaleString("en-IN")} sq ft achievable vs ${targetGfaSqft.toLocaleString("en-IN")} sq ft target`,
      unit: "sqft",
      direction: "benefit",
      normalized_value: Math.max(0, Math.min(1, adequacyRatio)),
      confidence: 0.5,
      status: "ok",
      calculation_note: `Achievable GFA = site area (sq ft) × ${TYPICAL_GROUND_COVERAGE_RATIO} typical ground-coverage ratio, compared against the project's target GFA. Ratio ≥ 1 normalizes to full marks.`,
      source: curatedAssumptionSource(
        "ground_coverage_ratio",
        `Assumes a ${Math.round(TYPICAL_GROUND_COVERAGE_RATIO * 100)}% ground-coverage ratio typical of a single-storey Grade-A warehouse with yard and dock apron. Not survey- or design-verified for this site.`,
      ),
    }),
  );

  // Polsby–Popper compactness: 4*pi*Area / Perimeter^2, 1.0 for a circle,
  // lower for elongated or irregular shapes. A large-footprint warehouse
  // wastes buildable area on an irregular or sliver-shaped site.
  const compactness =
    m.perimeter_m > 0 ? (4 * Math.PI * m.area_sqm) / (m.perimeter_m * m.perimeter_m) : 0;
  metrics.push(
    defineMetric({
      key: "geo.shape_regularity",
      label: "Shape regularity",
      category: "geography",
      raw_value: compactness,
      unit: "index (0-1)",
      direction: "benefit",
      normalized_value: normalizeLinear(compactness, 0.75, 0.2, "benefit"),
      confidence: 1,
      status: "ok",
      calculation_note:
        "Polsby–Popper compactness index: 4π·Area / Perimeter². 1.0 is a perfect circle; lower values indicate an elongated or irregular boundary that is harder to build out efficiently for a large rectangular footprint.",
      source: geometrySource(),
    }),
  );

  return metrics;
}
