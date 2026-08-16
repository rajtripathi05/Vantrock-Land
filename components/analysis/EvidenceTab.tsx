"use client";

/** Evidence tab — every distinct source cited by the selected site's analysis. */

import type { Site, SiteAnalysis } from "@/types/domain";
import { collectEvidence, metricsForEvidence } from "@/lib/evidence/collect";
import { ClassificationBadge } from "@/components/ui/Primitives";

export function EvidenceTab({ site, analysis }: { site: Site | null; analysis: SiteAnalysis | null }) {
  if (!site) return <div className="empty-state">Select a candidate site to view its evidence.</div>;
  if (!analysis) return <div className="loading-note">Running analysis…</div>;

  const evidence = collectEvidence(analysis);

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h2 style={{ fontSize: 16 }}>{site.name} — Evidence &amp; Sources</h2>
      <p className="field-hint">
        Every value in this site&apos;s analysis traces back to one of the {evidence.length} sources
        below. Run: {analysis.run.id} · engine {analysis.run.engine_version}.
      </p>

      {evidence.map((source) => {
        const citingMetrics = metricsForEvidence(analysis, source.source_id);
        return (
          <div key={source.source_id} className="card">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{source.name}</span>
              <ClassificationBadge classification={source.classification} />
            </div>
            <div className="stack-sm">
              <div className="data-row">
                <span className="data-key">Provider</span>
                <span className="data-value">{source.provider}</span>
              </div>
              {source.source_url ? (
                <div className="data-row">
                  <span className="data-key">URL</span>
                  <span className="data-value">
                    <a href={source.source_url} target="_blank" rel="noreferrer">
                      {source.source_url}
                    </a>
                  </span>
                </div>
              ) : null}
              <div className="data-row">
                <span className="data-key">License</span>
                <span className="data-value">{source.license || "—"}</span>
              </div>
              <div className="data-row">
                <span className="data-key">Attribution</span>
                <span className="data-value">{source.attribution || "—"}</span>
              </div>
              <div className="data-row">
                <span className="data-key">Retrieved</span>
                <span className="data-value mono">{new Date(source.retrieved_at).toLocaleString()}</span>
              </div>
              <div className="data-row">
                <span className="data-key">Confidence</span>
                <span className="data-value">{(source.confidence * 100).toFixed(0)}%</span>
              </div>
              {source.notes ? (
                <div className="field-hint" style={{ marginTop: 4 }}>
                  {source.notes}
                </div>
              ) : null}
              <div className="field-hint" style={{ marginTop: 4 }}>
                Cited by: {citingMetrics.map((m) => m.label).join(", ")}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
