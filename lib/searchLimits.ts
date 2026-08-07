// How many companies are processed in a single search run, Step 2 (enrichment) + Step 3 (scoring)
// operate on at most this many, and it's also the most the user can hand-pick from the waiting list.
//
// This is the single source of truth for that "batch of 5". Change it HERE and both the search
// pipeline (lib/search.ts) and the UI (the waiting-list selection cap) update together.
//
// Note: raising it increases cost and run-time per search and pushes closer to the 30-minute limit
// and the AI provider's rate limits, see DECISIONS.md §2.2. Keep it modest.
export const ENRICH_BATCH_SIZE = 5;

// How many times a company must get "stuck" (left in "processing" by an interrupted run, then
// auto-recovered back to the queue) before the waiting list flags it with a warning. A single stuck
// occurrence is usually just a search the user cancelled, so we only warn on repeated failures.
export const STUCK_WARN_TIMES = 3;
