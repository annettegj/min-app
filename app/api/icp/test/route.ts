import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL } from "@/lib/models";
import { ICP_TEST_COMPANIES_KEY, type IcpTestExample } from "@/lib/icpTest";

// Optional "test on example companies" for an ICP draft. Scores a handful of already-enriched
// companies from the DB against the CURRENT editor draft (not the saved ICP), and returns EVERY
// company with its score + whether it would be included, so the user sees the full effect (including
// exclusions), before or after the AI review. Runs on the worker (needs the Anthropic key). Read-only:
// it never writes anything. CORS like /api/search/start.
const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

type TestRow = {
  name: string;
  icp_score: number;
  priority_tier: string;
  geography: string;
  product_category: string;
  included: boolean;
  reason: string;
};

export async function POST(request: Request) {
  let content = "";
  let market: "eu" | "us" = "eu";
  try {
    const body = await request.json();
    content = typeof body?.content === "string" ? body.content : "";
    if (body?.market === "us") market = "us";
  } catch {
    /* handled below */
  }

  if (!content.trim()) {
    return NextResponse.json({ error: "The ICP text is empty." }, { status: 400, headers: corsHeaders });
  }

  // Build the example set. Preferred: the user-configured fixed list (app_settings) with an expected
  // category per company. Fallback (nothing configured yet): a dynamic mix of recent added + rejected.
  let examples: Record<string, unknown>[] = [];
  const expectedByName = new Map<string, string>();
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    let configured: IcpTestExample[] = [];
    try {
      const { data: setting } = await supabase.from("app_settings").select("value").eq("key", ICP_TEST_COMPANIES_KEY).maybeSingle();
      if (setting?.value) {
        const parsed = JSON.parse(setting.value);
        if (Array.isArray(parsed)) configured = parsed.filter((e) => e && typeof e.name === "string");
      }
    } catch { /* ignore, treat as unconfigured */ }

    if (configured.length > 0) {
      const names = configured.map((e) => e.name);
      configured.forEach((e) => expectedByName.set(e.name, e.expected ?? ""));
      const { data } = await supabase.from("companies").select("name, enriched_data").in("name", names).not("enriched_data", "is", null);
      // Preserve the configured order.
      const byName = new Map((data ?? []).map((r) => [r.name as string, r.enriched_data as Record<string, unknown>]));
      examples = names.map((n) => byName.get(n)).filter((d): d is Record<string, unknown> => !!d);
    } else {
      const [{ data: added }, { data: rejected }] = await Promise.all([
        supabase.from("companies").select("enriched_data").eq("added", true).not("enriched_data", "is", null).order("enriched_at", { ascending: false }).limit(4),
        supabase.from("companies").select("enriched_data").eq("rejected", true).not("enriched_data", "is", null).order("enriched_at", { ascending: false }).limit(3),
      ]);
      const rows = [...(added ?? []), ...(rejected ?? [])];
      examples = rows.map((r) => r.enriched_data as Record<string, unknown>).filter(Boolean).slice(0, 6);
    }
  } catch {
    /* fall through, reported as "no examples" below */
  }

  if (examples.length === 0) {
    return NextResponse.json({ empty: true, results: [] }, { headers: corsHeaders });
  }

  const marketLabel = market === "us" ? "United States" : "European";
  const prompt = `You are TESTING an Ideal Customer Profile (ICP) for Lysoveta by scoring example supplement companies against it, so the author can see how the ICP behaves. This ICP is for the ${marketLabel} market.

--- ICP ---
${content}
---

For EACH company in the data below, evaluate it strictly against the ICP above and report:
- icp_score: the ICP fit score, 1–5 (using the ICP's own scoring method)
- priority_tier: "early_mover", "follower", "enabler", or "none"
- geography, product_category: your best classification from the company data
- included: true if the ICP's rules would INCLUDE this company as a prospect, false if it is excluded/too weak
- reason: ONE sentence on what drove the score/decision

Include ALL companies in your answer, also the excluded ones, so the tester sees the full behaviour.

Companies:
${JSON.stringify(examples, null, 2)}

Report every company by calling the report_test tool.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      tools: [
        {
          name: "report_test",
          description: "Report the score for every tested company.",
          input_schema: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    icp_score: { type: "integer" },
                    priority_tier: { type: "string" },
                    geography: { type: "string" },
                    product_category: { type: "string" },
                    included: { type: "boolean" },
                    reason: { type: "string" },
                  },
                  required: ["name", "icp_score", "included", "reason"],
                },
              },
            },
            required: ["results"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_test" },
      messages: [{ role: "user", content: prompt }],
    });
    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("no structured result");
    const scored = (toolUse.input as { results?: TestRow[] }).results ?? [];
    // Attach the user's expected category (by name) so the UI can show expected-vs-actual.
    const results = scored.map((r) => ({ ...r, expected: expectedByName.get(r.name) ?? "" }));
    return NextResponse.json({ results }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Test failed." }, { status: 500, headers: corsHeaders });
  }
}
