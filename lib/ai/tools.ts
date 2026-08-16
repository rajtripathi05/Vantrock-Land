/**
 * Deterministic AI tool layer (blueprint Phase 10).
 *
 * These are the ONLY functions an AI layer is allowed to call to answer a
 * question about a site, a comparison, or a financial scenario. Every one of
 * them returns data straight from the analysis/scoring/financial engines —
 * no tool here generates text, invents a number, or calls a language model.
 * The analyst-assistant UI (lib/ai/explain.ts) builds its answers by calling
 * these tools and templating over the result, never the other way around.
 *
 * AI cannot mutate source-of-truth analytical data: every method here is a
 * read. Nothing in this module writes to a repository.
 */

import type { ApiClient } from "@/lib/client";
import type { OsmDataset } from "@/lib/data/osm/types";
import { runSiteAnalysis } from "@/lib/analysis/engine";
import { findNearestHighway, type RouteOutcome } from "@/lib/analysis/metrics/accessibility";
import { getRoutingProvider } from "@/lib/providers/routing";
import type { RoutingProvider } from "@/lib/providers/routing/types";
import { scoreSite } from "@/lib/scoring/engine";
import { DEFAULT_WEIGHT_PROFILE, type WeightProfile } from "@/lib/scoring/weights";
import { buildAllScenarios, buildFinancialScenario } from "@/lib/financial/engine";
import type { FinancialOverrides, FinancialScenarioName, FinancialScenarioResult } from "@/lib/financial/types";
import { runAllSensitivities, findBreakEven, type SensitivityDimension, type SensitivityPoint, type BreakEvenResult } from "@/lib/financial/sensitivity";
import { collectEvidence, getEvidenceByIds } from "@/lib/evidence/collect";
import { buildDevelopmentFeasibility, buildLandEconomics, type LandEconomicsResult } from "@/lib/feasibility/engine";
import type { DevelopmentFeasibilityResult } from "@/lib/feasibility/types";
import { evaluateConstraints, type ConstraintsResult } from "@/lib/analysis/constraints";
import { generateQuickInsights, type QuickInsight } from "@/lib/analysis/insights";
import { classifyDecision, DEFAULT_DECISION_THRESHOLDS, type DecisionResult, type DecisionThresholds } from "@/lib/scoring/decision";
import type { Site } from "@/types/domain";
import { err, ok, type Metric, type Result, type SiteAnalysis, type SourceMetadata } from "@/types/domain";

export interface DataQualitySummary {
  coverage: number;
  confidence: number;
  source_count: number;
  live_source_count: number;
  missing_metric_count: number;
  low_confidence_metric_count: number;
}

export interface AnalysisToolsDeps {
  api: ApiClient;
  osm: OsmDataset;
  /** Defaults to the free OSRM demo provider (lib/providers/routing). Pass
   *  `null` explicitly to disable live routing (e.g. offline tests). */
  routing?: RoutingProvider | null;
}

/**
 * Analysis metrics are deterministic given (site, project, osm, route) but
 * not free to compute (spatial queries over ~65k road segments, plus a live
 * route fetch). Scoring on top of those metrics is cheap and pure
 * (lib/scoring/engine.ts). The two are cached SEPARATELY so that changing
 * the weight profile — including the interactive per-category sliders in
 * the Analysis tab, which can generate many distinct derived profiles in
 * one session — only ever re-runs the cheap scoring step, never repeats the
 * spatial queries or re-hits the routing provider.
 *
 * `metricsCache` keyed by `${site.id}:${site.updated_at}` (an edited site
 * invalidates its own entry automatically). `scoredCache` additionally keyed
 * by `${weightProfile.id}`.
 */
export class AnalysisTools {
  private readonly deps: AnalysisToolsDeps;
  private readonly routing: RoutingProvider | null;
  private weightProfile: WeightProfile;
  private readonly metricsCache = new Map<string, SiteAnalysis>();
  private readonly scoredCache = new Map<string, SiteAnalysis>();

