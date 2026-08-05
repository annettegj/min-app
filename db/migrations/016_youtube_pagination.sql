-- Migration 016 — YouTube pagination + seen-video guard
-- Makes the YouTube discovery source keep finding NEW videos over time instead of re-fetching the
-- same top results every run.
--   • youtube_cursors : per search query, the "next page" bookmark (pageToken) so each run advances
--                       to the next page of results. Cleared when results run out → starts over.
--   • youtube_seen    : every video id already processed, so a video is never read twice.
-- Same open posture as the rest of the pilot. Idempotent.

create table if not exists youtube_cursors (
  query           text primary key,
  next_page_token text,
  updated_at      timestamptz not null default now()
);

create table if not exists youtube_seen (
  video_id text primary key,
  seen_at  timestamptz not null default now()
);

alter table youtube_cursors disable row level security;
alter table youtube_seen disable row level security;
grant select, insert, update, delete on youtube_cursors to anon, authenticated;
grant select, insert, update, delete on youtube_seen to anon, authenticated;
