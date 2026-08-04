-- Migration 014 — editable ICP documents (moves ICP from config files into the DB)
-- The ICP criteria used by Step 3 matching become UI-editable. `icp_docs` holds the current text per
-- market ('eu' | 'us'); `icp_doc_versions` keeps a snapshot on every save so edits can be reverted.
-- No seed rows: an empty table means the worker/UI fall back to config/icp.md and config/icp_us.md,
-- so behaviour is unchanged until someone edits from the app. Same open posture as the rest of the
-- pilot. Idempotent.

create table if not exists icp_docs (
  market     text primary key,          -- 'eu' | 'us'
  content    text not null,
  updated_at timestamptz not null default now()
);

create table if not exists icp_doc_versions (
  id         bigint generated always as identity primary key,
  market     text not null,
  content    text not null,
  saved_by   text,                      -- the logged-in email that saved this version (best-effort)
  created_at timestamptz not null default now()
);

create index if not exists icp_doc_versions_market_idx on icp_doc_versions (market, created_at desc);

alter table icp_docs disable row level security;
alter table icp_doc_versions disable row level security;
grant select, insert, update, delete on icp_docs to anon, authenticated;
grant select, insert, update, delete on icp_doc_versions to anon, authenticated;
