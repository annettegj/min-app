import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const body: { names: string[] } = await req.json();
  const { names } = body;
  if (!names || names.length === 0) return NextResponse.json({ ok: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 1. Mark as rejected in companies table — preserve existing enriched_data
  const { data: existingRows } = await supabase
    .from("companies")
    .select("name, enriched_data")
    .in("name", names);
  const existingEnrichedMap = new Map(
    (existingRows ?? []).map((r: { name: string; enriched_data: unknown }) => [r.name, r.enriched_data])
  );
  const rejectRows = names.map((name) => ({
    name,
    enriched_data: existingEnrichedMap.get(name) ?? {},
    enriched_at: new Date().toISOString(),
    rejected: true,
  }));
  const { error: rejectError } = await supabase
    .from("companies")
    .upsert(rejectRows, { onConflict: "name" });
  if (rejectError) return NextResponse.json({ error: rejectError.message }, { status: 500 });

  // 2. Delete from discovery_queue
  const { error: queueError } = await supabase
    .from("discovery_queue")
    .delete()
    .in("name", names);
  if (queueError) console.warn("[reject] discovery_queue delete failed:", queueError.message);

  return NextResponse.json({ ok: true, rejected: names.length });
}
