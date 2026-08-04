-- Migration 004 — consumer & trade media sources (2026-08)
-- From a Perplexity list of consumer/trend media (see SOURCES.md). We no longer exclude US-leaning
-- sources — the ICP step filters to European finished brands downstream, so it's fine to cast wider.
--
-- SupplySide Supplement Journal: a trade publication (names companies in news) → 'web site'.
-- mindbodygreen: its SHOP pages are single-brand + JavaScript (rejected); its EDITORIAL "best of"
-- round-up articles are static and review many brands, so we add a few on-topic ones as 'web page'
-- (one-time harvests of a fixed list). The omega-3 list even includes a krill brand (Kori).
--
-- Idempotent: ON CONFLICT (name) DO NOTHING.

insert into sources (type, name, url, search_prefix, note) values
  ('web site', 'SupplySide Supplement Journal', 'https://www.supplysidesj.com', 'supplysidesj.com',
   'Supplement trade media (US-based, global coverage) — names companies in launch/news articles. Extract finished-brand supplement companies; skews US, so prioritise European brands.'),
  ('web page', 'mindbodygreen — Best Omega-3 Supplements', 'https://www.mindbodygreen.com/articles/best-omega-3-supplements', null,
   'Editorial round-up of ~10 omega-3 supplement brands (US-leaning; ICP filters to European finished brands). One-time harvest of a fixed list. On-topic for Lysoveta (omega-3/krill).'),
  ('web page', 'mindbodygreen — Best Memory Supplements', 'https://www.mindbodygreen.com/articles/best-memory-supplements', null,
   'Editorial round-up of ~16 memory/cognitive supplement brands (US-leaning; ICP filters). One-time harvest of a fixed list.'),
  ('web page', 'mindbodygreen — Best Nootropics', 'https://www.mindbodygreen.com/articles/best-nootropics', null,
   'Editorial round-up of ~6 nootropic/focus supplement brands (US-leaning; ICP filters). One-time harvest of a fixed list.')
on conflict (name) do nothing;
