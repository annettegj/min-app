import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import sourcesConfig from "@/config/sources.json";
import { CLAUDE_MODEL } from "@/lib/models";
import { US_MARKET_ENABLED } from "@/lib/features";


// ---- Types ----

type Source = {
  // "web site" (default): a whole site/publication searched repeatedly via web_search.
  // "web page": one specific URL fetched once via web_fetch.
  // "youtube": search YouTube (Data API v3) for the concepts, extract brands from video metadata.
  type?: "web site" | "web page" | "youtube";
  name: string;
  url: string;
  search_prefix?: string; // "web site": prepended to each query. "youtube": optional query bias. "web page": absent.
  note?: string;
};

type DiscoveredCompany = {
  name: string;
  source_name: string;
};

export type SearchResult = {
  name: string;
  website_url: string;
  description: string;
  priority_tier: "early_mover" | "follower" | "enabler" | null;
  icp_score: number | null;
};

// The full result of Step 3 ICP matching — matches the JSON schema in buildStep3Prompt and the
// fields the UI reads when building the selectable results list (geography, product_category, price).
export type EvaluatedCompany = {
  name: string;
  website_url: string;
  description: string;
  priority_tier: "early_mover" | "follower" | "enabler" | null;
  icp_score: number | null;
  geography: string;
  product_category: string;
  max_price_eur: number | null;
  price_currency: string | null;
};

export type SearchDebug = {
  step1_discovered: number;
  step1_skipped: number;
  step1_new_to_queue: number;
  queue_pending_before: number;
  step2_enriched: number;
  step2_failed: number;
  enrichment_model: string;
};

export type EnrichedCompany = {
  name: string;
  source_name: string;
  website_url: string;
  product_focus: string;
  omega3_or_krill: string;
  self_presentation: string;
  price_tier: string;
  price_found: boolean;
  price_currency: string | null;
  european_markets: string;
  distribution_channels: string;
};

// ---- Helpers ----

// Normalizes a company name for deduplication — strips legal suffixes and parenthetical
// additions so "Doppelherz (Queisser Pharma)" and "Doppelherz GmbH" both match "doppelherz".
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\b(gmbh|ag|ltd|llc|inc|corp|bv|sas|srl|sa|nv|plc|oy|ab|as|se|spa|kft|sro)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseJsonArray<T>(response: Anthropic.Message): T[] {
  const textBlock = response.content.findLast((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];
  const stripped = textBlock.text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
  const match = stripped.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as T[];
  } catch {
    return [];
  }
}

