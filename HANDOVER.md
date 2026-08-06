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
- `CLAUDE_MODEL` — optional; overrides the Claude model used by every API call. Unset → the default in
  `lib/models.ts` (`claude-sonnet-5`). See [§ Which model, and why](#which-model-and-why).

### Accounts & access (fill in during handover)

- GitHub repo: `github.com/annettegj/min-app` (currently a **personal** account)
- Vercel project: `akbm-customer-finder` — owner: `[fill in]`
- Render service: `[fill in service name / owner]`
- Supabase project: `[fill in project URL / owner]`
- Anthropic API key: currently **Sprint's** key — `[who owns the billing account]`

> ⚠️ Handover to-do: move repo, hosting, and API-key ownership from personal/Sprint accounts to
> AKBM-owned accounts. Discuss with Tord (VP IT): ownership, security, data residency, auth.

## 4. The four tabs

Before the tabs render, a **pilot login gate** (`AuthScreen`) requires log-in or account creation;
a **Log out** button + the signed-in email sit top-right. See §10.

1. **Company Database** — view/filter saved companies (those with `added = true` and
   `rejected = false`). **Export as Excel** (client-side `.xlsx` of the currently shown list) and
   **Clear Results** (empties the view). **Edit list** mode unlocks per-row **edit** (✎ → inline
   form → Supabase `update`) and **remove** (✕ → "remove from this view only" = session hide, or
   "delete from the company database" = soft delete via `rejected`). Unsaved edits are guarded
   before filtering/clearing/exporting. **+ Add Company** opens a form to enter a company manually
   (user sets ICP fit themselves for now) — upserted with `added=true`, `source_name` defaulting to
   "Manually added". Rows have checkboxes → **View only selected** / **Clear selection** (the Excel
   export follows what's shown). **Geography** and **Product category** are **multi-value** everywhere
   (filter, add, edit): a reusable `MultiSelect` checkbox dropdown, stored comma-separated in the one
   text column (a legacy single value is just a one-item list). The filter matches on overlap (empty =
   all); the table shows the values as comma-separated text. The filter panel also has a **Source**
   multi-select (the distinct `source_name`s present) and a multi-select **Priority Tier**; **Min ICP
   Fit Score** sits bottom-right.
2. **Find New Companies** — runs the search (see pipeline below). Includes the **Search
   Configuration** panel (draft-based edit mode for terms & sources — up to 3 terms / 4 sources, each
   source showing its **EU/US/Global** market badge and its **"used · queued · saved"** performance
   line), a **Target market** selector (Europe / US / No preference — a *soft* discovery steer, not a
   hard filter) and a queue pop-up when ≥ 5 companies are waiting. Sources can be flagged
   **"Recommended high quality source"** (`sources.featured`); each type column then shows only its
   recommended set in a boxed group, with a per-column **"Show all …"** toggle for the rest (a column
   with none flagged shows all — the fallback). Selected terms/sources reset once a search completes.
   **Single-page** sources are one-shot (read once via `web_fetch`); once used (`times_used > 0`) they
   drop out of the selectable list into a collapsed **"Completed single pages"** section (bottom-right),
   each with an **"Add back to source list"** action that re-adds it to the selection for the session
   (client-side, no stat reset — a re-run only surfaces genuinely new companies). Sources and search
   terms show a **"last used"** date (`last_used_at`). Step 3 (ICP scoring) always runs automatically
   after Steps 1–2. Results are reviewed in a selectable list (✕ rejects a company), then a
   **"Fill in Details"** step to complete/adjust fields before saving; each company there also has a
   **"Remove ✕"** that rejects it if it turns out not to be relevant on closer look.
3. **Lysoveta ICP Criteria** — the ICP the AI scores against. **Editable** (✎ Edit Criteria → free-form
   Markdown textarea → Save) — stored in the `icp_docs` table, with a version snapshot on every save
   (Version history → "Load into editor" to revert). Falls back to `config/icp.md` / `config/icp_us.md`
   until first edited. Two sub-tabs (**European** / **US**), but the **US sub-tab is a disabled
   placeholder** while `US_MARKET_ENABLED` is false (see `lib/features.ts`) — same for the target-market
   selector on tab 2 (locked to Europe). Also holds a **Product categories** card (the single
   app-wide place to add / rename / remove the `product_category` vocabulary — see `product_categories`
   table); the Database/search dropdowns and the Step 3 prompt all read from it.
4. **How It Works** — an in-app help guide (left-hand section menu) covering the pipeline, waiting
   list, scoring, source stats, signing in, and exception states in plain language.

Plus a disabled **Company Prospectus (Soon)** tab.

## 5. Search pipeline (background job + polling)

> For a detailed, step-by-step walkthrough (data shapes, caching, dedup, config knobs), see
> **[SEARCH_PIPELINE.md](SEARCH_PIPELINE.md)**. The summary below is enough to orient yourself.

Kicked off by `POST {NEXT_PUBLIC_WORKER_URL}/api/search/start`, which creates a `search_jobs` row,
fires `searchForCompanies(jobId, searchConcepts, sourceNames, targetMarket)`
fire-and-forget, and returns the `jobId` immediately. The browser then polls `search_jobs` +
`search_logs` every 3s and shows "Step X of 3", an elapsed timer, and a live log panel. Only works
on an always-on server (Render / `next dev`), never serverless.

- **Step 1 — Discovery** (`discoverCompanies`): `claude-sonnet-5`, `web_search` max 12 uses,
  `max_tokens` 32000. Queries = **selected search terms × each _website_ source's `search_prefix`**
  (default 3 terms × 4 sources = 12 = the search budget). Passes known company names so it only
  returns NEW ones; dedups; adds fresh ones to `discovery_queue`. Only runs if the queue has < 5
  pending. Two extra discovery paths run alongside: **`web page`** sources are read once via
  `web_fetch` (`discoverViaFetch`) and **`youtube`** sources go through the YouTube Data API v3
  (`discoverViaYouTube`) — neither consumes the 12-search budget. **Language is adaptive:** queries
  start in English but the model re-searches non-English sources in their own language as it reads
  (no manual language setting). `targetMarket` (from the selector) is a **soft steer** injected into
  all three paths (`marketSteer`) — there is no code-level region filter, so off-region companies
  that surface are still kept. After discovery, `bumpSourceStats` updates each source's
  `times_used` / `companies_found` counters.
- **Step 2 — Enrichment** (`enrichAll` / `enrichCompany`): `claude-sonnet-5`, `web_search` max 3
  uses, `max_tokens` 8000. Enriches up to 5 pending companies per run in parallel. Saves each to
  `companies` incrementally (`added = false`). Cache-checks `enriched_data` to avoid re-enriching.
- **Step 3 — ICP matching** (`evaluateCompanies`): `claude-sonnet-5`, **no web_search**,
  `max_tokens` 16000. Runs automatically after Steps 1–2. Only companies that pass are returned
  (stored in `search_jobs.results`); enriched companies that don't pass are marked `rejected`. If it
  fails, `results` is null — the enriched companies are already saved (cached), so searching again
  re-scores them cheaply; the UI shows a "scoring didn't complete — search again" message.
- **Overall timeout:** 30 minutes (shared `AbortController`), covering steps 1+2+3.

## 6. Database (Supabase)

- **`companies`** — source of truth. Columns: `name`, `geography`, `product_category` (both are
  **multi-value**: comma-separated in the single text column — parse/join via `parseMulti`/`joinMulti`
  in `lib/format.ts`), `max_price`,
  `price_currency`, `icp_fit`, `website_url`, `source_name`, `description`, `priority_tier`,
  `enriched_data` (jsonb), `enriched_at`, `added_at` (when saved to the DB), `status` (outreach state,
  default `not_contacted` — migration 015), `rejected` (bool), `added` (bool).
  `added=true & rejected=false` → shown; `added=false` → enriched-not-reviewed (cache);
  `rejected=true` → excluded. The database table shows an **Added** date (falls back to `enriched_at`
  for pre-015 rows) and an editable **Status** dropdown; both are included in the Excel export.
- **`discovery_queue`** — `name`, `source_name`, `status` (pending/processing),
  `processing_started_at`, `discovered_at`. Rows stuck "processing" > 10 min are reset to pending
  at search start.
- **`search_jobs`** — `status` (running/done/no_companies/error), `message`, `enriched` (jsonb),
  **`results` (jsonb — passing companies from Step 3)**, `timed_out` (bool), `error`, timestamps.
  Drives polling. (`step3_prompt` column is legacy/unused since manual Step 3 was removed.)
- **`search_logs`** — `job_id`, `message`, `created_at` (one row per log line). Drives the log panel.
- **`sources`** — UI-editable search config, plus per-source performance counters `times_used` and
  `companies_found` (migration 012). With `companies.source_name`, these drive the
  **"used X · queued Y · saved Z"** line under each source. `featured` (bool, migration 018) marks a
  source as "recommended high quality" — shown in the short default list in the search tab.
  `last_used_at` (migration 019) records the last discovery run that used the source — shown as a
  "last used" date; `search_terms.last_used_at` does the same per term. Both are set in
  `bumpSourceStats` / after discovery. See
  [SEARCH_PIPELINE.md → Source performance counters](SEARCH_PIPELINE.md#source-performance-counters).
- **`product_categories`** — the editable `product_category` vocabulary (`name`, `active`, `sort_order`),
  migration 017. Read by the UI dropdowns (via `useCategories`, edited in the ICP tab) and by the
  Step 3 prompt (`getProductCategories` in `lib/search.ts`); both fall back to the built-in defaults if
  the table is missing/empty.
- **`app_users`** — the pilot login table (`email`, `password` in plaintext), migration 011. See §10.
- **`app_settings`** — shared key/value settings (migration 013). Holds the source-warning thresholds
  `source_warn_threshold_pct` (default `1`) and `source_warn_min_uses` (default `5`), edited from the
  **Source performance** modal; and `icp_review_instructions` — the editable AI-review rubric, edited
  from the "What does the AI review check?" window (absent → the `lib/icpReview.ts` default is used);
  and `icp_test_companies` — the fixed example set for "Test on example companies" (JSON
  `{name, expected}[]`), edited from the "Manage test example companies" window.
- **`icp_docs`** — the editable ICP text per market (`market` `eu`/`us`, `content`), migration 014.
  Read by `getIcpDocs` (worker) and the ICP tab; empty → falls back to `config/icp*.md`.
- **`icp_doc_versions`** — a snapshot of the ICP `content` on every save (`market`, `content`,
  `saved_by`, `created_at`) for the version-history / revert feature.
- **`youtube_cursors`** / **`youtube_seen`** — YouTube discovery pagination (migration 016): the per-query
  next-page token, and every processed video id, so YouTube keeps surfacing new videos across runs.

> **Migration notes:**
> - `results` column on `search_jobs` (automatic Step 3): `alter table search_jobs add column results jsonb;`
> - Source stats (migration 012): `times_used` / `companies_found` on `sources`, `source_name` on
>   `companies`. Forward-looking — counters start at 0 and accumulate from the next search.
> - Source warning (migration 013): `app_settings` table with the editable hit-rate thresholds.
> - Editable ICP (migration 014): `icp_docs` + `icp_doc_versions` tables. Empty is fine — the config
>   files remain the fallback until someone edits the ICP from the app.
> - Editable product categories (migration 017): `product_categories` table. Absent/empty → the
>   built-in defaults are used, so nothing breaks before it's applied.
> - Featured sources (migration 018): `sources.featured` bool. Until applied, saving a source fails,
>   so apply it before editing sources; the search tab just shows all sources (no featured filtering).
> - Last-used dates (migration 019): `last_used_at` on `sources` + `search_terms`, plus a one-time
>   backfill of source dates from each source's most recent saved company (terms fill from the next
>   search). Absent → the dates just show blank until the next run.

## 7. Key files

- `app/page.tsx` — the app **shell** only (client component, ~150 lines): pilot login/logout, the
  active-tab state, the header/tab-nav, the four tab renders, and the footer. All feature logic lives
  in the per-tab components + hooks below. It calls `useCompanies()` once and passes it to both the
  Database tab (as `api`) and the Search tab (`savedBySource` + `loadCompanies`), so the two share one
  instance of the companies state.
- **UI architecture (the page.tsx split).** Each tab is a component that owns its JSX + modals; its
  state and handlers live in a matching hook (call the hook **once** — a shared hook is called in
  `page.tsx` and passed down as a prop, never called twice). Layout:
  - `app/components/database/CompanyDatabaseTab.tsx` + `app/hooks/useCompanies.ts` — the company list,
    filters, inline edit/remove/clear, selection, Excel export, and the `savedBySource` memo. The hook
    is created in `page.tsx` and passed in as `api` (the Search tab reuses the same instance).
  - `app/components/search/FindCompaniesTab.tsx` + `app/hooks/useSearch.ts` — the whole Find New
    Companies domain: search-config draft editing, the background agent job + polling refs, the
    discovery queue, result review/save, and the source-performance settings/helpers. The component
    calls `useSearch(reloadCompanies)` itself; `savedBySource` + `reloadCompanies` come from
    `useCompanies` via props, and `onGoToDatabase` switches the parent's tab after a save.
  - `app/components/icp/IcpTab.tsx` + `app/hooks/useIcpEditor.ts` — the ICP editor (load/edit/review/
    apply-diff/test/commit/history). `IcpTab` calls `useIcpEditor` itself; the product-category editor
    (`useCategories`, created in `page.tsx`) is passed in as `categoriesApi`.
  - `app/hooks/useCategories.ts` — the editable `product_category` vocabulary (list + draft/diff-save),
    created once in `page.tsx` and passed to `IcpTab` (edit, via `ManageCategoriesModal`) and to the
    Database + search tabs (read-only, as the `categories` prop for the dropdowns).
  - `app/components/about/HowItWorksTab.tsx` — the static "How It Works" tab (no hook).
  - `app/components/search/{QueueModal,SourcePerfModal,SourceModal}.tsx`,
    `app/components/database/AddCompanyModal.tsx`, `app/components/icp/{ReviewInfoModal,ManageExamplesModal,ManageCategoriesModal}.tsx`
    — presentational modals, all props-driven (no state of their own).
  - `app/components/common/{AuthScreen,MarketBadge,MultiSelect}.tsx` — the login screen, the source
    market badge, and the reusable multi-select checkbox dropdown (portal-rendered so it's never
    clipped) used for the multi-value geography / product-category fields.
  - `lib/styles.ts` — shared style objects (`inputStyle`, `labelStyle`, `btnPrimary`, `btnSecondary`,
    `addBtnStyle`, …). `lib/uiConstants.ts` — UI constants + option lists (`GEO_OPTIONS`, `SOURCE_OPTIONS`,
    `CAT_OPTIONS` (category fallback), `AUTH_KEY`, `DEMO_MODE`, …). `lib/uiTypes.ts` — shared UI types
    (`Company`, `SearchResult`, …). `lib/format.ts` — presentation helpers (`diffLines` line-level LCS,
    `icpColor`, `safeHref`, `displayHostname`, `fmtAddedDate`, `parseMulti`/`joinMulti`).
- `app/layout.tsx` — page metadata (browser-tab title, description, `lang`).
- `app/globals.css` — global styles: the colour-palette CSS variables, the site-wide button hover
  rule, and the default button border-radius. See [DESIGN.md](DESIGN.md).
- `lib/search.ts` — the pipeline: `discoverCompanies`, `enrichCompany`, `enrichAll`,
  `evaluateCompanies`, `buildStep3Prompt`, `searchForCompanies`. `emit()` logs to terminal +
  `search_logs`.
- `lib/supabase.ts` — the Supabase client.
- `app/api/search/start/route.ts` — starts the background job (+ CORS). Reads `searchConcepts`,
  `sourceNames`, and `targetMarket` (the user's selected terms/sources/market) from the request body.
- `app/api/reject/route.ts` — marks companies rejected (preserves `enriched_data`).
- `app/api/icp/route.ts` — serves the `config/icp*.md` files (the fallback/seed the UI merges with the `icp_docs` DB rows).
- `app/api/icp/check/route.ts` — **worker** endpoint (needs the Anthropic key): the advisory AI review of an edited ICP. Its rubric judges only whether the text works as **clear scoring instructions for an AI** (target market, tiers, a scoring method + scale, exclusions, internal consistency) — explicitly NOT whether the business criteria are "correct". Returns `{ ok, summary, issues[] }`; the UI shows it and lets the user save anyway.
- `lib/icpReview.ts` — the review rubric default (`DEFAULT_ICP_REVIEW_INSTRUCTIONS`) + `buildReviewPrompt()`. The **editable** rubric lives in `app_settings.icp_review_instructions`; the fixed scaffolding (ICP injection, `report_review` tool call, `ok` semantics) stays in this helper so an edit can't break the structured-output contract. Shared by the check route (server) and the UI (default/seed).
- `app/api/icp/apply/route.ts` — **worker** endpoint: rewrites the ICP draft to address one review point (forced `revised_icp` tool call), returns `{ content }`. The UI shows it as a **diff** (`diffLines`, a small local line-level LCS in `lib/format.ts`) and only loads it into the editor on "Use this version" — never auto-saved.
- `app/api/icp/test/route.ts` — **worker** endpoint (optional "Test on example companies"): scores the user's fixed example set against the **current editor draft** and returns every company with score/tier/included plus the user's `expected` label (`report_test` tool call, scored blind). The set comes from `app_settings.icp_test_companies` (JSON `{name, expected}[]`); if unset it falls back to a dynamic mix of recent added + rejected. Read-only — writes nothing. Runnable before or after the review.
- `lib/icpTest.ts` — types/const for the example set: `ICP_TEST_COMPANIES_KEY`, `IcpTestExample`, `EXPECTED_LABELS`, and `expectedMatch()` (ok/mismatch/none for the UI's Match column).
- `app/api/test-claude/route.ts` — diagnostic (checks key/credits + a web_search test).
- `lib/models.ts` — **single source of truth for the Claude model** (`CLAUDE_MODEL`). Every model call imports it. See [§ Which model, and why](#which-model-and-why).
- `lib/features.ts` — feature flags. `US_MARKET_ENABLED` (currently **`false`**) gates all US-market support: the US ICP sub-tab (shown as a disabled "· soon" placeholder), the target-market selector (locked to Europe), and US-ICP routing in Step 3 (everything scores against the European ICP). Nothing is deleted — flip to `true` to re-enable it all at once. Imported by the search UI (`FindCompaniesTab.tsx` / `useSearch.ts`), the ICP tab, and `lib/search.ts`.
- `app/api/search/route.ts` — OLD synchronous route, unused by the client (safe to delete).
- **`sources` / `search_terms` DB tables** — the authoritative, UI-editable search configuration
  (see [SEARCH_PIPELINE.md](SEARCH_PIPELINE.md#where-the-configuration-lives-database-not-the-file-anymore)).
- `config/sources.json` — now a **fallback** for the two tables (used if the DB read fails). May
  optionally carry `enrichment_model` to override the model for *just* the enrichment step (removed by
  default → the global `CLAUDE_MODEL` is used). `keyword_bank` was the old term pool, superseded by
  the `search_terms` table.
- `config/icp.md` — the **European** ICP definition (price threshold is currency-agnostic: ~60 in own currency). Now the **seed/fallback**: the live ICP is the `icp_docs` table, editable from the ICP tab.
- `config/icp_us.md` — the **US** ICP. Placeholder until real criteria are entered (in the app or here); Step 3 routes US companies to it by geography once it's real (see SEARCH_PIPELINE.md → Step 3). Also a fallback for the `icp_docs` `us` row.
- `config/mock-results.json` — demo data (only used if `DEMO_MODE = true` in `page.tsx`).
- `db/migrations/*.sql` — DB schema + seed (001 = sources/search_terms tables; 002+ = added sources;
  008 = source `market` tags; 011 = `app_users` login; 012 = source performance counters +
  `companies.source_name`; 013 = `app_settings` for the source-warning thresholds; 014 = `icp_docs`
  + `icp_doc_versions` for the editable ICP; 015 = `companies.added_at` + `companies.status`;
  016 = `youtube_cursors` + `youtube_seen` for YouTube pagination/de-dup; 017 = `product_categories`
  (editable category vocabulary); 018 = `sources.featured` (recommended sources); 019 = `last_used_at`
  on `sources` + `search_terms`).
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

### Which model, and why

Every Claude call in the app uses **one model**, defined once in `lib/models.ts` as `CLAUDE_MODEL`
(default **`claude-sonnet-5`**). Discovery, enrichment, ICP scoring, the ICP review + rewrite, and the
diagnostic route all import it — there are **no hardcoded model strings elsewhere**.

**To change the model (post-handover):** edit the default in `lib/models.ts`, **or** set the
`CLAUDE_MODEL` env var on the worker (no code change). All model calls are server-side, so the env var
alone is enough.

**Why `claude-sonnet-5`:**
1. **Server tools.** Steps 1–2 depend on `web_search_20260209` / `web_fetch_20260209`. Sonnet 5
   supports them; **Haiku does not support this web_search version**, so Haiku can't run discovery or
   enrichment — that rules it out for most of the app.
2. **Cost/quality balance.** The app is search-heavy (up to 12 discovery searches + one web_search per
   company enriched, every run). Sonnet 5 is strong enough for the extraction, scoring, and
   review/rewrite while costing far less and running faster than Opus.
3. **Opus would be overkill** for these structured extraction/scoring/rubric tasks — ~2–5× the cost,
   slower, no meaningful quality gain here.
4. **1M context** comfortably holds the large contexts that accumulate across multi-round web_search.
5. **One model everywhere** keeps behaviour predictable and cost easy to estimate.

If AKBM switches models, prefer one that still supports `web_search_20260209` / `web_fetch_20260209`
(required by Steps 1–2). The no-web-tool steps (ICP review/scoring) would tolerate more models, but a
single model is simpler. `sources.json` may still set `enrichment_model` to override *just* enrichment.

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

- **Pilot login only — NOT real security.** There is a simple email+password gate (`app_users`
  table, migration 011). Passwords are stored in **plaintext** and the table is open to the anon key,
  exactly like the rest of the app. It only stops casual browser access — anyone could still hit the
  Render worker API directly, and the anon key can read the users table. It's a deliberate throwaway
  gate; **real authentication is an open handover item for IT.** Session is a `localStorage` entry
  that auto-expires after 2 weeks. Users self-register from the login screen.
- The **Supabase anon key is public** (it's a `NEXT_PUBLIC_` var, by design). All tables
  (`companies`, `sources`, `search_terms`, …) are currently open to the anon key — RLS is either off
  or fully permissive, so anyone with the URL can read/write the shared config and data. This is the
  prototype's deliberate posture; **tightening it requires real auth**, which is the proper fix at
  handover (RLS without auth adds nothing here).
- The Anthropic key lives **only on Render**, not in the browser bundle. Keep it that way.

## 11. Roadmap / open to-dos

1. **US expansion** — add US companies/sources (vs. today's European focus).
2. **Company Prospectus** — the disabled "Soon" tab.
3. **Editable ICP tab** — ✅ done: free-form editing + version history (`icp_docs`); an **advisory AI
   review** on save (`POST /api/icp/check` — rubric, lists gaps, never blocks); **Apply fix** per
   review point with a diff (`POST /api/icp/apply`); an editable review rubric (`app_settings`); and an
   optional **Test on example companies** (`POST /api/icp/test`) that scores real companies against the
   current draft, runnable any time.
   - ✅ *Done:* source & term selection wired to the search; editable sources/terms (DB-backed,
     from the UI — draft edit mode with a single **Save changes** that diffs & applies); editable
     company database (edit fields + soft/hard delete); `web_fetch` for "web page" sources
     (`discoverViaFetch` — reads a fixed page and extracts companies); YouTube discovery
     (`discoverViaYouTube`, Data API v3); per-geography ICP (EU + US) with automatic routing;
     target-market discovery steer + source `market` tags; adaptive per-source language handling;
     pilot login (`app_users`); **per-source performance counts** ("used · queued · saved") with a
     **hit-rate low-performer warning** (editable, shared thresholds in `app_settings`);
     **multi-value geography + product category** across the UI *and* the AI (Step 3 returns arrays);
     **editable product-category vocabulary** (`product_categories`, edited in the ICP tab);
     **recommended/featured sources** (`sources.featured`) with a curated-by-default source list;
     **Source + Priority-tier filters** in the Company Database; auto-archiving of used-up single
     pages ("Completed single pages" + "Add back to source list"); and **last-used dates**
     (`last_used_at`) on sources + search terms.
6. **ICP validation** — compare the tool's ICP scores against AKBM's Excel of ~100 companies.
7. **Source-performance v2 (optional)** — the modal shows hit rate (found ÷ used) with a ⚠ warning
   today, and sources can be manually flagged "recommended"; a future step could auto-suggest which
   low performers to un-feature or auto-deactivate dead sources once stats are mature.
8. **Softer rejection** — un-reject / review rejected companies.
8. **AKBM handover** — ownership of repo/hosting/API keys, security, data residency, auth.
