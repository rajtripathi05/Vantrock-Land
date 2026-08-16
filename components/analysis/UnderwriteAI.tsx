"use client";

/**
 * AI Analyst — Underwrite / Research modes (blueprint Phases 16-23).
 *
 * Additive alongside the existing deterministic canned-question assistant in
 * AnalystTab.tsx (which stays exactly as it is — zero cost, zero API key,
 * always available). This component is the "real model" layer: it builds a
 * compact context from data already computed by AnalysisTools (never the raw
 * OSM dataset or full site geometry), posts it to /api/analyst, and renders
 * the validated structured response. The server falls back to the same
 * deterministic demo provider if no OpenRouter key is configured or the call
 * fails — this component never knows or cares which one answered beyond the
 * "provider" label it displays.
 */

import { useMemo, useState } from "react";
import type { Project, SiteAnalysis } from "@/types/domain";
import type { AnalysisTools } from "@/lib/ai/tools";
import type { FinancialScenarioResult } from "@/lib/financial/types";
import { buildAnalystContext } from "@/lib/ai/context";
import { askAnalyst, type AskAnalystResponse } from "@/lib/ai/client";

type Mode = "underwrite" | "research";

const UNDERWRITE_PROMPTS = [
  "Why is this site the best option?",
  "What are the top risks?",
  "What assumptions drive the decision?",
  "What would change the ranking?",
  "What is the biggest financial risk?",
  "What data is missing?",
];

const RESEARCH_PROMPTS = [
  "Research infrastructure planned near this site.",
  "What should I tell the investment committee?",
];

export function UnderwriteAI({
  project,
  tools,
  analyses,
  selectedSiteId,
  weightProfileName,
}: {
  project: Project;
  tools: AnalysisTools | null;
  analyses: SiteAnalysis[];
  selectedSiteId: string | null;
  weightProfileName: string;
}) {
  const [mode, setMode] = useState<Mode>("underwrite");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AskAnalystResponse | null>(null);

  const prompts = mode === "underwrite" ? UNDERWRITE_PROMPTS : RESEARCH_PROMPTS;

  const targetSite = useMemo(
    () => analyses.find((a) => a.site.id === selectedSiteId) ?? analyses[0] ?? null,
    [analyses, selectedSiteId],
  );

  const evidenceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const analysis of analyses) {
      for (const metric of analysis.metrics) {
        if (!map.has(metric.source.source_id)) map.set(metric.source.source_id, metric.source.name);
      }
    }
    return map;
  }, [analyses]);

  const handleAsk = async (askedQuestion: string) => {
    if (!tools || analyses.length === 0) return;
    setLoading(true);
    setError(null);
    setResponse(null);

    const financials = new Map<string, FinancialScenarioResult | null>();
    for (const analysis of analyses.slice(0, 3)) {
      const result = await tools.getFinancials(analysis.site.id, "base");
      financials.set(analysis.site.id, result.ok ? result.value : null);
    }

    const context = buildAnalystContext(project, analyses, financials, weightProfileName, selectedSiteId);
    const result = await askAnalyst(mode, askedQuestion, context);

    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setQuestion(askedQuestion);
    setResponse(result.value);
  };

  const disabledReason =
    analyses.length === 0 ? "Save and select a candidate site to ask the AI analyst." : null;

  return (
    <div className="stack" style={{ maxWidth: 720, marginTop: 28 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ fontSize: 16 }}>AI Analyst</h2>
        <div className="row" style={{ gap: 6 }}>
          <button
            className={mode === "underwrite" ? "btn btn-primary btn-sm" : "btn btn-sm"}
            onClick={() => setMode("underwrite")}
          >
            Underwrite
          </button>
          <button
            className={mode === "research" ? "btn btn-primary btn-sm" : "btn btn-sm"}
            onClick={() => setMode("research")}
          >
            Research
          </button>
        </div>
      </div>

      <p className="field-hint">
        {mode === "underwrite"
          ? "Reasons over this session's score, comparison, and financial outputs. Never calculates a number — only explains ones already computed."
          : "May use live web search for current external information (infrastructure, planning, market news). Every claim is labeled EXTERNAL RESEARCH with a real source link, never blended with platform data."}
      </p>

      {disabledReason ? (
        <div className="empty-state">{disabledReason}</div>
      ) : (
        <>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {prompts.map((prompt) => (
              <button
                key={prompt}
                className="question-btn"
                disabled={loading}
                onClick={() => void handleAsk(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(event) => {
              event.preventDefault();
              if (question.trim()) void handleAsk(question.trim());
            }}
          >
            <input
              className="input"
              placeholder="Ask a question about this shortlist…"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={loading}
              maxLength={500}
            />
            <button className="btn btn-primary" type="submit" disabled={loading || !question.trim()}>
              Ask
            </button>
          </form>

          {loading ? <div className="loading-note">Thinking…</div> : null}
          {error ? (
            <div className="alert alert-error">
              <div className="alert-title">Analyst unavailable</div>
              {error}
            </div>
          ) : null}

          {response ? (
            <AnswerCard
              response={response}
              targetSiteName={targetSite?.site.name ?? null}
              evidenceNameById={evidenceNameById}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const className =
    recommendation === "PURSUE"
      ? "badge badge-accent"
      : recommendation === "REJECT"
        ? "badge badge-mock"
        : "badge badge-curated";
  return <span className={className}>{recommendation}</span>;
}

function AnswerCard({
  response,
  targetSiteName,
  evidenceNameById,
}: {
  response: AskAnalystResponse;
  targetSiteName: string | null;
  evidenceNameById: Map<string, string>;
}) {
  const { result, provider } = response;

  return (
    <div className="answer-card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <RecommendationBadge recommendation={result.recommendation} />
          {targetSiteName ? <strong>{targetSiteName}</strong> : null}
        </div>
        <span className="label muted">
          confidence {(result.confidence * 100).toFixed(0)}% · {provider}
        </span>
      </div>

      <p style={{ marginTop: 10 }}>{result.summary}</p>

      <Section title="Reasons" items={result.reasons} />
      <Section title="Risks" items={result.risks} />
      <Section title="Financial drivers" items={result.financial_drivers} />
      <Section title="Assumptions" items={result.assumptions} />
      <Section title="Data gaps / uncertainties" items={result.uncertainties} />

      {result.evidence_ids.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <div className="label muted">Evidence</div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {result.evidence_ids.map((id) => (
              <li key={id} style={{ fontSize: 13 }}>
                {evidenceNameById.get(id) ?? id}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.external_sources.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <div className="label muted">External research</div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {result.external_sources.map((source) => (
              <li key={source.url} style={{ fontSize: 13 }}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>{" "}
                <span className="muted">({source.domain}, retrieved {source.retrieved_at})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="field-hint" style={{ marginTop: 12 }}>
        AI-generated reasoning over platform data. Title, legal status, survey, geotechnical
        conditions, final zoning interpretation, market assumptions, and the investment decision
        itself require human review.
      </p>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div className="label muted">{title}</div>
      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {items.map((item, index) => (
          <li key={index} style={{ fontSize: 13 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
