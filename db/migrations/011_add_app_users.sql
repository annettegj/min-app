-- Migration 011 — app_users (SIMPLE pilot login, NOT secure)
-- A plain table of users, stored just like any other data. Passwords are stored in PLAINTEXT and
-- the table is open to the anon key (same posture as the rest of the app). This is a deliberate,
-- throwaway pilot gate — real authentication/security is IT's job at handover.
-- Idempotent.

create table if not exists app_users (
  id         bigint generated always as identity primary key,
  email      text not null unique,
  password   text not null,
  created_at timestamptz not null default now()
);

alter table app_users disable row level security;
grant select, insert, update, delete on app_users to anon, authenticated;