  constructor(deps: AnalysisToolsDeps, weightProfile: WeightProfile = DEFAULT_WEIGHT_PROFILE) {
    this.deps = deps;
    this.routing = deps.routing === undefined ? getRoutingProvider() : deps.routing;
    this.weightProfile = weightProfile;
  }

  setWeightProfile(profile: WeightProfile): void {
    this.weightProfile = profile;
  }

  getWeightProfile(): WeightProfile {
    return this.weightProfile;
  }

  /** get_site_analysis(site_id) */
  async getSiteAnalysis(siteId: string): Promise<Result<SiteAnalysis>> {
    const siteResult = await this.deps.api.getSite(siteId);
    if (!siteResult.ok) return siteResult;
    const site = siteResult.value;

    const scoredKey = `${site.id}:${site.updated_at}:${this.weightProfile.id}`;
    const scoredCached = this.scoredCache.get(scoredKey);
    if (scoredCached) return ok(scoredCached);

    const metricsKey = `${site.id}:${site.updated_at}`;
    let base = this.metricsCache.get(metricsKey);
    if (!base) {
      const projectResult = await this.deps.api.getProject(site.project_id);
      if (!projectResult.ok) return projectResult;

      const routeOutcome = await this.resolveRoute(site);
      base = runSiteAnalysis(
        site,
        projectResult.value,
        this.deps.osm,
        routeOutcome,
        this.routing ?? undefined,
      );
      this.metricsCache.set(metricsKey, base);
    }

    const analysis: SiteAnalysis = { ...base, score: scoreSite(base.metrics, this.weightProfile) };
    this.scoredCache.set(scoredKey, analysis);
    return ok(analysis);
  }

  /**
   * Fetches a live route from the site centroid to the nearest mapped
   * highway, if a routing provider is configured and the site falls within
   * OSM coverage. Never throws — a network failure degrades to `null`
   * (metric reported "missing"), not a broken analysis run.
   */
  private async resolveRoute(site: Site): Promise<RouteOutcome | undefined> {
    if (!this.routing) return undefined;
    const nearestHighway = findNearestHighway(site, this.deps.osm);
    if (!nearestHighway) return null;
    const [lon, lat] = site.measurements.centroid.coordinates;
    try {
      return await this.routing.getRoute([lon, lat], nearestHighway.nearest_point);
    } catch {
      return null;
    }
  }

  /** get_site_metrics(site_id) */
  async getSiteMetrics(siteId: string): Promise<Result<Metric[]>> {
    const result = await this.getSiteAnalysis(siteId);
    return result.ok ? ok(result.value.metrics) : result;
  }

  /** get_metric(site_id, metric_key) */
  async getMetric(siteId: string, metricKey: string): Promise<Result<Metric>> {
    const result = await this.getSiteAnalysis(siteId);
    if (!result.ok) return result;
    const metric = result.value.metrics.find((m) => m.key === metricKey);
    if (!metric) return err("NOT_FOUND", `No metric "${metricKey}" on site ${siteId}.`);
    return ok(metric);
  }

  /** compare_sites(site_ids) */
  async compareSites(siteIds: readonly string[]): Promise<Result<SiteAnalysis[]>> {
    const analyses: SiteAnalysis[] = [];
    for (const siteId of siteIds) {
      const result = await this.getSiteAnalysis(siteId);
      if (!result.ok) return result;
      analyses.push(result.value);
    }
    return ok(analyses);
  }

