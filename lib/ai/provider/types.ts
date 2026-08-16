import type { AnalystContext } from "@/lib/ai/context";
import type { StructuredAnalystResponse } from "./schema";

export type AnalystMode = "underwrite" | "research" | "challenge" | "memo";

export interface AskAnalystRequest {
  mode: AnalystMode;
  question: string;
  context: AnalystContext;
}

/**
 * Server-side only. Never import this (or any implementation of it) from a
 * "use client" component — implementations read secret API keys from
 * process.env and must only run inside app/api route handlers.
 */
export interface AIProvider {
  readonly id: string;
  answer(request: AskAnalystRequest): Promise<StructuredAnalystResponse>;
}
