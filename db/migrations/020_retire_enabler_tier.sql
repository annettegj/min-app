-- Migration 020 — retire the "Enabler" priority tier
-- "Enabler" is dropped as a priority tier (distributors are already captured by the company category
-- "Distributor/enabler"). Any company currently tagged Enabler becomes a Follower. This is a data
-- update only — no schema change. Idempotent: safe to re-run.

update companies set priority_tier = 'follower' where priority_tier = 'enabler';