  /** get_financials(site_id, scenario) */
  async getFinancials(
    siteId: string,
    scenario: FinancialScenarioName,
    overrides?: FinancialOverrides,
  ): Promise<Result<FinancialScenarioResult>> {
    const siteResult = await this.deps.api.getSite(siteId);
    if (!siteResult.ok) return siteResult;
    const site = siteResult.value;
    const projectResult = await this.deps.api.getProject(site.project_id);
    if (!projectResult.ok) return projectResult;

    return ok(
      buildFinancialScenario({
        scenario,
        landAreaSqm: site.measurements.area_sqm,
        landPricePerAcreInr: site.land_price_per_acre_inr,
        targetGfaSqft: projectResult.value.target_gfa_sqft,
        overrides,
      }),
    );
  }

  /** All three scenarios at once — convenience for the comparison/report UI. */
  async getAllFinancialScenarios(
    siteId: string,
    overrides?: FinancialOverrides,
  ): Promise<Result<FinancialScenarioResult[]>> {
    const siteResult = await this.deps.api.getSite(siteId);
    if (!siteResult.ok) return siteResult;
    const site = siteResult.value;
    const projectResult = await this.deps.api.getProject(site.project_id);
    if (!projectResult.ok) return projectResult;

    return ok(
      buildAllScenarios({
        landAreaSqm: site.measurements.area_sqm,
        landPricePerAcreInr: site.land_price_per_acre_inr,
        targetGfaSqft: projectResult.value.target_gfa_sqft,
        overrides,
      }),
    );
  }

  /** get_evidence(site_id, evidence_ids) */
  async getEvidence(siteId: string, evidenceIds?: readonly string[]): Promise<Result<SourceMetadata[]>> {
    const result = await this.getSiteAnalysis(siteId);
    if (!result.ok) return result;
    return ok(evidenceIds ? getEvidenceByIds(result.value, evidenceIds) : collectEvidence(result.value));
  }

  /** get_feasibility(site_id) — TestFit-inspired development feasibility proxy (blueprint §4). */
  async getFeasibility(siteId: string): Promise<Result<DevelopmentFeasibilityResult>> {
    const siteResult = await this.deps.api.getSite(siteId);
    if (!siteResult.ok) return siteResult;
    const site = siteResult.value;
    const projectResult = await this.deps.api.getProject(site.project_id);
    if (!projectResult.ok) return projectResult;
    return ok(buildDevelopmentFeasibility(site.measurements.area_sqm, projectResult.value.target_gfa_sqft));
  }

  /** get_land_economics(site_id) — blueprint §6. */
  async getLandEconomics(siteId: string): Promise<Result<LandEconomicsResult>> {
    const siteResult = await this.deps.api.getSite(siteId);
    if (!siteResult.ok) return siteResult;
    const site = siteResult.value;
    const feasibilityResult = await this.getFeasibility(siteId);
    if (!feasibilityResult.ok) return feasibilityResult;
    return ok(
      buildLandEconomics(
        site.measurements.area_sqm,
        site.land_price_per_acre_inr,
        feasibilityResult.value.achievable_gfa_sqft,
      ),
    );
  }

  /** get_constraints(site_id) — ESRI-inspired constraints/exclusions evaluator (blueprint §3/§12). */
  async getConstraints(siteId: string): Promise<Result<ConstraintsResult>> {
    const analysisResult = await this.getSiteAnalysis(siteId);
    if (!analysisResult.ok) return analysisResult;
    const feasibilityResult = await this.getFeasibility(siteId);
    if (!feasibilityResult.ok) return feasibilityResult;
    const financialsResult = await this.getFinancials(siteId, "base");
    const baseFinancials = financialsResult.ok ? financialsResult.value : null;
    return ok(evaluateConstraints(analysisResult.value, feasibilityResult.value, baseFinancials));
  }

