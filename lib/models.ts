// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH FOR THE CLAUDE MODEL
// ─────────────────────────────────────────────────────────────────────────────
// Every Claude API call in this app (discovery, enrichment, ICP scoring, the ICP
// review + rewrite, and the diagnostic route) uses CLAUDE_MODEL below. To switch
// the whole app to a different model, change it in ONE place:
//   • edit the default string here, OR
//   • set the CLAUDE_MODEL environment variable on the worker (Render), no code change.
// (All model calls run server-side on the worker, so the plain env var is enough;
//  no NEXT_PUBLIC_ prefix, which also keeps it out of the browser bundle.)
//
// ── Why claude-sonnet-5? ─────────────────────────────────────────────────────
// 1. Server tools: the pipeline depends on the current server-tool versions
//    web_search_20260209 and web_fetch_20260209. Sonnet 5 supports them; Haiku
//    does NOT support this web_search version, so Haiku can't run discovery or
//    enrichment at all. That alone rules Haiku out for most of the app.
// 2. Cost / quality balance: the app is search-heavy (up to 12 discovery searches
//    + one web_search per company enriched, every run). Sonnet 5 is strong enough
//    for the extraction, ICP scoring, and review/rewrite tasks while costing far
//    less and running faster than Opus, the right tier for high call volume.
// 3. Opus would be overkill: these are structured extraction / scoring / rubric
//    tasks, not open-ended reasoning. Opus costs ~2–5× more and is slower for no
//    meaningful quality gain here.
// 4. Large context: Sonnet 5's 1M window comfortably holds the large contexts that
//    accumulate across multi-round web_search calls.
// 5. One model everywhere keeps behaviour predictable and cost easy to estimate.
//
// If AKBM later wants a different model, prefer one that still supports
// web_search_20260209 / web_fetch_20260209 (needed by Steps 1–2). The ICP review
// and scoring steps (no web tools) would work on more models, but keeping a single
// model is simpler.
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-5";
