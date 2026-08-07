-- Migration 021 — track how often a queued company gets stuck
-- When a search is interrupted (cancelled, crash, timeout) companies can be left in "processing".
-- The app auto-recovers them back to "pending" on the next search; this counter records how many
-- times that has happened so the waiting list can flag a company that repeatedly hangs (see
-- STUCK_WARN_TIMES in lib/searchLimits.ts). Idempotent: safe to re-run.

alter table discovery_queue add column if not exists stuck_count integer not null default 0;
