-- Migration 001 — sources & search terms
-- Moves the search configuration out of config/sources.json and into the database so it can be
-- edited from the app (add/edit/delete sources and search terms) without a redeploy.
-- Idempotent: safe to re-run (IF NOT EXISTS on tables, ON CONFLICT DO NOTHING on the seed).
--
-- ⚠️ RLS: the app reads and writes these tables with the Supabase ANON key (same as `companies`).
-- The policies below grant public read/write. This is the prototype's existing security posture —
-- tighten it (auth) at the AKBM handover.

-- ---- Tables ----

create table if not exists sources (
  id            bigint generated always as identity primary key,
  type          text not null default 'web site' check (type in ('web site', 'web page')),
  name          text not null unique,
  url           text,
  search_prefix text,               -- required for 'web site'; null for 'web page'
  note          text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists search_terms (
  id          bigint generated always as identity primary key,
  term        text not null unique,
  is_default  boolean not null default false,  -- used when the user selects no terms
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---- RLS (anon read/write, matching the `companies` posture) ----

alter table sources enable row level security;
alter table search_terms enable row level security;

drop policy if exists "public access sources" on sources;
create policy "public access sources" on sources for all using (true) with check (true);

drop policy if exists "public access search_terms" on search_terms;
create policy "public access search_terms" on search_terms for all using (true) with check (true);

-- ---- Seed (current config/sources.json values) ----

insert into sources (type, name, url, search_prefix, note) values
  ('web site', 'NutraIngredients Europe',         'https://www.nutraingredients.com',            'nutraingredients.com Europe',     'Serves the US edition by default — always keep "Europe" in the query and focus on European companies.'),
  ('web site', 'Nutrition Insight',               'https://www.nutritioninsight.com',            'nutritioninsight.com',            null),
  ('web site', 'Nutraceutical Business Review',   'https://www.nutraceuticalbusinessreview.com', 'nutraceuticalbusinessreview.com', 'Many articles are paywalled — titles are visible in search, but full text may be blocked. Extract company names from titles/snippets when needed.'),
  ('web site', 'Nutritional Outlook',             'https://www.nutritionaloutlook.com',          'nutritionaloutlook.com',          null),
  ('web page', 'Healthline — Best Vitamin Brands','https://www.healthline.com/nutrition/best-vitamin-brands', null,             'One-time harvest of a fixed brand list. Fetched once via web_fetch. Re-running yields nothing new after the first harvest.')
on conflict (name) do nothing;

insert into search_terms (term, is_default) values
  ('longevity healthy aging', true),
  ('cognitive brain health', true),
  ('nootropic supplement brand', true),
  ('brain health', false), ('cognitive performance', false), ('nootropic', false),
  ('memory support', false), ('brain fog', false), ('longevity', false),
  ('healthy aging', false), ('healthspan', false), ('neuroprotection', false),
  ('neuro vitality', false), ('cognitive resilience', false), ('brain regeneration', false),
  ('prevent cognitive decline', false), ('precision nutrition', false), ('premium supplementation', false),
  ('wellness', false), ('vitality', false), ('innovation', false),
  ('lifespan', false), ('peakspan', false), ('biohackers', false), ('premium lifestyle', false)
on conflict (term) do nothing;
