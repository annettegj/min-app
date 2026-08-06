-- Migration 019 — last-used timestamps
-- Records when a source and a search term were last part of a discovery run, so the UI can show
-- freshness (e.g. how long ago a completed single page was read, or when a term was last used).
-- Set in bumpSourceStats / after discovery in lib/search.ts. Idempotent (ADD COLUMN IF NOT EXISTS).

alter table sources      add column if not exists last_used_at timestamptz;
alter table search_terms add column if not exists last_used_at timestamptz;

-- One-time backfill for SOURCES from existing company data: set last_used_at to the date of the most
-- recent company each source produced, so real dates show immediately (not blank until the next run).
-- Only touches rows still null; sources that never produced a saved company stay null (unknown).
-- Search terms have no historical data to derive from — they fill in from the next search onward.
update sources s
set last_used_at = sub.max_added
from (
  select source_name, max(coalesce(added_at, enriched_at)) as max_added
  from companies where source_name is not null group by source_name
) sub
where s.name = sub.source_name and s.last_used_at is null;
