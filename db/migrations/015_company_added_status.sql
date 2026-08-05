-- Migration 015 — company "added_at" timestamp + editable outreach "status"
-- `added_at`: when the company was saved into the database (approved by a human). Existing rows are
-- left null (the UI falls back to enriched_at for those). `status`: a simple outreach state the user
-- can update from the database table. Idempotent.

alter table companies add column if not exists added_at timestamptz;
alter table companies add column if not exists status text not null default 'not_contacted';
