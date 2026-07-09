import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchForCompanies } from "@/lib/search";

// Starts a search as a BACKGROUND job and returns immediately with a jobId.
// The actual work (Step 1 + Step 2, several minutes) runs after the response is sent —
// this only works on an always-on server (Render), not on serverless (Vercel), where the
// function is killed once it responds. The browser polls the search_jobs row for progress.
export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 1. Create a job row so the browser has something to poll straight away.
  const { data: job, error } = await supabase
    .from("search_jobs")
    .insert({ status: "running", message: "Starting search…" })
    .select("id")
    .single();

  if (error || !job) {
    console.error("[api/search/start] Could not create job:", error?.message);
    return NextResponse.json({ error: error?.message ?? "Kunne ikke opprette søkejobb." }, { status: 500 });
  }

  const jobId = job.id as number;

  // 2. Fire-and-forget: run the search without awaiting it. On a persistent server this keeps
  //    running after we respond. The .then/.catch write the final outcome to the job row.
  searchForCompanies(jobId)
    .then(async (result) => {
      if (result.noCompaniesFound) {
        await supabase.from("search_jobs").update({
          status: "no_companies",
          message: "No new companies found.",
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      } else {
        await supabase.from("search_jobs").update({
          status: "done",
          message: `Done — ${result.enriched.length} companies enriched.`,
          step3_prompt: result.step3Prompt,
          enriched: result.enriched,
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
  return NextResponse.json({ jobId });
}
