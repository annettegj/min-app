import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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
  const prompt = `You are reviewing a draft "Ideal Customer Profile" (ICP) document. This exact text is fed to another AI that scores supplement companies as potential B2B customers — it must read as clear, unambiguous scoring instructions for the ${marketLabel} market.

Judge ONLY whether the text works as instructions. Do NOT judge the business strategy or whether the criteria are "correct" — only whether an AI could apply it consistently. Check that it includes, and states clearly:
1. The target market / who qualifies (geography and company type).
2. Priority tiers or archetypes to classify companies into (e.g. early mover / follower / enabler, or similar).
3. A scoring method — how points or criteria produce a fit score, and how that maps to a rating scale (e.g. 1–5 stars).
4. Hard exclusion rules (who to drop outright).
5. Internal consistency — no contradictions, no undefined terms, nothing left dangling.

Mark an issue "critical" if a scorer genuinely could not proceed (e.g. no scoring method at all, or empty/nonsense), and "minor" if it would still work but could be clearer.

Draft ICP to review:
---
${content}
---

Return ONLY a raw JSON object, no markdown:
{"ok": true, "summary": "one short sentence overall verdict", "issues": [{"severity":"critical","text":"..."},{"severity":"minor","text":"..."}]}
Set "ok" to true if there are no critical issues (minor issues are fine), false otherwise. Use an empty issues array if the document is clear and complete.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.findLast((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const match = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON in response");
    const parsed = JSON.parse(match[0]) as { ok?: boolean; summary?: string; issues?: Issue[] };
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
