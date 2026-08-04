-- Migration 013 — app_settings (simple shared key/value settings)
-- Holds app-wide, UI-editable settings. First use: the source-performance warning thresholds
-- (warn when a source's hit rate — companies found ÷ times used — falls below a percentage, once it
-- has been used a minimum number of times). Stored like any other data; open to the anon key, same
-- posture as the rest of the pilot. Idempotent.

create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings disable row level security;
grant select, insert, update, delete on app_settings to anon, authenticated;

insert into app_settings (key, value) values
  ('source_warn_threshold_pct', '1'),
  ('source_warn_min_uses', '5')
on conflict (key) do nothing;
