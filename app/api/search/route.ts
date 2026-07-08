import { NextResponse } from "next/server";
import { searchForCompanies } from "@/lib/search";

export async function POST() {
  try {
    const result = await searchForCompanies();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/search] ===== SØK FEILET:", message);

    let userMessage = message;
    if (message.includes("API key")) {
      userMessage = "Ugyldig eller manglende ANTHROPIC_API_KEY. Sjekk at nøkkelen er riktig konfigurert i .env.local.";
    } else if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
      userMessage = "Anthropic API-kvoten er nådd (rate limit). Vent noen minutter og prøv igjen.";
    } else if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      userMessage = "Kunne ikke koble til Supabase eller Anthropic. Sjekk nettverkstilgang og miljøvariabler.";
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