function parseJsonObject(response: Anthropic.Message): Record<string, unknown> | null {
  const textBlock = response.content.findLast((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  const stripped = textBlock.text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Bumps the per-source performance counters after a discovery run: +1 `times_used` for every
// source that took part, and +N `companies_found` for each source that contributed N new companies
// to the queue. Read-modify-write (safe here — one search runs at a time). Best-effort: a failure
// only loses a stat, never the search. `foundByName` keys are the source_name values the model
// returned; if one doesn't match a real source row the update simply affects nothing.
async function bumpSourceStats(
  supabase: SupabaseClient,
  usedNames: string[],
  foundByName: Map<string, number>
): Promise<void> {
  const names = Array.from(new Set([...usedNames, ...foundByName.keys()]));
  if (names.length === 0) return;
  const { data: rows, error } = await supabase
    .from("sources")
    .select("name, times_used, companies_found")
    .in("name", names);
  if (error) {
    emit(`[search] Stats: could not read source counters — ${error.message}`);
    return;
  }
  const cur = new Map(
    (rows ?? []).map((r: { name: string; times_used: number | null; companies_found: number | null }) => [r.name, r])
  );
  const usedSet = new Set(usedNames);
  await Promise.all(
    names.map(async (name) => {
      const row = cur.get(name);
      if (!row) return; // no matching source row (e.g. a stray source_name) — skip
      const times_used = (row.times_used ?? 0) + (usedSet.has(name) ? 1 : 0);
      const companies_found = (row.companies_found ?? 0) + (foundByName.get(name) ?? 0);
      const { error: upErr } = await supabase
        .from("sources")
        .update({ times_used, companies_found })
        .eq("name", name);
      if (upErr) emit(`[search] Stats: could not update "${name}" — ${upErr.message}`);
    })
  );
  emit(`[search] Stats: updated counters for ${cur.size} source(s)`);
}

// ---- Logging ----
// Every meaningful line goes to the terminal AND (when a background job is active) to the
// search_logs table, so the UI can show a live log identical to the server log. Assumes one
// search at a time (true for this single-user tool); the active job/client are set at the
// start of searchForCompanies.
// Overall safety cap: abort the whole search (all in-flight Anthropic calls) after this long,
// so a stalled web_search can never hang the job indefinitely. Generous enough for normal
// variance (a full run is ~15 min); only catches genuine hangs.
const SEARCH_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (covers steps 1+2+3)

const rawConsoleLog = console.log.bind(console);
let activeJobId: number | null = null;
let activeSupabase: SupabaseClient | null = null;
let activeSignal: AbortSignal | null = null;
// Serializes log inserts so rows reach the DB in call order (monotonic created_at) — otherwise the
// fire-and-forget inserts race and the UI log (ordered by created_at) shows lines out of sequence.
let logChain: Promise<void> = Promise.resolve();

function emit(msg: string) {
  rawConsoleLog(msg);
  if (activeJobId != null && activeSupabase) {
    const jobId = activeJobId;
    const supabase = activeSupabase;
    const message = msg.replace(/^\[search\]\s*/, "");
    // Queue behind the previous insert; stays fire-and-forget for the caller, and a failed insert
    // never breaks the ones after it.
    logChain = logChain.then(() =>
      supabase.from("search_logs").insert({ job_id: jobId, message }).then(() => {}, () => {})
    );
  }
}

// Logs, per page, whether web_fetch actually retrieved the URL or failed (and the error code).
// Pairs each result to its requested URL via tool_use_id so failures still name the page.
function logFetchOutcome(response: Anthropic.Message): void {
  const urlById = new Map<string, string>();
  for (const b of response.content) {
    if (b.type === "server_tool_use" && b.name === "web_fetch") {
      const url = (b.input as { url?: string })?.url;
      if (url) urlById.set(b.id, url);
    }
  }
  let ok = 0;
  let failed = 0;
  for (const b of response.content) {
    if (b.type !== "web_fetch_tool_result") continue;
    const url = urlById.get(b.tool_use_id) ?? "(unknown URL)";
    if (b.content.type === "web_fetch_result") {
      ok++;
      emit(`[search] Step 1 (fetch)   ✓ retrieved ${url}`);
    } else {
      failed++;
      emit(`[search] Step 1 (fetch)   ✗ FAILED ${url} — ${b.content.error_code}`);
    }
  }
  emit(`[search] Step 1 (fetch): ${ok}/${ok + failed} page fetch(es) succeeded`);
}

// Logs how many web_search calls the model actually ran, and any that errored.
function logSearchOutcome(response: Anthropic.Message): void {
  let ran = 0;
  let errored = 0;
  for (const b of response.content) {
    if (b.type !== "web_search_tool_result") continue;
    ran++;
    if (!Array.isArray(b.content)) errored++;
  }
  emit(`[search] Step 1 (web_search): ran ${ran} search(es)${errored ? `, ${errored} errored` : ""}`);
}

// ---- Step 1: Discovery ----
// Searches trade media sources using predefined search strings and extracts company names.

// A soft region steer for Step 1 discovery. Region here loosely means where the company is based or
// primarily active (usually two sides of the same coin in this case). There is NO code-level region
// filter — off-region companies that turn up anyway are kept and queued (and scored against the
// matching ICP in Step 3).
function marketSteer(targetMarket?: "eu" | "us" | "both"): string {
  if (targetMarket === "eu") return `\n- Focus on companies in Europe (EU / UK) — based in or primarily active in the region.`;
  if (targetMarket === "us") return `\n- Focus on companies in the United States — based in or primarily active there.`;
  return "";
}

async function discoverCompanies(
  client: Anthropic,
  sources: Source[],
  knownNames: string[] = [],
  concepts?: string[],
  targetMarket?: "eu" | "us" | "both"
): Promise<DiscoveredCompany[]> {
  // "web site" sources are searched via web_search (below); "web page" sources are read once via
  // web_fetch (discoverViaFetch). Missing type defaults to "web site".
  const siteSources = sources.filter((s) => (s.type ?? "web site") === "web site");
  const pageSources = sources.filter((s) => (s.type ?? "web site") === "web page");
  const youtubeSources = sources.filter((s) => s.type === "youtube");
  // Effective search terms: caller-selected, else the configured defaults. Shared by the web_search
  // path and the YouTube path.
  const searchConcepts =
    concepts && concepts.length > 0
      ? concepts
      : (sourcesConfig as { search_concepts?: string[] }).search_concepts ?? [];
  // Page fetch + YouTube run regardless; the web_search path below runs only when there are website
  // sources. If there are none, do just page + YouTube and return.
  if (siteSources.length === 0) {
    emit(`[search] Step 1: no website sources selected — skipping web_search`);
    const pageOnly = pageSources.length > 0 ? await discoverViaFetch(client, pageSources, knownNames, targetMarket) : [];
    const ytOnly = youtubeSources.length > 0 ? await discoverViaYouTube(client, youtubeSources, searchConcepts, knownNames, targetMarket) : [];
    return [...pageOnly, ...ytOnly];
  }
  const sourceList = siteSources
    .map((s) => `- ${s.name} (${s.url})${s.note ? ` — NOTE: ${s.note}` : ""}`)
    .join("\n");
  // Build the narrow queries from concepts × sources: one concept per query, as an explicit numbered
  // list so the model runs them as separate searches rather than combining them.
  emit(`[search] Step 1: using ${searchConcepts.length} search terms: ${searchConcepts.join(", ")}`);
  // Baseline queries in English; the model adapts language per source as it reads (see the search
  // rules below) — it re-searches non-English sources in their own language once it sees the content.
  const allQueries = siteSources.flatMap((s) => searchConcepts.map((c) => `${s.search_prefix} ${c}`));
  const queryList = allQueries.map((q, i) => `${i + 1}. "${q}"`).join("\n");
  emit(`[search] Step 1 technique: web_search — ${siteSources.length} website source(s) × ${searchConcepts.length} term(s) = ${allQueries.length} queries`);
  emit(`[search] Step 1 queries:\n${queryList}`);
  const countInstruction =
    knownNames.length > 0
      ? `IMPORTANT — count only NEW companies toward your target of 10:
- The list below shows companies we ALREADY have. Never return them; they count as ZERO.
- Only companies NOT on the list count. Example: 3 known + 5 new = a count of 5, not 8.
- Aim for up to 10 new companies. If fewer exist, return what you found — do not repeat searches to reach 10.

Companies we already have (do NOT return these):
${knownNames.join(", ")}`
      : `IMPORTANT: Aim for up to 10 companies. If fewer exist, return what you found — do not repeat searches just to reach 10.`;

  const stream = await client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 32000,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }],
    messages: [
      {
        role: "user",
        content: `You are finding supplement companies that have recently launched or are active in the brain health, cognitive performance, or longevity supplement space in Europe.

Focus on content from these trade media sources:
${sourceList}

Run the searches below. IMPORTANT search rules:
- Run each query as a SEPARATE, narrow search — one query at a time. Do NOT combine several queries into one search (narrow single-concept searches return far better company round-ups than broad stacked ones).
- Cover ALL of the sources — do not spend your whole search budget on a single source.
- Adapt to each source's language: don't assume English. Judge a source's language from what its results actually contain (and the site itself). If a source is in another language (e.g. French, German, Italian), translate the search term into that language and search that source again in its own language — that surfaces companies an English query would miss. You still read and understand results in any language.
- You have a budget of up to 12 searches. You may stop early once you have 10 new companies (see the counting rule below).

Searches to run:
${queryList}

For each company or brand you find that is active in brain health, cognitive performance, nootropics, memory support, longevity, or premium supplementation:
- Extract the company or brand name
- Record which source or publication mentioned them

${countInstruction}

Important rules:
- Extract COMPANY names, not product names. If an article says "Brand X launches new omega-3 supplement", extract "Brand X".
- EXCLUDE Aker BioMarine, Lysoveta, and Superba — these are ingredient suppliers, not target customers.
- Always use the shortest canonical company name — omit legal suffixes (GmbH, Ltd, AG, Inc, BV, etc.) and parenthetical additions. Write "Doppelherz", not "Doppelherz GmbH" or "Doppelherz (Queisser Pharma)".
- If the same company appears in multiple sources, include it only once (keep the first source).
- Only include companies that actually sell finished supplement products to consumers or through B2B channels — not raw ingredient suppliers or distributors with no own brand.${marketSteer(targetMarket)}

Return ONLY a raw JSON array, no markdown or explanation:
[{"name":"Company Name","source_name":"NutraIngredients Europe"}]`,
      },
    ],
  }, { signal: activeSignal ?? undefined });

  const response = await stream.finalMessage();
  logSearchOutcome(response);

  // --- DIAGNOSTIC: see exactly what the model returned before parsing ---
  const rawBlock = response.content.findLast((b) => b.type === "text");
  const rawText = rawBlock && rawBlock.type === "text" ? rawBlock.text : "(no text block)";
  emit(`[search] Step 1 stop_reason: ${response.stop_reason}`);
  emit(`[search] Step 1 RAW RESPONSE (${rawText.length} chars):\n${rawText.slice(0, 4000)}`);
  // --- END DIAGNOSTIC ---

  const discovered = parseJsonArray<DiscoveredCompany>(response);
  emit(
    `[search] Step 1: discovered ${discovered.length} companies from trade media search`
  );
  emit(
    `[search] Step 1 tokens: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output`
  );
  const pageDiscovered = pageSources.length > 0 ? await discoverViaFetch(client, pageSources, knownNames, targetMarket) : [];
  const ytDiscovered = youtubeSources.length > 0 ? await discoverViaYouTube(client, youtubeSources, searchConcepts, knownNames, targetMarket) : [];
  return [...discovered, ...pageDiscovered, ...ytDiscovered];
}

