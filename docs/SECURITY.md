# Security

## Secrets — what's server-only, what's public

| Variable | Where it's read | Browser-exposed? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/config/env.ts` | Yes — by design, constrained by RLS |
| `DEMO_ACCESS_PASSWORD` | `middleware.ts`, `app/api/auth/login/route.ts` | Never |
| `OPENROUTER_API_KEY` | `lib/ai/provider/openrouter.ts` (imported only from `app/api/analyst/route.ts`) | Never |
| `SUPABASE_SECRET_KEY` | Not read anywhere in this codebase | Reserved, unused |

None of the server-only variables are prefixed `NEXT_PUBLIC_` (which is what Next.js inlines
into the client bundle at build time) and none are imported by any file under `components/`
or by any `"use client"` module. `lib/ai/provider/openrouter.ts` and `lib/auth/session.ts`
are the only modules that see `OPENROUTER_API_KEY` / `DEMO_ACCESS_PASSWORD` respectively, and
neither ever logs, echoes, or returns them — verified by reading every `console.*` and
response-body call site in those modules.

## Demo access gate

- Single shared password (`DEMO_ACCESS_PASSWORD`), compared server-side only
  (`app/api/auth/login/route.ts`) with a constant-time-ish string comparison
  (`lib/auth/session.ts` → `timingSafeEqual`) — never a client-side check, never stored in
  `localStorage`.
- Session is a signed, stateless cookie (`vantrock_session`): `{expiry}.{HMAC-SHA256}`,
  keyed off a SHA-256 digest of the password (`lib/auth/session.ts`). No session table —
  rotating the password invalidates every outstanding session immediately.
- Cookie flags: `httpOnly` (unreadable from JS), `sameSite=lax`, `secure` in production,
  `path=/`, 12-hour `maxAge`.
- `middleware.ts` gates every route except static assets, `/login`, and the login/logout API
  routes themselves — including every `/api/*` route, so `/api/analyst` is covered
  automatically, not gated separately.
- If `DEMO_ACCESS_PASSWORD` is unset, the gate is a no-op — local dev still runs with zero
  configuration, matching this repo's standing rule.

**Rate limiting — documented limitation:** `lib/auth/rateLimit.ts` is an in-memory,
per-process counter (8 attempts / 5 minutes per client IP). On a single long-running Node
server this works as intended. On Netlify Functions, where each invocation can land on a
different container, the counter can reset between requests — this is a known gap for a
single-shared-password demo gate, not a silently-ignored one. A production multi-tenant
auth system would need a shared store (e.g., a Supabase table) instead of in-memory state.

## AI provider (OpenRouter)

- Server-only (`app/api/analyst/route.ts` is the only caller of
  `lib/ai/provider/openrouter.ts`). The browser only ever talks to `/api/analyst`.
- Request/response validated with zod on both sides of the boundary
  (`analystContextSchema` in, `structuredAnalystResponseSchema` out) — an unvalidated model
  response is never rendered.
- `evidence_ids` returned by the model are filtered against the ids actually present in the
  request's own context before being sent to the browser — an invented citation is dropped,
  not trusted.
- Errors from the provider (HTTP failure, timeout, invalid JSON) are caught and never
  forwarded verbatim to the client — the client only ever sees a generic
  `"analyst assistant could not produce a response"` message, never provider internals that
  could hint at key validity.
- See `docs/AI_ARCHITECTURE.md` for the full request flow and cost controls.

## Supabase

- Only the anon/public key is used, from the browser, constrained by the RLS policies in
  `supabase/migrations/0001_init.sql`. No privileged (`service_role`/secret) Supabase
  operation exists anywhere in this codebase.
- Current RLS policy is permissive (`using (true)`) — documented as appropriate for a
  single-tenant demo sitting behind the password gate above, with the tightening path
  (`owner_id = auth.uid()` once real Supabase Auth exists) noted in the migration file's
  comments and `docs/MANUAL_ACTIONS.md`. This session did not modify RLS or any other
  Postgres-level security setting — per the standing instruction, database security is
  handled at the application layer (auth + the documented RLS tightening path), not by
  hand-editing what Supabase Advisor flags.

## Git hygiene

- `.env.local` is gitignored — verified this session with `git check-ignore .env.local`
  (succeeds).
- `.env.example` contains variable names and safe defaults only, never a real value.
- Before committing, review `git status` output for anything unexpected (large local logs,
  files that shouldn't be tracked) rather than blindly `git add -A`.

## What the AI layer will never do

- Calculate a score, a financial figure, or any other number — those come exclusively from
  `lib/scoring`, `lib/financial`, `lib/analysis` (pure, deterministic, unit-tested).
  `lib/ai/provider/*` only *reasons over* numbers already computed elsewhere.
- Mutate a project, a site, or any stored record — every tool in `lib/ai/tools.ts` is a
  read; there is no AI-triggered write path anywhere in this codebase.
- Present itself as a legal, regulatory, survey, or certification authority — every
  structured response's `uncertainties` carries the human-review disclaimer (see
  `docs/AI_ARCHITECTURE.md`), and `UnderwriteAI.tsx` renders a fixed footer regardless of
  what the model returned.

## Before a real deployment

- [ ] Set `DEMO_ACCESS_PASSWORD` in the hosting platform's environment variable UI (never
      in a committed file).
- [ ] If enabling OpenRouter, set `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`,
      `OPENROUTER_MODEL` the same way.
- [ ] Confirm `git check-ignore .env.local` still succeeds before every push.
- [ ] Replace the OSM dev-tile basemap before production traffic — see
      `docs/MANUAL_ACTIONS.md` → "Self-hosted PMTiles basemap."
