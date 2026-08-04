# Lysoveta Customer Finder — Technical & Handover Documentation

> Audience: whoever operates, maintains, or takes ownership of this app (AKBM IT, future
> developers, Sprint). For end-user instructions see [USER_GUIDE.md](USER_GUIDE.md); for the
> visual/design system (colours, buttons, hover, rounding) see [DESIGN.md](DESIGN.md).
> Last updated: 2026-08 (post-summer, pre-AKBM-handover).

## 1. What it is

A B2B lead-generation tool for **Aker BioMarine (AKBM)**, built by **Sprint**. It finds potential
European customers for **Lysoveta** (an LPC-enriched krill-oil ingredient for brain health, sold
B2B). Given a set of trade-media sources and search terms, it discovers supplement companies,
enriches them with web research, scores them against an Ideal Customer Profile (ICP), and lets a
user review, select, and export the matches.

## 2. Tech stack

- **Next.js 16** (App Router, TypeScript), single client-rendered page with inline-styled React.
- **Supabase** (Postgres) — shared database and the glue between the UI and the worker.
- **Anthropic Claude API** — all search/enrichment/matching steps use `claude-sonnet-5`.
- **exceljs** — client-side `.xlsx` export.
- **Vercel** (UI hosting) + **Render** (always-on worker). See deployment below.

**Language rule:** all user-facing UI text is English (even though the team communicates in
Norwegian). Keep new UI strings in English.

## 3. Deployment — split architecture

The app is deliberately split across two hosts because the search is long-running and cannot run
on serverless functions.

| Piece | Host | Responsibility |
|---|---|---|
| **UI** | Vercel | The Next.js frontend. The search button calls the Render worker cross-origin. |
| **Worker** | Render (always-on) | Runs the actual multi-step search in the background. |
| **Database** | Supabase | Shared Postgres; both UI and worker read/write it. |

- **Production URL:** `https://akbm-customer-finder.vercel.app` (renamed from the old
  `min-app-sigma.vercel.app`).
- **Push to `main` auto-deploys both** Vercel and Render.
- Render free tier **sleeps after ~15 min idle** → the first search after idle has a ~30s cold
  start. This is normal, not a bug.

### Environment variables

**Vercel (UI):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_WORKER_URL` — the Render worker URL (the UI POSTs the search here)
- `NEXT_PUBLIC_DISABLE_SEARCH` — set to `"true"` to disable the live search button (e.g. to let
  stakeholders browse without incurring API cost); leave unset locally

**Render (worker):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY` — **only lives here**, never exposed to the browser
- `YOUTUBE_API_KEY` — optional; enables `youtube` sources (YouTube Data API v3). Server-only, like
  the Anthropic key. If unset, YouTube sources are simply skipped. Restrict the key to *YouTube Data
  API v3* in Google Cloud; the API is free/quota-capped so a leak burns quota, not money.
- `ALLOWED_ORIGIN` — optional; pins CORS to the Vercel origin. Defaults to `"*"` if unset. **If you
  rename the Vercel URL and this is pinned to the old one, update it.**

### Accounts & access (fill in during handover)

- GitHub repo: `github.com/annettegj/min-app` (currently a **personal** account)
- Vercel project: `akbm-customer-finder` — owner: `[fill in]`
- Render service: `[fill in service name / owner]`
- Supabase project: `[fill in project URL / owner]`
- Anthropic API key: currently **Sprint's** key — `[who owns the billing account]`

> ⚠️ Handover to-do: move repo, hosting, and API-key ownership from personal/Sprint accounts to
> AKBM-owned accounts. Discuss with Tord (VP IT): ownership, security, data residency, auth.

## 4. The three tabs

1. **Company Database** — view/filter saved companies (those with `added = true` and
   `rejected = false`). **Export as Excel** (client-side `.xlsx` of the currently shown list) and
   **Clear Results** (empties the view). **Edit list** mode unlocks per-row **edit** (✎ → inline
   form → Supabase `update`) and **remove** (✕ → "remove from this view only" = session hide, or
   "delete from the company database" = soft delete via `rejected`). Unsaved edits are guarded
   before filtering/clearing/exporting.
2. **Find New Companies** — runs the search (see pipeline below). Includes a **Search terms**
   selector (choose up to 3 from the keyword bank) and a **Step 3 decision** switch (currently
   **locked on Automatic**).
3. **Lysoveta ICP Criteria** — renders `config/icp.md` read-only. The "Edit" button is a disabled
   placeholder.
   Plus a disabled **Company Prospectus (Soon)** tab.

