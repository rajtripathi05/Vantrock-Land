/** Shared metric-value formatting, used by both the UI and the analyst-assistant templates. */

import type { Metric } from "@/types/domain";
import { formatIndianNumber, formatInr } from "@/lib/geo/units";

export function formatMetricValue(metric: Metric): string {
  if (metric.raw_value === null) return metric.raw_text ?? "—";
  if (metric.unit === "m") return `${formatIndianNumber(metric.raw_value, 0)} m`;
  if (metric.unit.startsWith("INR")) return formatInr(metric.raw_value);
  return `${formatIndianNumber(metric.raw_value, metric.raw_value < 10 ? 2 : 0)} ${metric.unit}`;
}

export function formatStatus(status: Metric["status"]): string {
  switch (status) {
    case "ok":
      return "OK";
    case "missing":
      return "Missing";
    case "low_confidence":
      return "Low confidence";
    case "conflicted":
      return "Conflicted";
    default:
      return status;
  }
}
