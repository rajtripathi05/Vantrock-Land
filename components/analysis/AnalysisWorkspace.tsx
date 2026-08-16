"use client";

/**
 * Container for the Analysis / Compare / Financials / Evidence / Analyst /
 * Report tabs (blueprint Phase 13 information architecture). Owns the
 * shared AnalysisTools instance and the per-site analysis cache so every
 * tab reads the same numbers.
 */

import { useMemo, useState } from "react";
import type { Project, Site } from "@/types/domain";
import { useAnalysisTools } from "./useAnalysisTools";
import { useSiteAnalyses } from "./useSiteAnalyses";
import { WEIGHT_PROFILES, DEFAULT_WEIGHT_PROFILE, type WeightProfile } from "@/lib/scoring/weights";
import { AnalysisTab } from "./AnalysisTab";
import { FeasibilityPanel } from "./FeasibilityPanel";
import { CompareTab } from "./CompareTab";
import { FinancialsTab } from "./FinancialsTab";
import { SimulationTab } from "./SimulationTab";
import { EvidenceTab } from "./EvidenceTab";
import { AnalystTab } from "./AnalystTab";
import { UnderwriteAI } from "./UnderwriteAI";
import { InvestmentSummary } from "@/components/report/InvestmentSummary";

export type AnalysisMainTab =
  | "analysis"
  | "feasibility"
  | "compare"
  | "financials"
  | "simulation"
  | "evidence"
  | "analyst"
  | "report";

export function AnalysisWorkspace({
  project,
  sites,
  tab,
  selectedSiteId,
  onSelectSite,
}: {
  project: Project;
  sites: Site[];
  tab: AnalysisMainTab;
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
}) {
  const [presetId, setPresetId] = useState(DEFAULT_WEIGHT_PROFILE.id);
  const presetProfile = useMemo(
    () => WEIGHT_PROFILES.find((p) => p.id === presetId) ?? DEFAULT_WEIGHT_PROFILE,
    [presetId],
  );
  // Non-null once an analyst drags a category slider — a profile derived
  // from presetProfile via lib/scoring/reweight.ts, not one of the fixed
  // WEIGHT_PROFILES. Cleared whenever a different preset is picked.
  const [customProfile, setCustomProfile] = useState<WeightProfile | null>(null);
  const activeProfile = customProfile ?? presetProfile;

  const handlePresetChange = (id: string) => {
    setPresetId(id);
    setCustomProfile(null);
  };

  const { tools, loading: osmLoading, error: osmError } = useAnalysisTools(activeProfile);
  const { analyses, loading: analysesLoading, error: analysesError } = useSiteAnalyses(
    tools,
    sites,
    activeProfile.id,
  );

  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;
  const selectedAnalysis = selectedSiteId ? (analyses[selectedSiteId] ?? null) : null;
  const analysisList = Object.values(analyses);

  if (osmError) {
    return (
      <div className="alert alert-error">
        <div className="alert-title">Reference data unavailable</div>
        {osmError}. Run <code>npm run ingest:osm</code> to (re)generate public/data/osm/*.json, or check
        that the dev server is serving the public/ directory.
      </div>
    );
  }

  if (osmLoading) {
    return <div className="loading-note">Loading reference data (roads, POIs)…</div>;
  }

  if (sites.length === 0) {
    return (
      <div className="empty-state">
        No candidate sites yet. Draw and save at least one boundary on the Map &amp; Sites tab before
        running analysis.
      </div>
    );
  }

  return (
    <div className="stack">
      {tab !== "compare" && tab !== "report" ? (
        <div className="field" style={{ maxWidth: 320, margin: 0 }}>
          <label htmlFor="analysis-site-select">Site</label>
          <select
            id="analysis-site-select"
            className="select"
            value={selectedSiteId ?? ""}
            onChange={(event) => onSelectSite(event.target.value)}
          >
            <option value="" disabled>
              Select a site…
            </option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {analysesLoading ? <div className="loading-note">Running analysis…</div> : null}
      {analysesError ? (
        <div className="alert alert-error">
          <div className="alert-title">Analysis error</div>
          {analysesError}
        </div>
      ) : null}

      {tab === "analysis" ? (
        <AnalysisTab
          site={selectedSite}
          analysis={selectedAnalysis}
          presetId={presetId}
          activeProfile={activeProfile}
          isCustomProfile={customProfile !== null}
          onPresetChange={handlePresetChange}
          onCustomProfileChange={setCustomProfile}
          onResetToPreset={() => setCustomProfile(null)}
        />
      ) : null}
      {tab === "feasibility" ? (
        <FeasibilityPanel site={selectedSite} analysis={selectedAnalysis} tools={tools} />
      ) : null}
      {tab === "compare" ? <CompareTab analyses={analysisList} tools={tools} /> : null}
      {tab === "financials" ? <FinancialsTab site={selectedSite} tools={tools} /> : null}
      {tab === "simulation" ? <SimulationTab site={selectedSite} analysis={selectedAnalysis} tools={tools} /> : null}
      {tab === "evidence" ? <EvidenceTab site={selectedSite} analysis={selectedAnalysis} /> : null}
      {tab === "analyst" ? (
        <>
          <AnalystTab analyses={analysisList} selectedSiteId={selectedSiteId} />
          <UnderwriteAI
            project={project}
            tools={tools}
            analyses={analysisList}
            selectedSiteId={selectedSiteId}
            weightProfileName={activeProfile.name}
          />
        </>
      ) : null}
      {tab === "report" ? <InvestmentSummary project={project} analyses={analysisList} /> : null}
    </div>
  );
}