## 5. Search pipeline (background job + polling)

> For a detailed, step-by-step walkthrough (data shapes, caching, dedup, the auto/manual fallback,
> config knobs), see **[SEARCH_PIPELINE.md](SEARCH_PIPELINE.md)**. The summary below is enough to
> orient yourself.

Kicked off by `POST {NEXT_PUBLIC_WORKER_URL}/api/search/start`, which creates a `search_jobs` row,
fires `searchForCompanies(jobId, step3Mode, searchConcepts)` fire-and-forget, and returns the
`jobId` immediately. The browser then polls `search_jobs` + `search_logs` every 3s and shows
"Step X of 3", an elapsed timer, and a live log panel. Only works on an always-on server (Render /
`next dev`), never serverless.

- **Step 1 — Discovery** (`discoverCompanies`): `claude-sonnet-5`, `web_search` max 12 uses,
  `max_tokens` 32000. Queries = **selected search terms × each source's `search_prefix`** (default
  3 terms × 4 sources = 12 = the search budget). Passes known company names so it only returns NEW
  ones; dedups; adds fresh ones to `discovery_queue`. Only runs if the queue has < 5 pending.
- **Step 2 — Enrichment** (`enrichAll` / `enrichCompany`): `claude-sonnet-5`, `web_search` max 3
  uses, `max_tokens` 8000. Enriches up to 5 pending companies per run in parallel. Saves each to
  `companies` incrementally (`added = false`). Cache-checks `enriched_data` to avoid re-enriching.
- **Step 3 — ICP matching** (`evaluateCompanies`): `claude-sonnet-5`, **no web_search**,
  `max_tokens` 16000. Runs the ICP scoring that used to be manual. Only companies that pass are
  returned (stored in `search_jobs.results`); enriched companies that don't pass are marked
  `rejected`. **Fallback:** if automatic evaluation fails, the job stores the manual prompt instead
  and the UI shows a paste box — a finished (expensive) job is never lost.
- **Overall timeout:** 30 minutes (shared `AbortController`), covering steps 1+2+3.

### Step 3 mode

