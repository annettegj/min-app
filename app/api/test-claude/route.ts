import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Diagnostic route — isolates whether the problem is (A) the API key/credits,
// or (B) the web_search server tool specifically.
// Hit it in the browser: http://localhost:3000/api/test-claude

type TestResult = { ok: boolean; ms: number; detail: string };

async function timed(fn: () => Promise<string>): Promise<TestResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - start, detail };
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // TEST A — minimal call, NO tools. Confirms key + credits + connectivity.
  const testA = await timed(async () => {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 20,
      messages: [{ role: "user", content: "Say the single word: hei" }],
    });
    const text = msg.content.find((b) => b.type === "text");
    return `reply="${text && text.type === "text" ? text.text.trim() : "(none)"}", tokens=${msg.usage.input_tokens}in/${msg.usage.output_tokens}out`;
  });

  // TEST B — minimal web_search call (max 1 search), with a 60s abort so the route always returns.
  const testB = await timed(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const stream = client.messages.stream(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 256,
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 1 }],
          messages: [{ role: "user", content: "Search the web for the official website of the supplement brand Heights and return just the URL." }],
        },
        { signal: controller.signal }
      );
      const msg = await stream.finalMessage();
      const text = msg.content.find((b) => b.type === "text");
      return `reply="${text && text.type === "text" ? text.text.trim().slice(0, 80) : "(none)"}", tokens=${msg.usage.input_tokens}in/${msg.usage.output_tokens}out`;
    } catch (err) {
      if (controller.signal.aborted) throw new Error("web_search call timed out after 60s");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  });

  return NextResponse.json({
    apiKeyPresent: hasKey,
    testA_noTools: testA,
    testB_webSearch: testB,
  });
}
