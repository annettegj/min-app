-- Migration 009 — European consumer sources (trial, 2026-08)
-- From a Perplexity list of EU sources. Added the two that (a) name European brands and (b) work
-- with our English search terms: Darwin Nutrition (FR/EU, has an English edition) and Which? (UK).
-- Both are 'web site' (domain-scoped web_search), market = EU.
--
-- Held (see SOURCES.md), not added: Stiftung Warentest (DE), Que Choisir (FR), Test Achats (BE),
-- Altroconsumo (IT) — name EU brands but are paywalled AND non-English, so English-term domain
-- searches surface little (would need localized search terms). Food Supplements Europe / AESGP —
-- trade associations publishing survey/market data, not company lists.
--
-- Idempotent: ON CONFLICT (name) DO NOTHING. (Requires migration 008 for the `market` column.)

insert into sources (type, name, url, search_prefix, note, market) values
  ('web site', 'Darwin Nutrition', 'https://www.darwin-nutrition.fr', 'darwin-nutrition.fr',
   'French/European consumer nutrition media (editorial buying guides; English edition available). Names European supplement brands (e.g. Cuure, Novoma, Dynveo, Aime). Good EU brand source.', 'EU'),
  ('web site', 'Which?', 'https://www.which.co.uk', 'which.co.uk supplements',
   'UK consumer-review organisation — supplement "best of" reviews name UK/EU brands (Vitabiotics, Higher Nature, Boots, Holland & Barrett). Full results are paywalled, so extract company names from titles/snippets.', 'EU')
on conflict (name) do nothing;
