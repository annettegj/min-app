-- Migration 003 — EHPM member list (Single page)
-- EHPM = European Federation of Associations of Health Product Manufacturers. Its member list is a
-- small, STATIC page (~18 corporate members + national associations), so it's added as a 'web page'
-- source read once via web_fetch. The note tells the AI to keep only finished-brand supplement
-- companies and skip the trade associations and ingredient suppliers the ICP excludes.
-- Low volume and a fixed list (nothing new on re-runs) — see SOURCES.md.
-- Idempotent: ON CONFLICT (name) DO NOTHING.

insert into sources (type, name, url, search_prefix, note) values
  ('web page', 'EHPM — Member Companies', 'https://ehpm.org/members-list-2/', null,
   'European federation of health-product manufacturers. Extract ONLY finished-brand supplement companies from the member list; skip the national trade associations and ingredient suppliers (excluded by the ICP).')
on conflict (name) do nothing;
