-- Migration 002 — trade-show sources (trial)
-- Adds two event/trade-show sources evaluated 2026-08 (full test log in SOURCES.md).
--
-- Both are 'web site' (searched via web_search), NOT 'web page': their exhibitor directories are
-- JavaScript databases / blocked aggregators that web_fetch can't read, but Google has indexed some
-- of the exhibitor text, so a domain-scoped search is the only path that might work.
--
-- The note steers extraction toward finished-brand supplement companies — the ICP excludes the
-- ingredient suppliers, contract manufacturers (façonniers) and distributors that dominate these
-- shows, so match rate is expected to be low. This is a deliberate trial: run one dev search with
-- only these selected and watch the yield (see the "no matches" warning work, once built).
--
-- Idempotent: safe to re-run (ON CONFLICT (name) DO NOTHING).

insert into sources (type, name, url, search_prefix, note) values
  ('web site', 'Vitafoods Europe', 'https://www.vitafoods.eu', 'Vitafoods Europe exhibitors',
   'Nutraceutical trade show (Informa). Extract ONLY finished-brand supplement companies that exhibit; skip ingredient suppliers, contract manufacturers (façonniers) and distributors — those are excluded by the ICP. Focus on European brands.'),
  ('web site', 'In-Vitality', 'https://www.in-vitality.it', 'in-vitality.it exhibitors',
   'Italian nutraceutical trade show — raw-materials heavy, so expect many ingredient suppliers to skip. Extract ONLY finished-brand supplement companies; skip ingredient suppliers, contract manufacturers and distributors (excluded by the ICP).')
on conflict (name) do nothing;
