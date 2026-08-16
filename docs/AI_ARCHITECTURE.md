# AI Architecture

How the AI layer is structured, what it is and isn't allowed to do, and how the two
"real model" modes (Underwrite, Research) relate to the fully-deterministic assistant that
already existed (`lib/ai/explain.ts`, `components/analysis/AnalystTab.tsx` — unchanged by
this phase).

## Two AI surfaces, on purpose

| Surface | Calls a model? | API key required? | Where |
|---|---|---|---|
| Deterministic canned questions | No | No | `lib/ai/explain.ts` → `AnalystTab.tsx` |
| Underwrite / Research (this phase) | Yes (or a deterministic fallback) | No — falls back to `demo` | `lib/ai/provider/` → `UnderwriteAI.tsx` |

Both read from the same tool layer (`lib/ai/tools.ts` → `AnalysisTools`) and the same
computed `SiteAnalysis`/`FinancialScenarioResult` objects. Neither can mutate anything —
there is no write path from the AI layer into a repository.

## Request flow

```
Browser (UnderwriteAI.tsx)
  -> buildAnalystContext()          compact, capped, client-side (lib/ai/context.ts)
  -> POST /api/analyst              askAnalyst() (lib/ai/client.ts)
     -> middleware.ts               demo access gate (if configured)
     -> zod validation              analystContextSchema (request shape/size)
     -> getAIProvider()             OpenRouterAIProvider or DemoAIProvider
     -> provider.answer()           one model call, or template-only
     -> zod validation (again)      structuredAnalystResponseSchema
     -> evidence_id filtering       drop any id not present in the supplied context
  <- { ok, provider, result }
```

The browser never talks to OpenRouter directly. `OPENROUTER_API_KEY` is read only inside
`lib/ai/provider/openrouter.ts`, which is imported only from `app/api/analyst/route.ts`.

## Why context is built client-side, not server-side

This MVP's data layer (`AnalysisTools`, the OSM dataset, the repository bundle) already
runs in the browser — that's the existing architecture (see `docs/DECISIONS.md`), not
something this phase changes. Recomputing the full site analysis a second time inside the
route handler would mean duplicating the OSM dataset load and the routing-provider fetch
server-side, doubling the live-API surface for no benefit. Instead, the browser builds a
small, already-computed summary (`lib/ai/context.ts` → `buildAnalystContext()`) and posts
*that* — never the raw OSM dataset, full site geometry, or the whole project database. The
route handler's job is strictly to keep the OpenRouter key off the client and to validate/
cap what it's asked to reason over.

## Compact context shape (cost control, blueprint Phase 22)

Capped at build time, enforced again by `analystContextSchema` on the server:

- Up to 3 sites (matches this MVP's 3-candidate benchmark scenario)
- Up to 6 top-scoring contributors per site (not all 18 metrics)
- Up to 8 warnings per site
- Up to 20 evidence citations per site (id/name/classification only — not the full
  `SourceMetadata` record)
- One base-case financial scenario per site (not all three)

No raw OSM data, no full GeoJSON, no metric list dump. A typical request serializes to a
few KB, not hundreds.

## Structured output contract

Every response — real model or demo fallback — is validated against
`lib/ai/provider/schema.ts` → `structuredAnalystResponseSchema` before it can reach the UI:

```
recommendation: "PURSUE" | "HOLD" | "REJECT"
confidence: number (0-1)
summary: string
reasons, risks, financial_drivers, assumptions, uncertainties: string[]
evidence_ids: string[]        — must exist in the supplied context; filtered server-side
external_sources: { title, url, domain, retrieved_at }[]   — research mode only
```

An OpenRouter response that fails validation (not JSON, wrong shape) gets **one** retry
with the validation error appended to the conversation — never a second automatic retry,
per the cost-control rule. If both attempts fail, `POST /api/analyst` falls back to the
deterministic `DemoAIProvider` rather than surfacing a raw model error to the UI.

## Provider fallback — never blocks the deterministic app

`lib/ai/provider/index.ts` → `getAIProvider()`:

- `AI_PROVIDER` unset, or `"demo"` → `DemoAIProvider` (no network call, no key).
- `AI_PROVIDER=openrouter` but `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` missing →
  `DemoAIProvider` (silently — this is the documented "missing config" fallback, not an
  error state).
- `AI_PROVIDER=openrouter` with both set → `OpenRouterAIProvider`. If the live call throws
  (bad key, rate limit, network failure, timeout) `app/api/analyst/route.ts` catches it and
  falls back to `DemoAIProvider` for that one request, labeling the response
  `"demo (fallback — primary provider unavailable)"` so the UI is honest about which
  provider actually answered.

`DemoAIProvider` (`lib/ai/provider/demo.ts`) builds the exact same structured shape by
templating over the compact context — same spirit as `lib/ai/explain.ts`, just aimed at the
new schema instead of a plain string.

## Modes

**Underwrite** — explains the supplied context only. System prompt explicitly instructs the
model not to claim web access in this mode.

**Research** — adds OpenRouter's `plugins: [{ id: "web" }]` to the request (only in this
mode), and the system prompt requires every external claim to appear in
`external_sources` with a real URL, never blended into `evidence_ids`. The UI labels this
section "External research" and links out to the real source. The demo provider cannot
perform live research; when selected in `research` mode it says so explicitly rather than
inventing a citation.

## Evidence integrity (blueprint Phase 21)

`app/api/analyst/route.ts` computes the set of real `evidence_id`s from the request's own
`context.sites[].evidence[]` and filters the model's `evidence_ids` against it before
returning — an invented id is silently dropped, never rendered as if it were real.

## Human review boundary

Every response's `uncertainties` includes (demo provider: always; OpenRouter: instructed by
the system prompt) a note that title, legal status, survey, geotechnical conditions, final
zoning interpretation, market assumptions, and the investment decision itself require human
review. `UnderwriteAI.tsx` renders this as a fixed footer regardless of what the model
returned, so it can never be silently omitted.

## Cost controls in effect

- One model call per question (one retry only on schema-validation failure).
- Compact, stable system prompt (helps prompt caching on providers/models that support it).
- Compact per-request context (see above) — never the full database.
- `OPENROUTER_MAX_TOKENS` caps output (default 900).
- No multi-agent loops, no autonomous research chains — a question is one request, one
  response.