// Step 1 (YouTube path): search YouTube (Data API v3) for each concept, gather the top videos'
// titles + descriptions, and let Claude extract finished-brand supplement companies. Uses the
// official API (public metadata only). The key is server-only: process.env.YOUTUBE_API_KEY.
// Experimental/complementary source — noisier and US/English-leaning; the ICP step filters later.
async function discoverViaYouTube(
  client: Anthropic,
  youtubeSources: Source[],
  concepts: string[],
  knownNames: string[] = [],
  targetMarket?: "eu" | "us" | "both"
): Promise<DiscoveredCompany[]> {
  // Defensive: trim whitespace and strip accidental surrounding quotes from the env value.
  const apiKey = process.env.YOUTUBE_API_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!apiKey) {
    emit(`[search] Step 1 (youtube): skipped — YOUTUBE_API_KEY not set on the server`);
    return [];
  }
  if (concepts.length === 0) {
    emit(`[search] Step 1 (youtube): skipped — no search terms`);
    return [];
  }

  const REGION = "GB";   // nudge toward European/English content (not a hard filter)
  const LANG = "en";
  const PER_TERM = 8;    // videos fetched per term
  // A youtube source may carry a search_prefix to bias the query (e.g. "supplement review").
  const prefix = youtubeSources.map((s) => s.search_prefix?.trim()).find(Boolean) ?? "";
  const sourceName = youtubeSources[0]?.name ?? "YouTube";
  emit(`[search] Step 1 (youtube) technique: YouTube search on ${concepts.length} term(s)${prefix ? ` (bias: "${prefix}")` : ""}`);

  // 1) search.list per concept → collect video ids
  const videoIds: string[] = [];
  for (const concept of concepts) {
    const q = `${prefix} ${concept}`.trim();
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${PER_TERM}&regionCode=${REGION}&relevanceLanguage=${LANG}&q=${encodeURIComponent(q)}&key=${apiKey}`;
    try {
      const res = await fetch(searchUrl, { signal: activeSignal ?? undefined });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const reason = (() => { try { return (JSON.parse(body) as { error?: { message?: string; errors?: { reason?: string }[] } }).error; } catch { return null; } })();
        emit(`[search] Step 1 (youtube)   ✗ search "${q}" failed — HTTP ${res.status}: ${reason?.message ?? body.slice(0, 300)}${reason?.errors?.[0]?.reason ? ` [${reason.errors[0].reason}]` : ""}`);
        continue;
      }
      const data = (await res.json()) as { items?: { id?: { videoId?: string } }[] };
      const ids = (data.items ?? []).map((it) => it.id?.videoId).filter((v): v is string => !!v);
      videoIds.push(...ids);
      emit(`[search] Step 1 (youtube)   ✓ "${q}" → ${ids.length} videos`);
    } catch (err) {
      emit(`[search] Step 1 (youtube)   ✗ search "${q}" errored — ${(err as { message?: string })?.message ?? "unknown"}`);
    }
  }

  const uniqueIds = Array.from(new Set(videoIds)).slice(0, 50); // videos.list accepts up to 50 ids
  if (uniqueIds.length === 0) {
    emit(`[search] Step 1 (youtube): no videos found`);
    return [];
  }

  // 2) videos.list (1 quota unit) → full titles + descriptions
  let videosText = "";
  try {
    const vidUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${uniqueIds.join(",")}&key=${apiKey}`;
    const res = await fetch(vidUrl, { signal: activeSignal ?? undefined });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      emit(`[search] Step 1 (youtube): videos.list failed — HTTP ${res.status}: ${body.slice(0, 300)}`);
      return [];
    }
    const data = (await res.json()) as { items?: { snippet?: { title?: string; description?: string; channelTitle?: string } }[] };
    videosText = (data.items ?? [])
      .map((it) => {
        const s = it.snippet ?? {};
        return `TITLE: ${s.title ?? ""}\nCHANNEL: ${s.channelTitle ?? ""}\nDESCRIPTION: ${(s.description ?? "").slice(0, 1500)}`;
      })
      .join("\n\n---\n\n");
  } catch (err) {
    emit(`[search] Step 1 (youtube): videos.list errored — ${(err as { message?: string })?.message ?? "unknown"}`);
    return [];
  }
  emit(`[search] Step 1 (youtube): read ${uniqueIds.length} video(s), extracting brands…`);

  const knownBlock =
    knownNames.length > 0
      ? `\n\nCompanies we ALREADY have (do NOT return these):\n${knownNames.join(", ")}`
      : "";

  const stream = await client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `Below are titles and descriptions of YouTube videos about supplements. Extract the supplement COMPANY or BRAND names mentioned (brands being reviewed, compared, or promoted).

Important rules:
- Extract COMPANY or BRAND names, not product names and not the video creators/influencers.
- EXCLUDE Aker BioMarine, Lysoveta, and Superba.
- Use the shortest canonical company name — omit legal suffixes (GmbH, Ltd, Inc, etc.) and parentheticals.
- Only finished-brand supplement companies — not ingredient suppliers, not retailers (Amazon, iHerb), not pure distributors.
- Ignore the YouTube channel/creator name itself unless the channel IS a supplement brand.${marketSteer(targetMarket)}${knownBlock}

Videos:
${videosText}

Return ONLY a raw JSON array, no markdown:
[{"name":"Company Name","source_name":"${sourceName}"}]`,
      },
    ],
  }, { signal: activeSignal ?? undefined });

  const response = await stream.finalMessage();
  const discovered = parseJsonArray<DiscoveredCompany>(response);
  emit(`[search] Step 1 (youtube): discovered ${discovered.length} companies`);
  emit(`[search] Step 1 (youtube) tokens: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output`);
  return discovered;
}

