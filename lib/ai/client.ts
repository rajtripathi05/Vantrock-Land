/**
 * Browser-side call to POST /api/analyst. This is the only place the browser
 * talks to the AI layer — never directly to OpenRouter (see
 * lib/ai/provider/openrouter.ts's server-only warning).
 */

import { err, ok, type Result } from "@/types/domain";
import type { AnalystContext } from "./context";
import type { AnalystMode } from "./provider/types";
import type { StructuredAnalystResponse } from "./provider/schema";

export interface AskAnalystResponse {
  provider: string;
  result: StructuredAnalystResponse;
}

export async function askAnalyst(
  mode: AnalystMode,
  question: string,
  context: AnalystContext,
): Promise<Result<AskAnalystResponse>> {
  try {
    const response = await fetch("/api/analyst", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, question, context }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      return err(
        "AI_PROVIDER_ERROR",
        body?.error?.message ?? `Analyst request failed (HTTP ${response.status}).`,
      );
    }
    return ok({ provider: body.provider as string, result: body.result as StructuredAnalystResponse });
  } catch (cause) {
    return err(
      "AI_PROVIDER_ERROR",
      cause instanceof Error ? cause.message : "Could not reach the analyst assistant.",
    );
  }
}
