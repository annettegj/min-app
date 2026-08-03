# Lysoveta Customer Finder

A B2B lead-generation tool for **Aker BioMarine**, built by **Sprint**. It finds potential European
customers for **Lysoveta** (an LPC-enriched krill-oil ingredient for brain health) by searching
trade media, enriching companies with web research, scoring them against an Ideal Customer Profile,
and letting a user review, save, and export the matches.

**Live app:** https://akbm-customer-finder.vercel.app

## Documentation

- **[USER_GUIDE.md](USER_GUIDE.md)** — how to use the app (for stakeholders / end users).
- **[HANDOVER.md](HANDOVER.md)** — architecture, environment, pipeline, database, deployment,
  costs, security, and open to-dos (for whoever operates or takes ownership of the app).
- **[SEARCH_PIPELINE.md](SEARCH_PIPELINE.md)** — a detailed, step-by-step walkthrough of the
  three-step search (discovery → enrichment → ICP matching).
- **[DESIGN.md](DESIGN.md)** — the visual/design system: colour palette, button hierarchy, hover,
  and rounded corners, with a "how do I change X" reference.

## Tech stack

Next.js 16 (App Router, TypeScript) · Supabase (Postgres) · Anthropic Claude API · deployed as a
split UI (Vercel) + always-on worker (Render). See [HANDOVER.md](HANDOVER.md) for why.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. You'll need a `.env.local` with the Supabase variables and
`ANTHROPIC_API_KEY` — see the environment-variables section of [HANDOVER.md](HANDOVER.md).

> Restart the dev server after editing `lib/search.ts` or any API route — hot reload is unreliable
> for server modules. `app/page.tsx` hot-reloads fine.

## Deploy

Push to `main` — Vercel (UI) and Render (worker) both auto-deploy from `main`.

## Project layout

- `app/page.tsx` — the entire UI (client component)
- `app/layout.tsx` — page metadata
- `lib/search.ts` — the three-step search pipeline
- `app/api/search/start/route.ts` — starts the background search job
- `config/sources.json` — sources, search terms, and model config
- `config/icp.md` — the ICP definition

A more complete file-by-file map is in [HANDOVER.md](HANDOVER.md).
