import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_ICP_REVIEW_INSTRUCTIONS, ICP_REVIEW_INSTRUCTIONS_KEY, buildReviewPrompt } from "@/lib/icpReview";
import { CLAUDE_MODEL } from "@/lib/models";

// Advisory AI review of an edited ICP document. Runs on the worker (Render) because it needs the
// Anthropic key. It NEVER blocks a save — the UI shows the result and lets the user save anyway.
// Called cross-origin from the UI, so it needs CORS like /api/search/start.
const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

type Issue = { severity: "critical" | "minor"; text: string };

export async function POST(request: Request) {
  let content = "";
  let market: "eu" | "us" = "eu";
  try {
    const body = await request.json();
    content = typeof body?.content === "string" ? body.content : "";
    if (body?.market === "us") market = "us";
  } catch {
    /* fall through — empty content handled below */
  }

  if (!content.trim()) {
    return NextResponse.json(
      { ok: false, summary: "The ICP text is empty.", issues: [{ severity: "critical", text: "The document has no content." }] },
      { headers: corsHeaders }
    );
  }

  const marketLabel = market === "us" ? "United States" : "European";

  // The review rubric is user-editable (stored in app_settings). Fall back to the default if there's
  // no row or the DB read fails — the review must still run.
  let instructions = DEFAULT_ICP_REVIEW_INSTRUCTIONS;
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await supabase.from("app_settings").select("value").eq("key", ICP_REVIEW_INSTRUCTIONS_KEY).maybeSingle();
    if (data?.value && data.value.trim()) instructions = data.value;
  } catch {
    /* keep the default */
  }
  const prompt = buildReviewPrompt(instructions, marketLabel, content);

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Force a structured tool call so the result is always valid JSON — no fragile text parsing.
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      tools: [
        {
          name: "report_review",
          description: "Report the result of reviewing the ICP document.",
          input_schema: {
            type: "object",
            properties: {
              ok: { type: "boolean", description: "true if there are no critical issues" },
              summary: { type: "string", description: "one short sentence overall verdict" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    severity: { type: "string", enum: ["critical", "minor"] },
                    text: { type: "string" },
                  },
                  required: ["severity", "text"],
                },
              },
            },
            required: ["ok", "summary", "issues"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_review" },
      messages: [{ role: "user", content: prompt }],
    });
    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("no structured result");
    const parsed = toolUse.input as { ok?: boolean; summary?: string; issues?: Issue[] };
    const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((i) => i && typeof i.text === "string") : [];
    const ok = typeof parsed.ok === "boolean" ? parsed.ok : !issues.some((i) => i.severity === "critical");
    return NextResponse.json(
      { ok, summary: typeof parsed.summary === "string" ? parsed.summary : "", issues },
      { headers: corsHeaders }
    );
  } catch (err) {
    // Advisory only: if the review can't run, say so and let the UI offer "save anyway".
    return NextResponse.json(
      { ok: null, summary: "", error: err instanceof Error ? err.message : "Review failed." },
      { headers: corsHeaders }
    );
  }
}
