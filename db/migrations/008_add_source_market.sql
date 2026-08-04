-- Migration 008 — source market tag (2026-08)
-- Adds a `market` label to each source (EU / US / Global) so the UI can show which market a source
-- leans toward, helping the user pick sources that match the search's target market.
-- Purely informational — it does not affect scoring or discovery.
-- Idempotent: ADD COLUMN IF NOT EXISTS + name-scoped updates.

alter table sources add column if not exists market text;

update sources set market = 'EU' where name in (
  'NutraIngredients Europe', 'Vitafoods Europe', 'In-Vitality', 'EHPM — Member Companies'
);

update sources set market = 'US' where name in (
  'Nutritional Outlook', 'Healthline — Best Vitamin Brands', 'SupplySide Supplement Journal',
  'mindbodygreen — Best Omega-3 Supplements', 'mindbodygreen — Best Memory Supplements',
  'mindbodygreen — Best Nootropics', 'Well+Good', 'Everyday Health', 'Prevention',
  'Verywell Health', 'TikTok Shop'
);

update sources set market = 'Global' where name in (
  'Nutrition Insight', 'Nutraceutical Business Review', 'YouTube — Supplement Reviews'
);
