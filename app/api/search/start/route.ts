import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchForCompanies } from "@/lib/search";

// Allow the UI (hosted on a different origin, e.g. Vercel) to call this worker endpoint.
// ALLOWED_ORIGIN can pin it to the Vercel URL; defaults to "*" (fine for this internal tool).
const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Browsers may send a preflight OPTIONS request before the POST — answer it with the CORS headers.
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// Starts a search as a BACKGROUND job and returns immediately with a jobId.
// The actual work (Step 1 + Step 2, several minutes) runs after the response is sent —
// this only works on an always-on server (Render), not on serverless (Vercel), where the
// function is killed once it responds. The browser polls the search_jobs row for progress.
export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Step 3 mode is chosen by the UI toggle: "auto" runs ICP matching via the API in this worker,
  // "manual" builds the prompt for the user to paste into Claude Chat. Default to "auto".
  let step3Mode: "auto" | "manual" = "auto";
  let searchConcepts: string[] | undefined;
  try {
    const body = await request.json();
    if (body?.step3Mode === "manual") step3Mode = "manual";
    // Optional user-selected search terms. Empty/invalid → undefined, so the worker uses its defaults.
    if (Array.isArray(body?.searchConcepts)) {
      const terms = body.searchConcepts.filter(
        (t: unknown): t is string => typeof t === "string" && t.trim().length > 0
      );
      if (terms.length > 0) searchConcepts = terms;
    }
  } catch {
    // No/invalid body — keep the defaults.
  }

  // 1. Create a job row so the browser has something to poll straight away.
  const { data: job, error } = await supabase
    .from("search_jobs")
    .insert({ status: "running", message: "Starting search…" })
    .select("id")
    .single();

  if (error || !job) {
    console.error("[api/search/start] Could not create job:", error?.message);
    return NextResponse.json({ error: error?.message ?? "Could not create search job." }, { status: 500, headers: corsHeaders });
  }

  const jobId = job.id as number;

  // 2. Fire-and-forget: run the search without awaiting it. On a persistent server this keeps
  //    running after we respond. The .then/.catch write the final outcome to the job row.
  searchForCompanies(jobId, step3Mode, searchConcepts)
    .then(async (result) => {
      if (result.noCompaniesFound) {
        await supabase.from("search_jobs").update({
          status: "no_companies",
          message: "No new companies found.",
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      } else {
        // `results` is set only when automatic Step 3 succeeded — the UI then jumps straight to the
        // selectable results. Otherwise `results` is null and the UI shows the manual paste box.
        const passed = result.results?.length ?? 0;
        await supabase.from("search_jobs").update({
          status: "done",
          message: result.timedOut
            ? `Timed out — ${result.enriched.length} companies enriched before the limit.`
            : result.results
            ? `Done — ${passed} of ${result.enriched.length} companies passed ICP matching.`
            : `Done — ${result.enriched.length} companies enriched.`,
          step3_prompt: result.step3Prompt,
          enriched: result.enriched,
          results: result.results ?? null,
          timed_out: result.timedOut ?? false,
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
    })
    .catch(async (err) => {
      const message = err instanceof Error ? err.message : "Ukjent feil";
      console.error("[api/search/start] Search job failed:", message);
      await supabase.from("search_jobs").update({
        status: "error",
        error: message,
        message: "Search failed.",
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
    });

  // 3. Respond immediately — the browser now polls search_jobs with this id.
  return NextResponse.json({ jobId }, { headers: corsHeaders });
}
