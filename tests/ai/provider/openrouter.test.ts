/**
 * OpenRouterAIProvider tests. NO NETWORK — global fetch is stubbed for every
 * case, matching tests/providers/routing/osrm.test.ts's pattern. Verifies:
 * a valid JSON response validates and passes through; an invalid JSON
 * response triggers exactly one retry; two invalid responses in a row throw
 * (never silently return unvalidated data); the API key never appears in a
 * thrown error message.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterAIProvider } from "@/lib/ai/provider/openrouter";
import type { AnalystContext } from "@/lib/ai/context";

const CONTEXT: AnalystContext = {
  project_name: "Test Mandate",
  asset_class: "grade_a_logistics",
  target_gfa_sqft: 500000,
  weight_profile_name: "Vantrock Default",
  selected_site_id: "site-a",
  sites: [
    {
      site_id: "site-a",
      site_name: "Candidate Site A",
      score_total: 0.72,
      coverage: 0.9,
      confidence: 0.7,
      category_breakdown: [],
      top_contributors: [],
      warnings: [],
      financial_base: null,
      evidence: [{ evidence_id: "osm-roads-v1", name: "OpenStreetMap roads", classification: "PRELOADED" }],
    },
  ],
};

const VALID_RESPONSE = {
  recommendation: "PURSUE" as const,
  confidence: 0.7,
  summary: "Site A looks strong.",
  reasons: ["Good highway access"],
  risks: [],
  financial_drivers: [],
  assumptions: [],
  uncertainties: [],
  evidence_ids: ["osm-roads-v1"],
  external_sources: [],
};

function chatResponse(content: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  } as Response;
}

const provider = new OpenRouterAIProvider({
  apiKey: "sk-test-secret-key",
  model: "test/model",
  maxTokens: 500,
  temperature: 0.2,
});

describe("OpenRouterAIProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a validated response on the first successful call", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => chatResponse(JSON.stringify(VALID_RESPONSE))));

    const result = await provider.answer({ mode: "underwrite", question: "Why?", context: CONTEXT });
    expect(result.recommendation).toBe("PURSUE");
    expect(result.evidence_ids).toEqual(["osm-roads-v1"]);
  });

  it("retries once when the first response is invalid JSON, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("not json"))
      .mockResolvedValueOnce(chatResponse(JSON.stringify(VALID_RESPONSE)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider.answer({ mode: "underwrite", question: "Why?", context: CONTEXT });
    expect(result.recommendation).toBe("PURSUE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after two invalid responses, never returning unvalidated data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => chatResponse("still not json")));

    await expect(
      provider.answer({ mode: "underwrite", question: "Why?", context: CONTEXT }),
    ).rejects.toThrow(/failed schema validation/);
  });

  it("never includes the API key in a thrown error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => chatResponse("{}", false)),
    );

    try {
      await provider.answer({ mode: "underwrite", question: "Why?", context: CONTEXT });
      expect.fail("expected answer() to throw");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      expect(message).not.toContain("sk-test-secret-key");
    }
  });

  it("adds the web plugin only in research mode", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      chatResponse(JSON.stringify(VALID_RESPONSE)),
    );
    vi.stubGlobal("fetch", fetchMock);

    await provider.answer({ mode: "research", question: "New infra?", context: CONTEXT });
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse((init?.body as string) ?? "{}");
    expect(body.plugins).toEqual([{ id: "web" }]);
  });
});
