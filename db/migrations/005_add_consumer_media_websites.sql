-- Migration 005 — consumer health media (Website sources), 2026-08
-- The rest of the Perplexity consumer-media list. We no longer treat US focus as a reason to
-- exclude a source — the ICP step filters to European finished brands downstream — so these US
-- consumer publications are added as ongoing Website sources (searched via web_search on the
-- domain). They publish "best supplements" brand round-ups, which name finished brands.
--
-- Kept OUT (and why) — see SOURCES.md: Examine / NIH ODS (ingredient/evidence only, no company
-- names), ConsumerLab / Consumer Reports (paywalled), Google Trends / Spate / Glimpse (trend
-- dashboards, no company list), social platforms (signal, not company data). None excluded for being US.
--
-- Idempotent: ON CONFLICT (name) DO NOTHING.

insert into sources (type, name, url, search_prefix, note) values
  ('web site', 'Well+Good', 'https://www.wellandgood.com', 'wellandgood.com supplements',
   'US consumer wellness media — publishes supplement brand round-ups and trend pieces. Extract finished-brand supplement companies; the ICP filters to European brands.'),
  ('web site', 'Everyday Health', 'https://www.everydayhealth.com', 'everydayhealth.com supplements',
   'US consumer health media — nutrition/supplement product coverage and round-ups. Extract finished-brand supplement companies; the ICP filters to European brands.'),
  ('web site', 'Prevention', 'https://www.prevention.com', 'prevention.com best supplements',
   'US consumer health/nutrition media — "best supplements" round-ups. Extract finished-brand supplement companies; the ICP filters to European brands.'),
  ('web site', 'Verywell Health', 'https://www.verywellhealth.com', 'verywellhealth.com best supplements',
   'US medically-reviewed consumer health media — some supplement "best of" reviews (more ingredient/condition focused). Extract finished-brand supplement companies; the ICP filters to European brands.')
on conflict (name) do nothing;
