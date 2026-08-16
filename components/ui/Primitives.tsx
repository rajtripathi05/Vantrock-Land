"use client";

/**
 * Small presentational primitives.
 *
 * Pure display. They receive already-computed values and format them via
 * lib/geo/units — no component performs arithmetic on a stored number.
 */

import type { ReactNode } from "react";
import type { SourceClassification } from "@/types/domain";
import type { GeometryIssue } from "@/lib/geo/validate";

export function DataRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="data-row">
      <span className="data-key">{label}</span>
      <span className={mono ? "data-value mono" : "data-value"}>{value}</span>
    </div>
  );
}

export function MetricCell({
  label,
  value,
  sub,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "metric-cell metric-cell-wide" : "metric-cell"}>
      <div className="metric-cell-label">{label}</div>
      <div className="metric-cell-value">{value}</div>
      {sub ? <div className="metric-cell-sub">{sub}</div> : null}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * Provenance badge.
 *
 * Blueprint rules 11-12: curated, derived, and mock data must carry a visible
 * qualifier so it can never read as a measured fact. The badge styling is
 * driven from the classification field, not chosen per call site, so a new
 * data source cannot be added without one.
 */
export function ClassificationBadge({ classification }: { classification: SourceClassification }) {
  const className =
    classification === "MOCK"
      ? "badge badge-mock"
      : classification === "CURATED" || classification === "DERIVED"
        ? "badge badge-curated"
        : "badge";
  const label = classification === "MOCK" ? "Demo data" : classification.toLowerCase();
  return <span className={className}>{label}</span>;
}

/** PASS/WARN/FAIL/UNKNOWN constraint status pill (blueprint §3). */
export function StatusBadge({ status }: { status: "PASS" | "WARN" | "FAIL" | "UNKNOWN" }) {
  const className = `badge badge-${status.toLowerCase()}`;
  return <span className={className}>{status}</span>;
}

/** PURSUE/HOLD/REJECT decision pill (blueprint §11). */
export function DecisionBadge({ classification }: { classification: "PURSUE" | "HOLD" | "REJECT" }) {
  const className = `badge badge-${classification.toLowerCase()}`;
  return <span className={className}>{classification}</span>;
}

export type DataQualityLevel = "GOOD" | "FAIR" | "LIMITED";

/**
 * Coverage/confidence rolled into one UI-layer label so a score never reads
 * as more certain than the data behind it. Presentation-only threshold —
 * not a scoring input.
 */
export function dataQualityLevel(coverage: number, confidence: number): DataQualityLevel {
  if (coverage >= 0.8 && confidence >= 0.8) return "GOOD";
  if (coverage >= 0.5 && confidence >= 0.5) return "FAIR";
  return "LIMITED";
}

export function DataQualityBadge({ coverage, confidence }: { coverage: number; confidence: number }) {
  const level = dataQualityLevel(coverage, confidence);
  const className = `badge badge-dq-${level.toLowerCase()}`;
  return <span className={className}>{level}</span>;
}

export function IssueList({ issues }: { issues: GeometryIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="stack-sm">
      {issues.map((issue, index) => (
        <div
          key={`${issue.code}-${index}`}
          className={issue.severity === "error" ? "alert alert-error" : "alert alert-warning"}
        >
          <div className="alert-title">{humanizeCode(issue.code)}</div>
          {issue.message}
        </div>
      ))}
    </div>
  );
}

function humanizeCode(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}