`step3Mode` is sent from the UI (`"auto"` | `"manual"`). The UI switch is **locked on `"auto"`**
for now; to re-enable manual mode, restore the `setStep3Mode` setter in `app/page.tsx` and wire the
switch buttons back up (there's a comment in the code explaining exactly how).

## 6. Database (Supabase)

- **`companies`** — source of truth. Columns: `name`, `geography`, `product_category`, `max_price`,
  `price_currency`, `icp_fit`, `website_url`, `source_name`, `description`, `priority_tier`,
  `enriched_data` (jsonb), `enriched_at`, `rejected` (bool), `added` (bool).
  `added=true & rejected=false` → shown; `added=false` → enriched-not-reviewed (cache);
  `rejected=true` → excluded.
- **`discovery_queue`** — `name`, `source_name`, `status` (pending/processing),
  `processing_started_at`, `discovered_at`. Rows stuck "processing" > 10 min are reset to pending
  at search start.
- **`search_jobs`** — `status` (running/done/no_companies/error), `message`, `step3_prompt`,
  `enriched` (jsonb), **`results` (jsonb — passing companies from automatic Step 3)**,
  `timed_out` (bool), `error`, timestamps. Drives polling.
- **`search_logs`** — `job_id`, `message`, `created_at` (one row per log line). Drives the log panel.

> **Migration note:** the `results` column on `search_jobs` was added for automatic Step 3:
> `alter table search_jobs add column results jsonb;`

## 7. Key files

- `app/page.tsx` — the entire UI (client component). Search-terms selector, Step 3 switch, Excel
  export, polling, results review, and the Company Database edit/remove/clear flows. Also holds the
  shared button style objects (`btnPrimary`, `btnSecondary`) and `inputStyle`.
- `app/layout.tsx` — page metadata (browser-tab title, description, `lang`).
- `app/globals.css` — global styles: the colour-palette CSS variables, the site-wide button hover
  rule, and the default button border-radius. See [DESIGN.md](DESIGN.md).
- `lib/search.ts` — the pipeline: `discoverCompanies`, `enrichCompany`, `enrichAll`,
  `evaluateCompanies`, `buildStep3Prompt`, `searchForCompanies`. `emit()` logs to terminal +
  `search_logs`.
- `lib/supabase.ts` — the Supabase client.
- `app/api/search/start/route.ts` — starts the background job (+ CORS). Reads `step3Mode`,
  `searchConcepts`, and `sourceNames` (the user's selected terms/sources) from the request body.
- `app/api/reject/route.ts` — marks companies rejected (preserves `enriched_data`).
- `app/api/icp/route.ts` — serves `config/icp.md`.
- `app/api/test-claude/route.ts` — diagnostic (checks key/credits + a web_search test).
- `app/api/search/route.ts` — OLD synchronous route, unused by the client (safe to delete).
- **`sources` / `search_terms` DB tables** — the authoritative, UI-editable search configuration
  (see [SEARCH_PIPELINE.md](SEARCH_PIPELINE.md#where-the-configuration-lives-database-not-the-file-anymore)).
- `config/sources.json` — now a **fallback** for the two tables (used if the DB read fails), plus
  `enrichment_model` (still read from here). `keyword_bank` was the old term pool, superseded by the
  `search_terms` table.
- `config/icp.md` — the **European** ICP definition (price threshold is currency-agnostic: ~60 in own currency).
- `config/icp_us.md` — the **US** ICP. Placeholder until real criteria are pasted in; Step 3 routes US companies to it by geography once it's real (see SEARCH_PIPELINE.md → Step 3).
- `config/mock-results.json` — demo data (only used if `DEMO_MODE = true` in `page.tsx`).
- `db/migrations/*.sql` — DB schema + seed (001 = sources/search_terms tables; 002 = trade-show sources).
- [SOURCES.md](SOURCES.md) — running log of every source evaluated for discovery: works / held / rejected, and why.

## 8. Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. You need a `.env.local` with the Supabase vars + `ANTHROPIC_API_KEY`
(locally the UI and worker run on the same origin, so `NEXT_PUBLIC_WORKER_URL` can be empty).

> **Restart the dev server after editing `lib/search.ts` or any API route** — hot reload is
> unreliable for server modules and can silently run stale code. `page.tsx` hot-reloads fine.

## 9. Cost & operational notes

- **Each real search costs ~$3–5** on Sprint's Anthropic key (steps 1+2 use `web_search`, which
  accumulates large contexts). Step 3 is cheap (no web_search). Keep this in mind before sharing
  the live search widely.
- Some companies stall `web_search` indefinitely — the 30-min timeout + incremental per-company
  saving handle this so one bad company can't sink the run.
- `max_tokens` truncation was a historic bug: server-tool `web_search` sums output across rounds, so
  too-low `max_tokens` truncated the final JSON and parsing failed silently. Current limits
  (32000 / 8000 / 16000) are tuned around this — don't lower them casually.
- **Discovery volume ceiling:** 4 sources × 3 terms saturates the 12-search budget (full reasoning:
  [SEARCH_PIPELINE.md](SEARCH_PIPELINE.md#why-the-caps-up-to-3-terms--4-sources)). To keep finding
  NEW companies: add sources / rotate terms **from the UI** (they persist to the DB, no redeploy),
  or (bigger effort) read source hub pages directly via `web_fetch`.

## 10. Security & known gaps

- **No authentication** — anyone with the URL can use the app and trigger (paid) searches. Only
  share the production URL with trusted stakeholders; do not post it publicly. Auth is an open
  handover item.
- The **Supabase anon key is public** (it's a `NEXT_PUBLIC_` var, by design). All tables
  (`companies`, `sources`, `search_terms`, …) are currently open to the anon key — RLS is either off
  or fully permissive, so anyone with the URL can read/write the shared config and data. This is the
  prototype's deliberate posture; **tightening it requires real auth**, which is the proper fix at
  handover (RLS without auth adds nothing here).
- The Anthropic key lives **only on Render**, not in the browser bundle. Keep it that way.

## 11. Roadmap / open to-dos

1. **US expansion** — add US companies/sources (vs. today's European focus).
2. **Company Prospectus** — the disabled "Soon" tab.
3. **Editable ICP tab** — the "Edit" button is a placeholder.
   - ✅ *Done:* source & term selection wired to the search; editable sources/terms (DB-backed,
     from the UI — draft edit mode with a single **Save changes** that diffs & applies); editable
     company database (edit fields + soft/hard delete); `web_fetch` for "web page" sources
     (`discoverViaFetch` — reads a fixed page and extracts companies).
6. **ICP validation** — compare the tool's ICP scores against AKBM's Excel of ~100 companies.
7. **Softer rejection** — un-reject / review rejected companies.
8. **AKBM handover** — ownership of repo/hosting/API keys, security, data residency, auth.
