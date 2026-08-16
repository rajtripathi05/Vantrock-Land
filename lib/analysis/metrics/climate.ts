/**
 * CLIMATE / HAZARD metrics — explicit MISSING in this MVP.
 *
 * No free, reliable flood/hazard/rainfall dataset is integrated yet (blueprint
 * Phase 2/14: "only reliable/free sources, otherwise explicit missing/derived
 * state"). Candidates for a later slice — India-WRIS flood layers, Bhuvan
 * hazard atlas, IMD rainfall normals — are named in docs/ROADMAP.md. Until
 * one is wired in, these metrics report MISSING rather than a value with no
 * real basis.
 */

import type { Metric, Site } from "@/types/domain";
import { missingMetric } from "../metric";
import { missingSource } from "../sources";

export function buildClimateMetrics(_site: Site): Metric[] {
  return [
    missingMetric(
      "climate.flood_exposure_proxy",
      "Flood exposure (proxy)",
      "hazard",
      "index",
      "cost",
      "No flood-hazard data source is wired into this MVP. Candidates: India-WRIS flood layers, Bhuvan hazard atlas. See docs/ROADMAP.md.",
      missingSource("No HazardProvider implemented."),
    ),
    missingMetric(
      "climate.extreme_heat_days",
      "Extreme-heat days (annual)",
      "climate",
      "days/yr",
      "cost",
      "No climate normals data source is wired into this MVP. Candidate: IMD gridded rainfall/temperature normals.",
      missingSource("No ClimateProvider implemented."),
    ),
  ];
}
