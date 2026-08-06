-- Migration 018 — featured (recommended high-quality) sources
-- Adds a per-source flag so the search-tab source list can show a short, curated default set
-- ("Recommended high quality source") per type group, with a "Show all sources" toggle for the rest.
-- Fallback behaviour in the UI: if a type group has NO featured sources, it shows all of them — so
-- nothing disappears before the list is curated.
-- Idempotent: ADD COLUMN IF NOT EXISTS (default false backfills existing rows).

alter table sources add column if not exists featured boolean not null default false;
