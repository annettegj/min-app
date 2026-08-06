-- Migration 017 — product categories
-- Moves the product-category vocabulary out of the hardcoded CAT_OPTIONS constant (and the Step 3
-- prompt) into the database so it can be edited from the app (Lysoveta ICP Criteria tab) without a
-- redeploy. The UI dropdowns (filter, add, edit, post-search adjust) and the AI's Step 3 prompt both
-- read from this table; there is a built-in fallback to the seed values below if the read fails, so
-- the app keeps working before this migration is applied.
-- Idempotent: safe to re-run (IF NOT EXISTS on the table, ON CONFLICT DO NOTHING on the seed).
--
-- ⚠️ RLS: read/written with the Supabase ANON key (same posture as sources / search_terms / companies).
-- Public read/write for the prototype — tighten (auth) at the AKBM handover.

-- ---- Table ----

create table if not exists product_categories (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---- RLS (anon read/write, matching the sources / search_terms posture) ----

alter table product_categories enable row level security;

drop policy if exists "public access product_categories" on product_categories;
create policy "public access product_categories" on product_categories for all using (true) with check (true);

-- ---- Seed (current CAT_OPTIONS values, in display order) ----

insert into product_categories (name, sort_order) values
  ('Premium/science-driven brand', 1),
  ('Pharma Rx',                     2),
  ('Established CHC',               3),
  ('Distributor/enabler',          4)
on conflict (name) do nothing;