// Step 1 (page path): read specific "web page" sources once via web_fetch and extract company
// names. web_fetch only retrieves URLs already present in the conversation, so every page URL is
// listed in the prompt. Best for a fixed brand list (e.g. a "best supplement brands 2026" round-up)
// — re-running finds nothing new after the first harvest (dedup drops the repeats).
async function discoverViaFetch(
  client: Anthropic,
  pageSources: Source[],
  knownNames: string[] = [],
  targetMarket?: "eu" | "us" | "both"
): Promise<DiscoveredCompany[]> {
  const pageList = pageSources
    .map((s) => `- Source name: "${s.name}"\n  URL: ${s.url}${s.note ? `\n  NOTE: ${s.note}` : ""}`)
    .join("\n");
  emit(`[search] Step 1 (fetch) technique: web_fetch on ${pageSources.length} page(s) — ${pageSources.map((s) => s.url).join(", ")}`);

  const knownBlock =
    knownNames.length > 0
      ? `\n\nCompanies we ALREADY have (do NOT return these):\n${knownNames.join(", ")}`
      : "";

  const stream = await client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    tools: [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: pageSources.length + 2 }],
    messages: [
      {
        role: "user",
        content: `You are finding supplement companies active in brain health, cognitive performance, nootropics, memory support, longevity, or premium supplementation.

Fetch EACH of the pages below (use the web_fetch tool on every URL) and extract the company or brand names listed or discussed on that page.

Pages to read:
${pageList}

Important rules:
- Extract COMPANY or BRAND names, not product names. If it says "Brand X's omega-3", extract "Brand X".
- EXCLUDE Aker BioMarine, Lysoveta, and Superba — these are ingredient suppliers, not target customers.
- Always use the shortest canonical company name — omit legal suffixes (GmbH, Ltd, AG, Inc, BV, etc.) and parenthetical additions.
- Only include companies that actually sell finished supplement products under their own brand — not raw ingredient suppliers or pure distributors.
- Set "source_name" to the exact Source name given for the page the company came from.
- If a page cannot be fetched, skip it and continue with the others.${marketSteer(targetMarket)}${knownBlock}

Return ONLY a raw JSON array, no markdown or explanation:
[{"name":"Company Name","source_name":"${pageSources[0]?.name ?? "Source name"}"}]`,
      },
    ],
  }, { signal: activeSignal ?? undefined });

  const response = await stream.finalMessage();
  logFetchOutcome(response);
  const rawBlock = response.content.findLast((b) => b.type === "text");
  const rawText = rawBlock && rawBlock.type === "text" ? rawBlock.text : "(no text block)";
  emit(`[search] Step 1 (fetch) stop_reason: ${response.stop_reason}`);
  emit(`[search] Step 1 (fetch) RAW RESPONSE (${rawText.length} chars):\n${rawText.slice(0, 2000)}`);

  const discovered = parseJsonArray<DiscoveredCompany>(response);
  emit(`[search] Step 1 (fetch): discovered ${discovered.length} companies from ${pageSources.length} page(s)`);
  emit(`[search] Step 1 (fetch) tokens: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output`);
  return discovered;
}

// ---- Step 2: Enrichment ----
// One API call per company; runs in batches of `concurrency` to avoid rate limits.
// Model: the global CLAUDE_MODEL (lib/models.ts) by default; sources.json may set `enrichment_model`
// to override JUST this step. Note: enrichment uses web_search, so any override must be a model that
// supports web_search_20260209 (Haiku does not) — see lib/models.ts.

