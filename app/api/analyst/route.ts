/**
 * POST /api/analyst — the only place a browser ever reaches an AI provider.
 *
 * Browser -> here -> authenticate (middleware.ts, already applied to /api/*)
 * -> validate input (zod) -> call AIProvider -> validate structured output
 * (again, defence in depth) -> filter invented evidence_ids -> return.
 *
 * Never proxies the raw provider error to the client (could hint at key
 * validity/config) and never blocks on a broken OpenRouter key — falls back
 * to the deterministic demo provider so the assistant always responds.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { analystContextSchema } from "@/lib/ai/context";
import { DemoAIProvider, getAIProvider, structuredAnalystResponseSchema } from "@/lib/ai/provider";

const requestSchema = z
  .object({
    mode: z.enum(["underwrite", "research"]),
    question: z.string().trim().min(1).max(500),
    context: analystContextSchema,
  })
  .strict();

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid analyst request.",
          details: { issues: parsed.error.issues.slice(0, 5) },
        },
      },
      { status: 400 },
    );
  }

  const provider = getAIProvider();
  let providerId = provider.id;
  let result;

  try {
    result = await provider.answer(parsed.data);
  } catch {
    if (provider.id === "demo") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: "The analyst assistant could not produce a response. Try again, or use the deterministic questions above.",
          },
        },
        { status: 502 },
      );
    }
    // Primary provider failed (bad key, rate limit, network) — never leave
    // the analyst dark. Fall back to the deterministic provider.
    const fallback = new DemoAIProvider();
    result = await fallback.answer(parsed.data);
    providerId = "demo (fallback — primary provider unavailable)";
  }

  // Defence in depth: the provider already validates internally, but this
  // route is the actual trust boundary the browser talks to.
  const revalidated = structuredAnalystResponseSchema.safeParse(result);
  if (!revalidated.success) {
    return NextResponse.json(
      { ok: false, error: { code: "AI_PROVIDER_ERROR", message: "The analyst assistant returned an invalid response." } },
      { status: 502 },
    );
  }

  // Never accept an invented evidence_id — filter to ids that actually exist
  // in the context this request supplied (blueprint Phase 21).
  const validEvidenceIds = new Set(
    parsed.data.context.sites.flatMap((site) => site.evidence.map((e) => e.evidence_id)),
  );
  const safeResult = {
    ...revalidated.data,
    evidence_ids: revalidated.data.evidence_ids.filter((id) => validEvidenceIds.has(id)),
  };

  return NextResponse.json({ ok: true, provider: providerId, result: safeResult });
}
