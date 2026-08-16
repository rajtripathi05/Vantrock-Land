# Documentation Index

Start with the root [`README.md`](../README.md) for how to run the app. This folder holds
everything else. Read in this order if you're new to the codebase:

1. **[DECISIONS.md](DECISIONS.md)** — why the stack looks the way it does (MapLibre, Terra
   Draw, local-first, IndexedDB, deterministic engines, evidence-first AI). Read this
   before changing any architectural boundary.
2. **[ROADMAP.md](ROADMAP.md)** — what's complete, in progress, next, and later. The single
   source of truth for "is X done yet."
3. **[ANALYST_WORKFLOW.md](ANALYST_WORKFLOW.md)** — the end-to-end user journey: project →
   draw → analyze → compare → underwrite → decide → evidence → report.
4. **[SCORING_MODEL.md](SCORING_MODEL.md)** — every metric, its benchmark band, its default
   weight, and how missing data is handled.
5. **[FINANCIAL_MODEL.md](FINANCIAL_MODEL.md)** — every formula in the underwriting engine,
   reproducible by hand.
6. **[DATA_SOURCES.md](DATA_SOURCES.md)** — every data source in the app, its
   classification (LIVE/PRELOADED/CURATED/DERIVED/MOCK), license, and limitations.
7. **[API_CATALOGUE.md](API_CATALOGUE.md)** — every current and future external API/provider
   interface, including ones not yet implemented.
8. **[MANUAL_ACTIONS.md](MANUAL_ACTIONS.md)** — anything that needs a human to click a
   button, get an API key, or run a command by hand. **Check this before assuming
   something is "not done because it's broken" — it's often "not done because it needs
   you."**
9. **[ENGINEERING_LOG.md](ENGINEERING_LOG.md)** — session-by-session history, so a future
   session (human or Claude) doesn't have to rediscover the codebase from scratch.

## Quick answers

- **"Is Supabase connected?"** No. See MANUAL_ACTIONS.md → Priority 1.
- **"Is the data real?"** Roads and industrial/logistics POIs are real OpenStreetMap data
  (PRELOADED). Financial and scoring assumptions are Vantrock's own curated judgement
  (CURATED). Labour, climate, and routing are honestly reported as MISSING — see
  DATA_SOURCES.md.
- **"Why is there no LLM?"** By design for this MVP (no Anthropic API credits assumed
  available) — the Analyst tab is fully deterministic. See DECISIONS.md.
- **"What's left to build?"** ROADMAP.md, "NEXT" section.
