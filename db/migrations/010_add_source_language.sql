-- Migration 010 — source language (2026-08)
-- Adds a `language` (ISO code) to each source. During discovery the search terms are automatically
-- translated into a source's language before querying it (lib/search.ts → translateConcepts), so
-- non-English sites (e.g. a French or German site) are searched in their own language. English needs
-- no translation. "web page" (web_fetch) sources are read directly, so language doesn't affect them.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS (default 'en' backfills existing rows) + name-scoped update.

alter table sources add column if not exists language text not null default 'en';

-- Darwin Nutrition is a French site (with an English edition) — query it in French to surface more
-- European brands. All other current sources are English-facing (kept at the 'en' default).
update sources set language = 'fr' where name = 'Darwin Nutrition';
