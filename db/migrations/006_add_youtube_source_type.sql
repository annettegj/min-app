-- Migration 006 — YouTube source type (2026-08)
-- Extends the allowed source types to include 'youtube': the pipeline searches YouTube (Data API v3)
-- for the selected terms and extracts brands from video titles/descriptions (lib/search.ts →
-- discoverViaYouTube). Requires YOUTUBE_API_KEY set on the server (Render) — the search simply skips
-- YouTube sources if the key is missing.
--
-- Also adds one starter YouTube source. Experimental/complementary — noisier and US/English-leaning;
-- the ICP step filters downstream.
--
-- Idempotent: constraint is dropped/re-added; insert uses ON CONFLICT (name) DO NOTHING.

alter table sources drop constraint if exists sources_type_check;
alter table sources add constraint sources_type_check check (type in ('web site', 'web page', 'youtube'));

insert into sources (type, name, url, search_prefix, note) values
  ('youtube', 'YouTube — Supplement Reviews', null, 'supplement review',
   'Searches YouTube (Data API v3) for the selected terms and extracts brands from video titles/descriptions. Experimental; US/English-skewed. search_prefix biases the query (e.g. "supplement review"). Requires YOUTUBE_API_KEY on the server.')
on conflict (name) do nothing;