  /** get_data_quality(site_id) — blueprint §17. */
  async getDataQuality(siteId: string): Promise<Result<DataQualitySummary>> {
    const analysisResult = await this.getSiteAnalysis(siteId);
    if (!analysisResult.ok) return analysisResult;
    const analysis = analysisResult.value;
    const sourceIds = new Set(analysis.metrics.map((m) => m.source.source_id).filter((id) => id !== "none"));
    const liveSourceIds = new Set(
      analysis.metrics.filter((m) => m.source.classification === "LIVE").map((m) => m.source.source_id),
    );
    return ok({
      coverage: analysis.score?.coverage ?? analysis.run.coverage,
      confidence: analysis.score?.confidence ?? 0,
      source_count: sourceIds.size,
      live_source_count: liveSourceIds.size,
      missing_metric_count: analysis.metrics.filter((m) => m.status === "missing").length,
      low_confidence_metric_count: analysis.metrics.filter((m) => m.status === "low_confidence" || (m.status === "ok" && m.confidence < 0.5)).length,
    });
  }

  /** get_recommendation(site_id, thresholds?) — decision thresholds engine (blueprint §11). */
  async getRecommendation(
    siteId: string,
    thresholds: DecisionThresholds = DEFAULT_DECISION_THRESHOLDS,
  ): Promise<Result<DecisionResult>> {
    const analysisResult = await this.getSiteAnalysis(siteId);
    if (!analysisResult.ok) return analysisResult;
    const constraintsResult = await this.getConstraints(siteId);
    if (!constraintsResult.ok) return constraintsResult;
    const financialsResult = await this.getFinancials(siteId, "base");
    const baseFinancials = financialsResult.ok ? financialsResult.value : null;
    const highSeverity = analysisResult.value.warnings.filter((w) => w.severity === "high").length;
    return ok(
      classifyDecision(analysisResult.value.score, baseFinancials, constraintsResult.value, highSeverity, thresholds),
    );
  }

  /** get_site_insights(site_id) — Site Quick Insights (blueprint §2). */
  async getQuickInsights(siteId: string): Promise<Result<QuickInsight[]>> {
    const analysisResult = await this.getSiteAnalysis(siteId);
    if (!analysisResult.ok) return analysisResult;
    const constraintsResult = await this.getConstraints(siteId);
    if (!constraintsResult.ok) return constraintsResult;
    const feasibilityResult = await this.getFeasibility(siteId);
    if (!feasibilityResult.ok) return feasibilityResult;
    const financialsResult = await this.getFinancials(siteId, "base");
    const baseFinancials = financialsResult.ok ? financialsResult.value : null;
    return ok(
      generateQuickInsights(analysisResult.value, constraintsResult.value, feasibilityResult.value, baseFinancials),
    );
  }

  /** get_sensitivity(site_id) — deterministic IRR sensitivity sweep (blueprint §9). */
  async getSensitivity(siteId: string): Promise<Result<Record<SensitivityDimension, SensitivityPoint[]>>> {
    const siteResult = await this.deps.api.getSite(siteId);
    if (!siteResult.ok) return siteResult;
    const site = siteResult.value;
    const projectResult = await this.deps.api.getProject(site.project_id);
    if (!projectResult.ok) return projectResult;
    return ok(
      runAllSensitivities({
        landAreaSqm: site.measurements.area_sqm,
        landPricePerAcreInr: site.land_price_per_acre_inr,
        targetGfaSqft: projectResult.value.target_gfa_sqft,
      }),
    );
  }

  /** get_break_even(site_id, dimension, target_irr_pct) — blueprint §10. */
  async getBreakEven(
    siteId: string,
    dimension: SensitivityDimension,
    targetIrrPct: number,
  ): Promise<Result<BreakEvenResult>> {
    const siteResult = await this.deps.api.getSite(siteId);
    if (!siteResult.ok) return siteResult;
    const site = siteResult.value;
    const projectResult = await this.deps.api.getProject(site.project_id);
    if (!projectResult.ok) return projectResult;
    return ok(
      findBreakEven(dimension, targetIrrPct, {
        landAreaSqm: site.measurements.area_sqm,
        landPricePerAcreInr: site.land_price_per_acre_inr,
        targetGfaSqft: projectResult.value.target_gfa_sqft,
      }),
    );
  }
}
