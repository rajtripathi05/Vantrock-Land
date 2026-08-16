/**
 * Structured AI analyst output contract (blueprint Phase 19).
 *
 * Every response — from the real OpenRouter provider or the deterministic
 * demo fallback — is validated against this schema before it reaches the UI.
 * An LLM response that doesn't parse or doesn't match is never rendered.
 */

import { z } from "zod";

export const externalSourceSchema = z.object({
  title: z.string().min(1).max(300),
  url: z.string().url(),
  domain: z.string().min(1).max(200),
  retrieved_at: z.string().min(1).max(60),
});

export const structuredAnalystResponseSchema = z
  .object({
    recommendation: z.enum(["PURSUE", "HOLD", "REJECT"]),
    confidence: z.number().min(0).max(1),
    summary: z.string().min(1).max(2000),
    reasons: z.array(z.string().max(400)).max(10),
    risks: z.array(z.string().max(400)).max(10),
    financial_drivers: z.array(z.string().max(400)).max(10),
    assumptions: z.array(z.string().max(400)).max(10),
    uncertainties: z.array(z.string().max(400)).max(10),
    evidence_ids: z.array(z.string().max(200)).max(30),
    external_sources: z.array(externalSourceSchema).max(10),
  })
  .strict();

export type StructuredAnalystResponse = z.infer<typeof structuredAnalystResponseSchema>;
export type ExternalSource = z.infer<typeof externalSourceSchema>;
