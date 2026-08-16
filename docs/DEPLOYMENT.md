# Deployment (Netlify)

This app is a standard Next.js 15 App Router project — no custom server, no Node APIs
outside `app/api/*` route handlers and `middleware.ts`, both of which run fine on Netlify's
Next.js Runtime (Edge Functions for middleware, regular Functions for route handlers).

## Netlify setup

1. Connect the repository in the Netlify dashboard (or `netlify init` from the CLI).
2. `netlify.toml` (already in the repo root) declares the build command (`npm run build`),
   publish directory (`.next`), and the `@netlify/plugin-nextjs` build plugin — Netlify
   installs the plugin automatically during the build; nothing to add to `package.json`.
3. **Site configuration → Environment variables** — set every variable below directly in
   the Netlify UI. Never commit them; `.env.local` is gitignored and `.env.example` holds
   names/placeholders only.

| Variable | Required? | Notes |
|---|---|---|
| `NEXT_PUBLIC_PERSISTENCE_DRIVER` | Yes, for a live deployment | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes, if driver is `supabase` | From Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes, if driver is `supabase` | Same page. Safe to expose — constrained by RLS. |
| `NEXT_PUBLIC_BASEMAP` | Recommended | `osm-dev` is dev-only per OSMF policy — see `docs/MANUAL_ACTIONS.md` for the production PMTiles path. |
| `DEMO_ACCESS_PASSWORD` | Recommended for any public URL | Server-only. Unset = no login gate. |
| `AI_PROVIDER` | Optional | `openrouter` to enable real AI; unset/`demo` runs with zero AI cost. |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | Required if `AI_PROVIDER=openrouter` | Server-only, never `NEXT_PUBLIC_*`. |
| `OPENROUTER_MAX_TOKENS` / `OPENROUTER_TEMPERATURE` | Optional | Defaults: 900 / 0.2. |

4. Deploy. Netlify builds with `npm run build`, which runs the same
   typecheck/lint-during-build Next.js already does (`next.config.ts` has
   `ignoreBuildErrors: false` / `ignoreDuringBuilds: false` — a broken build fails the
   deploy rather than shipping silently).

## Middleware on Netlify

`middleware.ts` (the demo access gate) compiles to a Netlify Edge Function automatically —
no separate configuration needed. It reads `DEMO_ACCESS_PASSWORD` via `process.env` and
Web Crypto (`crypto.subtle`), both available in the Edge runtime; see `lib/auth/session.ts`
for why it deliberately avoids `node:crypto`.

## Route handlers on Netlify

`app/api/analyst/route.ts` and `app/api/auth/*` compile to Netlify Functions. Cold starts
are a few hundred ms; the OpenRouter call itself (when configured) is the dominant latency,
not the function boundary.

## Known limitation carried into this environment

`lib/auth/rateLimit.ts`'s brute-force counter is in-process memory. Netlify Functions are
not guaranteed to reuse the same container between invocations, so the counter can reset
under low/sporadic traffic. Documented in `docs/SECURITY.md` — acceptable for a
single-shared-password demo gate, not for a real multi-tenant login system.

## Pre-deploy checklist

See `docs/SECURITY.md` → "Before a real deployment" and `docs/MANUAL_ACTIONS.md` for the
full list (Supabase project connection, OSM basemap swap, etc.). Run
`npm run typecheck && npm run lint && npm run test && npm run build` locally before every
deploy — this is the same command Netlify's build effectively re-runs, but failing fast
locally is cheaper.
