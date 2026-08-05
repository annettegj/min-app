import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Applies ONE review suggestion to an ICP draft: rewrites the document to address that single issue
// while changing as little else as possible, and returns the full revised text. Runs on the worker
// (needs the Anthropic key). The UI loads the result back into the editor — it is NOT auto-saved, so
// the user reviews/edits and saves themselves. CORS like /api/search/start.
const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  let content = "";
  let issue = "";
  let market: "eu" | "us" = "eu";
  try {
    const body = await request.json();
    content = typeof body?.content === "string" ? body.content : "";
    issue = typeof body?.issue === "string" ? body.issue : "";
    if (body?.market === "us") market = "us";
  } catch {
    /* handled below */
  }

  if (!content.trim() || !issue.trim()) {
    return NextResponse.json({ error: "Missing content or issue." }, { status: 400, headers: corsHeaders });
  }

  const marketLabel = market === "us" ? "United States" : "European";
  const prompt = `Below is an "Ideal Customer Profile" (ICP) document for the ${marketLabel} market. It is used to instruct an AI that scores supplement companies.

Revise the document to address ONLY this one review point:
"${issue}"

Rules:
- Change as little as possible. Preserve all other content, structure, headings, tables, and wording exactly.
- Only add or adjust what is needed to resolve that specific point.
- Keep it as a clear, self-contained ICP that still works as scoring instructions.
- Do not add meta-commentary, notes about what you changed, or explanations — return only the document itself.

Current ICP document:
---
${content}
---

Return the full revised document by calling the revised_icp tool.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      tools: [
        {
          name: "revised_icp",
          description: "Return the full revised ICP document.",
          input_schema: {
            type: "object",
            properties: {
              content: { type: "string", description: "The complete revised ICP document (Markdown)." },
            },
            required: ["content"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "revised_icp" },
      messages: [{ role: "user", content: prompt }],
    });
    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("no structured result");
    const revised = (toolUse.input as { content?: string }).content;
    if (!revised || !revised.trim()) throw new Error("empty revision");
    return NextResponse.json({ content: revised }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not apply the suggestion." },
      { status: 500, headers: corsHeaders }
    );
  }
}
