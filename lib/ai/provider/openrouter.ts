/**
 * Server-side OpenRouter provider (blueprint Phase 16).
 *
 * SECURITY: this module reads OPENROUTER_API_KEY from process.env and sends
 * it in an Authorization header. It must only ever be instantiated inside a
 * Next.js route handler (app/api/analyst/route.ts) — never imported from a
 * "use client" component, never returned in a response body, never logged.
 *
 * Cost control (blueprint Phase 22): one call per question, a compact stable
 * system prompt (cacheable by providers that support prompt caching), a
 * compact JSON-serialized context (never the full database/OSM/GeoJSON —
 * see lib/ai/context.ts), a capped max_tokens, and at most one retry, only
 * when the first response fails schema validation.
 */

import { structuredAnalystResponseSchema, type StructuredAnalystResponse } from "./schema";
import type { AIProvider, AskAnalystRequest } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000;

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

const SYSTEM_PROMPT = `You are Vantrock Intelligence's investment analyst assistant for Grade-A industrial/logistics site acquisition in the Pune/Chakan/Talegaon corridor, India.

You REASON over data a deterministic engine already computed. You never calculate scores or financial figures and never invent a number not present in the supplied context. Every specific metric claim must cite a real evidence_id from the context's site evidence lists — never invent one.

Four modes:
- underwrite: explain the supplied site analysis, score, comparison, and financials only. Do not claim to have searched the web.
- research: you may use web search for current external information (infrastructure announcements, planning/zoning changes, market news). Every external claim must appear in external_sources with a real title/url/domain/retrieved_at. Never blend external research into evidence_ids (those are for the deterministic context only).
- challenge: CHALLENGE THE DEAL. Actively attack the investment thesis for the selected/leading site using only the supplied context — do not soften it. Put the strongest counter-arguments in "risks" (what could make this investment fail), name the single most fragile assumption and the weakest-confidence data point explicitly, and describe what data or downside scenario is most underappreciated in "uncertainties". "reasons" should list what would have to be true for the recommendation to flip. Still cite real evidence_ids; do not invent a weakness that contradicts the supplied data.
- memo: produce a full investment-committee memo. Use "summary" for the executive summary and investment thesis, "reasons" for key drivers, "financial_drivers" for the financial case, "risks" for the risk section, "assumptions" for key assumptions, and "uncertainties" for data gaps — all grounded in the supplied context, nothing invented.

Always note in "uncertainties" that title, legal status, survey, geotechnical conditions, final zoning interpretation, and market assumptions require human review — you are not a legal, regulatory, or certification authority.

Respond with ONLY a single minified JSON object, no markdown fences, no prose outside the JSON, matching exactly:
{"recommendation":"PURSUE|HOLD|REJECT","confidence":0-1 number,"summary":string,"reasons":string[],"risks":string[],"financial_drivers":string[],"assumptions":string[],"uncertainties":string[],"evidence_ids":string[],"external_sources":[{"title":string,"url":string,"domain":string,"retrieved_at":string}]}`;

interface CallResult {
  ok: boolean;
  value?: StructuredAnalystResponse;
  error?: string;
  rawContent?: string;
}

export class OpenRouterAIProvider implements AIProvider {
  readonly id = "openrouter";
  private readonly config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  async answer(request: AskAnalystRequest): Promise<StructuredAnalystResponse> {
    const userPrompt = `Mode: ${request.mode}\nQuestion: ${request.question}\nContext: ${JSON.stringify(request.context)}`;

    const baseBody = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      response_format: { type: "json_object" as const },
      ...(request.mode === "research" ? { plugins: [{ id: "web" }] } : {}),
    };

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: userPrompt },
    ];

    const first = await this.callAndValidate({ ...baseBody, messages });
    if (first.ok && first.value) return first.value;

    const retryMessages = [
      ...messages,
      { role: "assistant" as const, content: first.rawContent ?? "" },
      {
        role: "user" as const,
        content: `Your previous response was invalid (${first.error ?? "unknown error"}). Reply again with ONLY the valid JSON object described in the system prompt — no other text.`,
      },
    ];
    const second = await this.callAndValidate({ ...baseBody, messages: retryMessages });
    if (second.ok && second.value) return second.value;

    throw new Error(`OpenRouter response failed schema validation twice: ${second.error ?? first.error}`);
  }

  private async callAndValidate(body: Record<string, unknown>): Promise<CallResult> {
    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://vantrock.ai",
          "X-Title": "Vantrock Intelligence",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      return { ok: false, error: `Network error calling OpenRouter: ${cause instanceof Error ? cause.message : String(cause)}` };
    }

    if (!response.ok) {
      // Never include response body verbatim if it might echo the Authorization header back (it won't, but stay conservative and cap length).
      const text = await response.text().catch(() => "");
      return { ok: false, error: `OpenRouter HTTP ${response.status}: ${text.slice(0, 300)}` };
    }

    const json = await response.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      return { ok: false, error: "No content in OpenRouter response." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { ok: false, error: "Response content was not valid JSON.", rawContent: content };
    }

    const result = structuredAnalystResponseSchema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((i) => i.message).join("; "), rawContent: content };
    }

    return { ok: true, value: result.data };
  }
}
