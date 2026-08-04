-- Migration 012 — source performance counters (simple counts; no yield/warning yet)
-- Tracks, per source, how many times it has been used in a search and how many companies it has
-- contributed to the discovery queue. Companies also record which source found them, so we can
-- count how many made it into the approved database per source. Forward-looking: counters start
-- at 0 and accumulate from the next search onward. Idempotent.

alter table sources add column if not exists times_used integer not null default 0;
alter table sources add column if not exists companies_found integer not null default 0;

-- source_name may already exist (the app writes it on save); add it defensively.
alter table companies add column if not exists source_name text;