async function enrichCompany(
  client: Anthropic,
  company: DiscoveredCompany,
  model: string
): Promise<EnrichedCompany | null> {
  emit(`[search] Step 2 [${company.name}] starting...`);
  try {
  const stream = await client.messages.stream({
    model,
    max_tokens: 8000,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [
      {
        role: "user",
        content: `Research the supplement company "${company.name}" (found via ${company.source_name}). Find their official website and gather exactly these fields:

- website_url: their official website URL
- product_focus: what supplements they sell (1 sentence)
- omega3_or_krill: do they sell omega-3 or krill products? Start with "yes" or "no", then add brief detail.
- self_presentation: how the company describes itself on their own website — what narrative, claims and language do they use? (e.g. science-backed, clinical evidence, natural wellness, traditional heritage) 1-2 sentences.
- price_tier: the highest price point of any brain health, omega-3, or flagship product, and whether that is budget / mid-range / premium vs. the category. Look for their most premium SKU — the goal is to understand the ceiling of what they charge, not the average. If you cannot find a specific price anywhere, write exactly the string "NOT_FOUND".
- price_found: true if you found a real price, false if not
- price_currency: the currency of the price as a 3-letter code (GBP, EUR, USD, etc.). Write null if price_found is false.
- european_markets: which European countries they sell in
- distribution_channels: how they sell (pharmacy, online DTC, grocery retail, specialist retail, etc.)

The company's own website and coverage may be in a non-English language (e.g. French, German, Italian) — read and use sources in ANY language, and write the field values in English.

Be efficient — prioritize speed over exhaustiveness: Use as few web searches as possible (ideally 1-2). If a specific field is not easy to find, write "NOT_FOUND" (for price) or a brief best-effort answer and move on — do NOT keep searching repeatedly for the same detail. It is fine to return partial information; do not exhaust your search budget chasing minor fields.

Return ONLY a raw JSON object, no markdown:
{"website_url":"...","product_focus":"...","omega3_or_krill":"...","self_presentation":"...","price_tier":"...","price_found":true,"price_currency":"GBP","european_markets":"...","distribution_channels":"..."}`,
      },
    ],
  }, { signal: activeSignal ?? undefined });

  const response = await stream.finalMessage();
  const searchCount = response.usage.server_tool_use?.web_search_requests ?? "?";
  emit(
    `[search] Step 2 [${company.name}] done: ${searchCount} web searches, ${response.usage.input_tokens}in/${response.usage.output_tokens}out tokens`
  );
  const data = parseJsonObject(response);
  if (!data) return null;

  return {
    name: company.name,
    source_name: company.source_name,
    website_url: (data.website_url as string) ?? "",
    product_focus: (data.product_focus as string) ?? "",
    omega3_or_krill: (data.omega3_or_krill as string) ?? "",
    self_presentation: (data.self_presentation as string) ?? "",
    price_tier: (data.price_tier as string) ?? "NOT_FOUND",
    price_found: (data.price_found as boolean) ?? false,
    price_currency: (data.price_currency as string | null) ?? null,
    european_markets: (data.european_markets as string) ?? "",
    distribution_channels: (data.distribution_channels as string) ?? "",
  };
  } catch (err) {
    // Aborted by the overall timeout, or any other failure — treat this company as failed
    // (returns null). It stays pending and is retried on the next search.
    emit(`[search] Step 2 [${company.name}] aborted/failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function enrichAll(
  client: Anthropic,
  companies: DiscoveredCompany[],
  model: string,
  concurrency = 5
): Promise<EnrichedCompany[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch all cached entries for these companies in one query
  const names = companies.map((c) => c.name);
  const { data: cached } = await supabase
    .from("companies")
    .select("name, enriched_data, enriched_at")
    .in("name", names)
    .not("enriched_data", "is", null);

  const cacheMap = new Map<string, EnrichedCompany>();
  for (const row of cached ?? []) {
    cacheMap.set(row.name, row.enriched_data as EnrichedCompany);
  }

  const hits = companies.filter((c) => cacheMap.has(c.name));
  const misses = companies.filter((c) => !cacheMap.has(c.name));

  emit(`[search] Step 2: ${hits.length} from cache, ${misses.length} need enrichment`);

  // Enrich cache misses in batches. Each company is saved to the DB the moment its
  // enrichment completes — so a company that hangs can never take down the work of the
  // others. On a later search the saved ones become cache hits (no re-enrichment).
  const saveOne = async (c: DiscoveredCompany): Promise<EnrichedCompany | null> => {
    const result = await enrichCompany(client, c, model);
    if (result) {
      const { error } = await supabase.from("companies").upsert(
        {
          name: result.name,
          source_name: result.source_name,
          enriched_data: result,
          enriched_at: new Date().toISOString(),
          rejected: false,
        },
        { onConflict: "name" }
      );
      if (error) emit(`[search] Step 2 [${result.name}] save failed: ${error.message}`);
      else emit(`[search] Step 2 [${result.name}] saved to DB`);
    }
    return result;
  };

  const freshlyEnriched: EnrichedCompany[] = [];
  for (let i = 0; i < misses.length; i += concurrency) {
    const batch = misses.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(saveOne));
    freshlyEnriched.push(...batchResults.filter((c): c is EnrichedCompany => c !== null));
    emit(
      `[search] Step 2: ${Math.min(i + concurrency, misses.length)}/${misses.length} freshly enriched`
    );
  }

  // Return cached + freshly enriched, preserving original order
  return companies
    .map((c) => cacheMap.get(c.name) ?? freshlyEnriched.find((e) => e.name === c.name) ?? null)
    .filter((c): c is EnrichedCompany => c !== null);
}

// ---- Step 3: prompt builder ----
// Builds the manual evaluation prompt — no API call. User pastes this into Claude Chat.

// Reads the ICP documents from the DB (UI-editable, migration 014), falling back to the config files
// per market when the DB has no row for that market — so behaviour is unchanged until someone edits
// from the app, and a DB hiccup never blocks Step 3.
export async function getIcpDocs(supabase: SupabaseClient): Promise<{ eu: string; us: string }> {
  const dir = path.join(process.cwd(), "config");
  const readFile = (name: string) => {
    try { return fs.readFileSync(path.join(dir, name), "utf-8"); } catch { return ""; }
  };
  const fileEu = readFile("icp.md");
  const fileUs = readFile("icp_us.md");
  try {
    const { data, error } = await supabase.from("icp_docs").select("market, content");
    if (error) throw error;
    const map = new Map((data ?? []).map((r: { market: string; content: string }) => [r.market, r.content]));
    const dbEu = (map.get("eu") ?? "").trim();
    const dbUs = (map.get("us") ?? "").trim();
    if (dbEu || dbUs) emit(`[search] ICP: loaded from DB (${dbEu ? "eu" : "eu=file"}, ${dbUs ? "us" : "us=file"})`);
    return { eu: dbEu ? map.get("eu")! : fileEu, us: dbUs ? map.get("us")! : fileUs };
  } catch (err) {
    emit(`[search] ICP: DB read failed — using config files (${err instanceof Error ? err.message : String(err)})`);
    return { eu: fileEu, us: fileUs };
  }
}

export function buildStep3Prompt(companies: EnrichedCompany[], icp: { eu: string; us: string }): string {
  const icpEu = icp.eu;
  const icpUs = icp.us;
  // The US ICP is used only once real content replaces the placeholder — until then, everything is
  // scored against the European ICP (unchanged behaviour), so US companies are never mis-scored
  // against a placeholder. Also gated by US_MARKET_ENABLED: while US support is switched off,
  // everything is scored against the European ICP regardless of the US ICP's content.
  const usReady = US_MARKET_ENABLED && icpUs.trim().length > 0 && !icpUs.includes("US_ICP_PLACEHOLDER");

  const icpBlock = usReady
    ? `You have TWO ICP documents — apply the one that matches each company's primary market.

=== EUROPEAN ICP (use for EU / UK / other European companies; also the default for Global or APAC) ===
${icpEu}

=== US ICP (use ONLY when the company's primary market is the United States) ===
${icpUs}`
    : icpEu;

  const routingNote = usReady
    ? `

IMPORTANT — choosing the ICP: for each company, first decide its primary market from european_markets and distribution_channels. If that market is the United States, evaluate the company against the US ICP; otherwise use the European ICP. Apply the chosen ICP's hard exclusions and scoring.`
    : "";

  return `You are evaluating supplement companies as potential B2B customers for Aker BioMarine's Lysoveta ingredient. Use the ICP document${usReady ? "s" : ""} below to guide your evaluation.

---
${icpBlock}
---${routingNote}

Enriched company data to evaluate:
${JSON.stringify(companies, null, 2)}

Instructions:
1. Apply the hard exclusion rules first. Remove any company that fails them.
2. For each remaining company, calculate the ICP fit score using the formula in the ICP document:
   - Assign points for Region, Customer Pool, Lysoveta Fit, Category Match, and Price
   - If price_found is false: do NOT deduct price points, but note the uncertainty
   - Sum the points and convert to a 1–5 star rating (icp_score)
3. Use the icp_score as a structured starting point, but weigh your qualitative judgment of product fit, self-presentation, and positioning at least as heavily. The score is a guide — not the final decision-maker:
   - Score 5: always include
   - Score 4: include — provide brief justification
   - Score 3: include only if qualitative signals show clear product fit or strong early mover characteristics
   - Score 2: include only with exceptional justification — state explicitly why
   - Score 1: exclude
   A strong score does not guarantee inclusion if product fit is genuinely poor. A weaker score can be overridden by compelling qualitative signals — but this must be explicitly justified in the description.
4. Assign priority_tier: "early_mover", "follower", or "enabler" based on the signals in the ICP document.
5. Write a description of max 2 sentences explaining WHY they fit, which signals drove the classification, and the key factor(s) behind the score. Reference their actual self_presentation, price_tier, and distribution_channels.

Return ONLY a raw JSON array, no markdown. For each company include:
- name, website_url, description, priority_tier, icp_score (as before)
- geography: one of "EU", "UK", "US", "APAC", "Global" — based on european_markets and distribution. Use "EU" if they primarily sell in EU countries. Use "Global" if they sell across multiple regions.
- product_category: one of "Premium/science-driven brand", "Pharma Rx", "Established CHC", "Distributor/enabler" — pick the best fit based on product_focus and self_presentation.
- max_price_eur: the highest single price found for any of their products (their price ceiling), as a NUMBER in the company's ORIGINAL currency — do NOT convert to EUR (the field name is legacy). Use null if price_found is false.
- price_currency: the 3-letter currency code for that price (GBP, EUR, USD, etc.). Use null if price_found is false.

[{"name":"Company Name","website_url":"https://example.com","description":"Why relevant for Lysoveta.","priority_tier":"early_mover","icp_score":4,"geography":"UK","product_category":"Premium/science-driven brand","max_price_eur":69,"price_currency":"GBP"}]`;
}

// ---- Step 3: automatic ICP matching ----
// Runs the SAME evaluation as the manual flow, but via the Anthropic API instead of Claude Chat.
// No web_search — this is pure reasoning over the already-enriched data, so it is cheap and fast.
// Returns the passing companies, or null on any failure (API error, aborted, unparseable JSON) so
// the caller can fall back to the manual paste flow and never lose a finished job.

async function evaluateCompanies(
  client: Anthropic,
  companies: EnrichedCompany[],
  icp: { eu: string; us: string }
): Promise<EvaluatedCompany[] | null> {
  emit(`[search] Step 3: evaluating ${companies.length} companies against the ICP...`);
  try {
    const stream = await client.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        messages: [{ role: "user", content: buildStep3Prompt(companies, icp) }],
      },
      { signal: activeSignal ?? undefined }
    );
    const response = await stream.finalMessage();
    emit(`[search] Step 3 stop_reason: ${response.stop_reason}`);
    emit(
      `[search] Step 3 tokens: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output`
    );

    const textBlock = response.content.findLast((b) => b.type === "text");
    const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const stripped = rawText.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
    const match = stripped.match(/\[[\s\S]*\]/);
    if (!match) {
      emit(`[search] Step 3: no JSON array found in the response`);
      return null;
    }
    const results = JSON.parse(match[0]) as EvaluatedCompany[];
    emit(
      `[search] Step 3: ${results.length} of ${companies.length} companies passed ICP matching`
    );
    return results;
  } catch (err) {
    emit(
      `[search] Step 3 aborted/failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

// ---- Search config (sources + default terms) ----
// Reads the editable configuration from Supabase. Falls back to config/sources.json if the DB
// read fails or returns nothing, so a search is never blocked by a config/DB hiccup.

async function getSearchConfig(
  supabase: SupabaseClient
): Promise<{ sources: Source[]; defaultConcepts: string[] }> {
  try {
    const [{ data: sourceRows, error: srcErr }, { data: termRows, error: termErr }] =
      await Promise.all([
        supabase.from("sources").select("*").eq("active", true).order("id"),
        supabase.from("search_terms").select("term, is_default").eq("active", true).order("id"),
      ]);
    if (srcErr) throw srcErr;
    if (termErr) throw termErr;
    const sources = (sourceRows ?? []) as Source[];
    if (sources.length === 0) throw new Error("no active sources in DB");
    const defaultConcepts = (termRows ?? [])
      .filter((t: { is_default: boolean }) => t.is_default)
      .map((t: { term: string }) => t.term);
    emit(`[search] Config: ${sources.length} sources (from DB); ${defaultConcepts.length} terms flagged as defaults (used only when the user selects none)`);
    return { sources, defaultConcepts };
  } catch (err) {
    emit(`[search] Config: DB read failed — falling back to sources.json (${err instanceof Error ? err.message : String(err)})`);
    return {
      sources: sourcesConfig.sources as Source[],
      defaultConcepts: (sourcesConfig as { search_concepts?: string[] }).search_concepts ?? [],
    };
  }
}

// ---- Main export ----

export async function searchForCompanies(
  jobId: number | null = null,
  step3Mode: "auto" | "manual" = "auto",
  searchConcepts?: string[],
  sourceNames?: string[],
  targetMarket?: "eu" | "us" | "both"
): Promise<{
  enriched: EnrichedCompany[];
  step3Prompt: string;
  results?: EvaluatedCompany[];
  debug: SearchDebug;
  noCompaniesFound?: boolean;
  timedOut?: boolean;
}> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const enrichmentModel =
    (sourcesConfig as { enrichment_model?: string }).enrichment_model ??
    CLAUDE_MODEL;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Route all emit() log lines to this job's search_logs rows (and the terminal).
  activeJobId = jobId;
  activeSupabase = supabase;

  // Overall timeout: after SEARCH_TIMEOUT_MS, abort all in-flight Anthropic calls.
  const timeoutController = new AbortController();
  activeSignal = timeoutController.signal;
  const timeoutTimer = setTimeout(() => {
    emit(`[search] ===== TIMEOUT after ${SEARCH_TIMEOUT_MS / 60000} min — aborting remaining work =====`);
    timeoutController.abort();
  }, SEARCH_TIMEOUT_MS);

  emit(`[search] ===== Search started =====`);

  // Read the editable search config (sources + default terms) from Supabase (falls back to sources.json).
  const { sources, defaultConcepts } = await getSearchConfig(supabase);

  // Writes a human-readable progress line to the search_jobs row (if this run is a background job),
  // so the browser can poll and show what's happening. No-op for direct/local calls (jobId null).
  const reportProgress = async (message: string) => {
    if (jobId == null) return;
    await supabase.from("search_jobs").update({ message, updated_at: new Date().toISOString() }).eq("id", jobId);
  };
  await reportProgress("Starting search…");

  // Reset any companies stuck in "processing" for more than 10 minutes back to "pending".
  // Uses processing_started_at (not discovered_at) so recently-started jobs are never flagged.
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: staleRows } = await supabase
    .from("discovery_queue")
    .select("name")
    .eq("status", "processing")
    .lt("processing_started_at", staleThreshold);

  if (staleRows && staleRows.length > 0) {
    const staleNames = staleRows.map((r: { name: string }) => r.name);
    await supabase
      .from("discovery_queue")
      .update({ status: "pending" })
      .in("name", staleNames);
    emit(`[search] Reset ${staleNames.length} stale "processing" companies back to "pending"`);
  }

  // Check how many companies are already pending in the discovery queue
  const { data: pendingRows, error: queueCountError } = await supabase
    .from("discovery_queue")
    .select("id")
    .eq("status", "pending");

  if (queueCountError) {
    emit(`[search] Could not read discovery_queue: ${queueCountError.message}`);
  }

  const pendingCount = pendingRows?.length ?? 0;
  emit(`[search] discovery_queue: ${pendingCount} pending companies`);

  let step1Discovered = 0;
  let step1Skipped = 0;
  let step1NewToQueue = 0;

  // Only run Step 1 if the queue has fewer than 5 pending companies
  if (pendingCount < 5) {
    emit(`[search] Step 1: queue below threshold — running web search...`);

    // Gather names we already know so Step 1 can skip them and spend its searches on NEW companies.
    // NOTE: if this list grows very large (100+), cap it here (e.g. most recent N) to keep the prompt small.
    const [{ data: knownCompanies }, { data: knownQueue }] = await Promise.all([
      supabase.from("companies").select("name"),
      supabase.from("discovery_queue").select("name"),
    ]);
    const knownNames = Array.from(
      new Set([
        ...(knownCompanies ?? []).map((r: { name: string }) => r.name),
        ...(knownQueue ?? []).map((r: { name: string }) => r.name),
      ])
    );

    // User-selected terms take precedence; otherwise use the DB default terms.
    const conceptsForRun = searchConcepts && searchConcepts.length > 0 ? searchConcepts : defaultConcepts;
    // User-selected sources take precedence; otherwise search every active source.
    const sourcesForRun = sourceNames && sourceNames.length > 0 ? sources.filter((s) => sourceNames.includes(s.name)) : sources;
    emit(`[search] Step 1: using ${sourcesForRun.length} of ${sources.length} sources`);
    const discovered = await discoverCompanies(client, sourcesForRun, knownNames, conceptsForRun, targetMarket);
    step1Discovered = discovered.length;
    // New companies attributed to each source (source_name → count), for the companies_found counter.
    const foundByName = new Map<string, number>();

    if (discovered.length > 0) {
      // Build exclusion set: companies already in DB, rejected, or already in queue
      const [
        { data: existing },
        { data: rejected },
        { data: inQueue },
      ] = await Promise.all([
        supabase.from("companies").select("name"),
        supabase.from("companies").select("name").eq("rejected", true),
        supabase.from("discovery_queue").select("name"),
      ]);

      const excluded = new Set([
        ...(existing ?? []).map((r: { name: string }) => normalizeName(r.name)),
        ...(rejected ?? []).map((r: { name: string }) => normalizeName(r.name)),
        ...(inQueue ?? []).map((r: { name: string }) => normalizeName(r.name)),
      ]);

      const fresh = discovered.filter((c) => !excluded.has(normalizeName(c.name)));
      step1Skipped = discovered.length - fresh.length;

      if (fresh.length > 0) {
        const queueRows = fresh.map((c) => ({
          name: c.name,
          source_name: c.source_name,
          status: "pending",
        }));
        const { error: insertError } = await supabase
          .from("discovery_queue")
          .upsert(queueRows, { onConflict: "name" });

        if (insertError) {
          emit(`[search] Failed to save to discovery_queue: ${insertError.message}`);
        } else {
          step1NewToQueue = fresh.length;
          for (const c of fresh) foundByName.set(c.source_name, (foundByName.get(c.source_name) ?? 0) + 1);
          emit(`[search] Step 1: ${fresh.length} new companies added to queue`);
        }
      } else {
        emit(`[search] Step 1: all ${discovered.length} companies already known — nothing new`);
      }
    }

    // Update per-source performance counters: every source used this run gets +1 used; sources that
    // contributed new companies get +found. Done after the queue insert so found reflects only what
    // was actually added.
    await bumpSourceStats(supabase, sourcesForRun.map((s) => s.name), foundByName);
  } else {
    emit(`[search] Step 1: skipped — queue has ${pendingCount} pending companies`);
  }

  // Pick next 5 pending companies from the queue for Step 2
  const { data: nextBatch, error: batchError } = await supabase
    .from("discovery_queue")
    .select("name, source_name")
    .eq("status", "pending")
    .order("discovered_at", { ascending: true })
    .limit(5);

  if (batchError) {
    emit(`[search] Failed to read from discovery_queue: ${batchError.message}`);
  }

  const toEnrich: DiscoveredCompany[] = (nextBatch ?? []).map((r) => ({
    name: r.name,
    source_name: r.source_name,
  }));

  if (toEnrich.length === 0) {
    clearTimeout(timeoutTimer);
    emit("[search] ===== NO NEW COMPANIES — queue is empty and Step 1 found nothing new =====");
    return {
      enriched: [],
      step3Prompt: "",
      debug: {
        step1_discovered: step1Discovered,
        step1_skipped: step1Skipped,
        step1_new_to_queue: step1NewToQueue,
        queue_pending_before: pendingCount,
        step2_enriched: 0,
        step2_failed: 0,
        enrichment_model: enrichmentModel,
      },
      noCompaniesFound: true,
    };
  }

  // Mark these as "processing" and record when processing started
  const batchNames = toEnrich.map((c) => c.name);
  await supabase
    .from("discovery_queue")
    .update({ status: "processing", processing_started_at: new Date().toISOString() })
    .in("name", batchNames);

  await reportProgress(`Enriching ${toEnrich.length} companies…`);

  let enriched: EnrichedCompany[] = [];
  try {
    emit(
      `[search] Step 2: Enriching ${toEnrich.length} companies (model: ${enrichmentModel}, in batches)...`
    );
    enriched = await enrichAll(client, toEnrich, enrichmentModel);
    const enrichedNames = new Set(enriched.map((c) => c.name));
    const failedNames = batchNames.filter((n) => !enrichedNames.has(n));
    if (failedNames.length > 0) {
      // Reset individual enrichment failures back to "pending" immediately so they don't block the queue
      await supabase.from("discovery_queue").update({ status: "pending" }).in("name", failedNames);
      emit(`[search] Step 2: ${failedNames.length} individual failures reset to pending: ${JSON.stringify(failedNames)}`);
    }
    emit(`[search] Step 2 done: ${enriched.length} enriched, ${failedNames.length} failed`);
  } catch (err) {
    // If Step 2 crashes entirely, reset the batch back to "pending" so next search retries them
    emit(`[search] ===== ERROR in Step 2 — batch reset to pending: ${err instanceof Error ? err.message : String(err)}`);
    await supabase
      .from("discovery_queue")
      .update({ status: "pending" })
      .in("name", batchNames);
    clearTimeout(timeoutTimer);
    throw err;
  }

  const failed = toEnrich.length - enriched.length;
  emit(`[search] ===== Steps 1-2 done: ${enriched.length} enriched, ${failed} failed =====`);

  // Load the ICP once (DB-editable, falls back to the config files) and reuse it for both the
  // manual-paste prompt and the automatic evaluation below.
  const icp = await getIcpDocs(supabase);

  // Build the manual-paste prompt regardless — it doubles as the fallback if automatic Step 3
  // evaluation fails, so a finished (expensive) job is never lost.
  const step3Prompt = buildStep3Prompt(enriched, icp);

  // Step 3: ICP matching. In "auto" mode we run it here via the Anthropic API. In "manual" mode we
  // skip it and the user pastes the prompt into Claude Chat, exactly as before. Runs BEFORE
  // clearTimeout so it is still covered by the overall abort budget.
  let results: EvaluatedCompany[] | undefined;
  if (step3Mode === "auto" && enriched.length > 0) {
    await reportProgress(`Evaluating ${enriched.length} companies against the ICP…`);
    const evaluated = await evaluateCompanies(client, enriched, icp);
    if (evaluated) {
      results = evaluated;
      // Companies enriched in Step 2 but NOT returned by Step 3 are rejected (this mirrors the
      // manual flow's AI-rejection). Setting rejected=true preserves enriched_data.
      const passed = new Set(evaluated.map((c) => c.name));
      const aiRejected = enriched.filter((c) => !passed.has(c.name)).map((c) => c.name);
      if (aiRejected.length > 0) {
        await supabase.from("companies").update({ rejected: true }).in("name", aiRejected);
        emit(`[search] Step 3: ${aiRejected.length} companies rejected by ICP matching`);
      }
    } else {
      emit(`[search] Step 3: automatic evaluation failed — falling back to manual paste`);
    }
  }

  clearTimeout(timeoutTimer);
  emit(`[search] ===== DONE =====`);

  return {
    enriched,
    step3Prompt,
    results,
    debug: {
      step1_discovered: step1Discovered,
      step1_skipped: step1Skipped,
      step1_new_to_queue: step1NewToQueue,
      queue_pending_before: pendingCount,
      step2_enriched: enriched.length,
      step2_failed: failed,
      enrichment_model: enrichmentModel,
    },
    timedOut: timeoutController.signal.aborted,
  };
}
