import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import sourcesConfig from "@/config/sources.json";


// ---- Types ----

type Source = {
  name: string;
  url: string;
  queries: string[];
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

// ---- Step 1: Discovery ----
// Searches trade media sources using predefined search strings and extracts company names.

async function discoverCompanies(
  client: Anthropic,
  sources: Source[],
  knownNames: string[] = []
): Promise<DiscoveredCompany[]> {
  const sourceList = sources
    .map((s) => `- ${s.name} (${s.url})${s.note ? ` — NOTE: ${s.note}` : ""}`)
    .join("\n");
  // Each source's queries are narrow (one concept each). Present them as an explicit,
  // numbered list so the model runs them as separate searches rather than combining them.
  const allQueries = sources.flatMap((s) => s.queries);
  const queryList = allQueries.map((q, i) => `${i + 1}. "${q}"`).join("\n");
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
    model: "claude-sonnet-5",
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
- Only include companies that actually sell finished supplement products to consumers or through B2B channels — not raw ingredient suppliers or distributors with no own brand.

Return ONLY a raw JSON array, no markdown or explanation:
[{"name":"Company Name","source_name":"NutraIngredients Europe"}]`,
      },
    ],
  });

  const response = await stream.finalMessage();

  // --- DIAGNOSTIC: see exactly what the model returned before parsing ---
  const rawBlock = response.content.findLast((b) => b.type === "text");
  const rawText = rawBlock && rawBlock.type === "text" ? rawBlock.text : "(no text block)";
  console.log(`[search] Step 1 stop_reason: ${response.stop_reason}`);
  console.log(`[search] Step 1 RAW RESPONSE (${rawText.length} chars):\n${rawText.slice(0, 4000)}`);
  // --- END DIAGNOSTIC ---

  const discovered = parseJsonArray<DiscoveredCompany>(response);
  console.log(
    `[search] Step 1: discovered ${discovered.length} companies from trade media search`
  );
  console.log(
    `[search] Step 1 tokens: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output`
  );
  return discovered;
}

// ---- Step 2: Enrichment ----
// One API call per company; runs in batches of `concurrency` to avoid rate limits.
// Model is configurable — switch to claude-haiku-4-5 in sources.json to reduce cost.

async function enrichCompany(
  client: Anthropic,
  company: DiscoveredCompany,
  model: string
): Promise<EnrichedCompany | null> {
  console.log(`[search] Step 2 [${company.name}] starter...`);
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

Be efficient — prioritize speed over exhaustiveness: Use as few web searches as possible (ideally 1-2). If a specific field is not easy to find, write "NOT_FOUND" (for price) or a brief best-effort answer and move on — do NOT keep searching repeatedly for the same detail. It is fine to return partial information; do not exhaust your search budget chasing minor fields.

Return ONLY a raw JSON object, no markdown:
{"website_url":"...","product_focus":"...","omega3_or_krill":"...","self_presentation":"...","price_tier":"...","price_found":true,"price_currency":"GBP","european_markets":"...","distribution_channels":"..."}`,
      },
    ],
  });

  const response = await stream.finalMessage();
  const searchCount = response.usage.server_tool_use?.web_search_requests ?? "?";
  console.log(
    `[search] Step 2 [${company.name}] ferdig: ${searchCount} web-søk, ${response.usage.input_tokens}in/${response.usage.output_tokens}out tokens`
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

  console.log(`[search] Step 2: ${hits.length} from cache, ${misses.length} need enrichment`);

  // Enrich cache misses in batches. Each company is saved to the DB the moment its
  // enrichment completes — so a company that hangs can never take down the work of the
  // others. On a later search the saved ones become cache hits (no re-enrichment).
  const saveOne = async (c: DiscoveredCompany): Promise<EnrichedCompany | null> => {
    const result = await enrichCompany(client, c, model);
    if (result) {
      const { error } = await supabase.from("companies").upsert(
        {
          name: result.name,
          enriched_data: result,
          enriched_at: new Date().toISOString(),
          rejected: false,
        },
        { onConflict: "name" }
      );
      if (error) console.warn(`[search] Step 2 [${result.name}] lagring feilet:`, error.message);
      else console.log(`[search] Step 2 [${result.name}] lagret i DB`);
    }
    return result;
  };

  const freshlyEnriched: EnrichedCompany[] = [];
  for (let i = 0; i < misses.length; i += concurrency) {
    const batch = misses.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(saveOne));
    freshlyEnriched.push(...batchResults.filter((c): c is EnrichedCompany => c !== null));
    console.log(
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

export function buildStep3Prompt(companies: EnrichedCompany[]): string {
  const icpContent = fs.readFileSync(
    path.join(process.cwd(), "config", "icp.md"),
    "utf-8"
  );

  return `You are evaluating supplement companies as potential B2B customers for Aker BioMarine's Lysoveta ingredient. Use the ICP document below to guide your evaluation.

---
${icpContent}
---

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

// ---- Main export ----

export async function searchForCompanies(): Promise<{
  enriched: EnrichedCompany[];
  step3Prompt: string;
  debug: SearchDebug;
  noCompaniesFound?: boolean;
}> {
  console.log(`[search] ===== Søk startet =====`);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const enrichmentModel =
    (sourcesConfig as { enrichment_model?: string }).enrichment_model ??
    "claude-sonnet-5";
  const sources = sourcesConfig.sources as Source[];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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
    console.log(`[search] Reset ${staleNames.length} stale "processing" companies back to "pending"`);
  }

  // Check how many companies are already pending in the discovery queue
  const { data: pendingRows, error: queueCountError } = await supabase
    .from("discovery_queue")
    .select("id")
    .eq("status", "pending");

  if (queueCountError) {
    console.warn("[search] Could not read discovery_queue:", queueCountError.message);
  }

  const pendingCount = pendingRows?.length ?? 0;
  console.log(`[search] discovery_queue: ${pendingCount} pending companies`);

  let step1Discovered = 0;
  let step1Skipped = 0;
  let step1NewToQueue = 0;

  // Only run Step 1 if the queue has fewer than 5 pending companies
  if (pendingCount < 5) {
    console.log(`[search] Step 1: queue below threshold — running web search...`);

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

    const discovered = await discoverCompanies(client, sources, knownNames);
    step1Discovered = discovered.length;

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
          console.warn("[search] Failed to save to discovery_queue:", insertError.message);
        } else {
          step1NewToQueue = fresh.length;
          console.log(`[search] Step 1: ${fresh.length} new companies added to queue`);
        }
      } else {
        console.log(`[search] Step 1: all ${discovered.length} companies already known — nothing new`);
      }
    }
  } else {
    console.log(`[search] Step 1: skipped — queue has ${pendingCount} pending companies`);
  }

  // Pick next 5 pending companies from the queue for Step 2
  const { data: nextBatch, error: batchError } = await supabase
    .from("discovery_queue")
    .select("name, source_name")
    .eq("status", "pending")
    .order("discovered_at", { ascending: true })
    .limit(5);

  if (batchError) {
    console.warn("[search] Failed to read from discovery_queue:", batchError.message);
  }

  const toEnrich: DiscoveredCompany[] = (nextBatch ?? []).map((r) => ({
    name: r.name,
    source_name: r.source_name,
  }));

  if (toEnrich.length === 0) {
    console.warn("[search] ===== INGEN NYE SELSKAPER — køen er tom og steg 1 fant ingenting nytt =====");
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

  let enriched: EnrichedCompany[] = [];
  try {
    console.log(
      `[search] Step 2: Enriching ${toEnrich.length} companies (model: ${enrichmentModel}, in batches)...`
    );
    enriched = await enrichAll(client, toEnrich, enrichmentModel);
    const enrichedNames = new Set(enriched.map((c) => c.name));
    const failedNames = batchNames.filter((n) => !enrichedNames.has(n));
    if (failedNames.length > 0) {
      // Reset individual enrichment failures back to "pending" immediately so they don't block the queue
      await supabase.from("discovery_queue").update({ status: "pending" }).in("name", failedNames);
      console.warn(`[search] Step 2: ${failedNames.length} individual failures reset to pending:`, failedNames);
    }
    console.log(`[search] Step 2 done: ${enriched.length} enriched, ${failedNames.length} failed`);
  } catch (err) {
    // If Step 2 crashes entirely, reset the batch back to "pending" so next search retries them
    console.error("[search] ===== FEIL i steg 2 — batchen settes tilbake til pending:", err instanceof Error ? err.message : err);
    await supabase
      .from("discovery_queue")
      .update({ status: "pending" })
      .in("name", batchNames);
    throw err;
  }

  const failed = toEnrich.length - enriched.length;
  console.log(`[search] ===== FERDIG: ${enriched.length} enrichet, ${failed} feilet =====`);

  // Step 3 is manual — build the prompt and return enriched data for the user to paste into Claude Chat
  const step3Prompt = buildStep3Prompt(enriched);

  return {
    enriched,
    step3Prompt,
    debug: {
      step1_discovered: step1Discovered,
      step1_skipped: step1Skipped,
      step1_new_to_queue: step1NewToQueue,
      queue_pending_before: pendingCount,
      step2_enriched: enriched.length,
      step2_failed: failed,
      enrichment_model: enrichmentModel,
    },
  };
}
