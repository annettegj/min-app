-- Migration 007 — TikTok Shop source (trial, 2026-08)
-- Added as a 'web site' source: web_search scoped to the TikTok Shop domain via search_prefix
-- "shop.tiktok.com". Empirically (tested in an exploratory chat) a domain-scoped search — not a
-- search *about* TikTok Shop — returns real Shop listings, incl. category-relevant brands such as
-- Simply Nootropics (NMN/longevity). No VPN needed: the search index is global; TikTok Shop's
-- geo-block only affects a browser, not the search index.
--
-- Caveats: skews US and mass-market (beauty / gummy / collagen dominate), so the ICP filters many.
-- Cheap experiment — run once and see what the ICP keeps.
--
-- Idempotent: ON CONFLICT (name) DO NOTHING.

insert into sources (type, name, url, search_prefix, note) values
  ('web site', 'TikTok Shop', 'https://shop.tiktok.com', 'shop.tiktok.com',
   'Domain-scoped web_search of TikTok Shop supplement listings. Category-relevant brands (nootropics/longevity, e.g. Simply Nootropics) do surface, but it skews US and mass-market (beauty/gummy/collagen) — the ICP filters. Extract finished-brand supplement companies only.')
on conflict (name) do nothing;
