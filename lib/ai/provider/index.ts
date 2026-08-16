/**
 * AI provider factory — the one place a provider is chosen.
 *
 * SERVER-ONLY: reads OPENROUTER_API_KEY. Import only from app/api routes.
 *
 * AI_PROVIDER=openrouter with a configured OPENROUTER_API_KEY + OPENROUTER_MODEL
 * uses the real provider; anything else (unset, "demo", or openrouter
 * selected but missing key/model) falls back to the deterministic demo
 * provider — the app must never require a paid key to run.
 */

import { DemoAIProvider } from "./demo";
import { OpenRouterAIProvider } from "./openrouter";
import type { AIProvider } from "./types";

const DEFAULT_MAX_TOKENS = 900;
const DEFAULT_TEMPERATURE = 0.2;

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getAIProvider(): AIProvider {
  const providerSetting = (process.env.AI_PROVIDER ?? "demo").toLowerCase();
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (providerSetting === "openrouter" && apiKey && model) {
    return new OpenRouterAIProvider({
      apiKey,
      model,
      maxTokens: parseNumberEnv(process.env.OPENROUTER_MAX_TOKENS, DEFAULT_MAX_TOKENS),
      temperature: parseNumberEnv(process.env.OPENROUTER_TEMPERATURE, DEFAULT_TEMPERATURE),
    });
  }

  return new DemoAIProvider();
}

export { DemoAIProvider } from "./demo";
export { OpenRouterAIProvider } from "./openrouter";
export type { AIProvider, AskAnalystRequest, AnalystMode } from "./types";
export { structuredAnalystResponseSchema, type StructuredAnalystResponse } from "./schema";
