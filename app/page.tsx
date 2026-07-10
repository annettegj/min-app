"use client";

import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { supabase } from "@/lib/supabase";
import mockResultsData from "@/config/mock-results.json";
import sourcesConfig from "@/config/sources.json";

// Set to true to skip the real search and use mock data for demos
const DEMO_MODE = false;

// Disables the live "Search for New Companies" button in deployed environments
// (the real search is too long-running for serverless). Set NEXT_PUBLIC_DISABLE_SEARCH=true
// on Vercel; leave unset locally so the search works during development.
const SEARCH_DISABLED = process.env.NEXT_PUBLIC_DISABLE_SEARCH === "true";

const GEOGRAPHIES = ["All", "EU", "UK", "US", "APAC", "Global"];
const GEO_OPTIONS = ["EU", "UK", "US", "APAC", "Global"];
const CATEGORIES = ["All", "Premium/science-driven brand", "Pharma Rx", "Established CHC", "Distributor/enabler"];
const CAT_OPTIONS = CATEGORIES.slice(1);
const TIERS = ["All", "Early Mover", "Follower", "Enabler"];

// Search-configuration preview options — read directly from config/sources.json (one-way:
// config → app), so the UI always mirrors the actual sources and search concepts the code uses.
const SEARCH_TERM_OPTIONS = (sourcesConfig as { search_concepts?: string[] }).search_concepts ?? [];
const SOURCE_OPTIONS = ((sourcesConfig as { sources?: { name: string }[] }).sources ?? []).map(s => s.name);

type Company = {
  id: number;
  name: string;
  geography: string;
  product_category: string;
  revenue_meur: number | null;
  max_price: number | null;
  price_currency: string | null;
  icp_fit: number;
  website_url?: string;
  source_name?: string;
  description?: string;
  priority_tier?: string | null;
  pilot_source?: boolean;
  rejected?: boolean;
  added?: boolean;
};

type SearchResult = {
  name: string;
  website_url: string;
  description: string;
  priority_tier?: string | null;
  icp_score?: number | null;
  geography?: string | null;
  product_category?: string | null;
  max_price_eur?: number | null;
  price_currency?: string | null;
  selected: boolean;
};

type PendingCompany = SearchResult & {
  geography: string;
  product_category: string;
  revenue_meur: string;
  max_price: string;
  icp_fit: number;
};

// --- Shared styles ---
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #C4CAE8", padding: "8px 10px",
  fontSize: 13, color: "#1A2456", background: "#FAFBFF", outline: "none",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "#4A63D8", marginBottom: 6,
};

export default function Home() {
  const [tab, setTab] = useState<"database" | "search" | "icp" | "prospectus">("database");
  const [icpContent, setIcpContent] = useState<string | null>(null);

  // --- Database tab state ---
  const [companies, setCompanies] = useState<Company[]>([]);
  const [geography, setGeography] = useState("All");
  const [category, setCategory] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [icpMin, setIcpMin] = useState(1);
  const [tier, setTier] = useState("All");
  const [searchState, setSearchState] = useState<"idle" | "loading" | "done">("idle");
  const [searchParams, setSearchParams] = useState<null | {
    geography: string; category: string;
    priceMin: string; priceMax: string;
    icpMin: number; tier: string;
  }>(null);

  // --- Search tab state ---
  const [agentState, setAgentState] = useState<"idle" | "stale_warning" | "searching" | "step3" | "done" | "error">("idle")
  const [agentError, setAgentError] = useState<{ title: string; detail: string; canRetry: boolean } | null>(null)
  const [staleCompanies, setStaleCompanies] = useState<string[]>([]);
  const [step3Prompt, setStep3Prompt] = useState("");
  const [step3Paste, setStep3Paste] = useState("");
  const [step3CopyDone, setStep3CopyDone] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [pendingCompanies, setPendingCompanies] = useState<PendingCompany[]>([]);
  const [addingState, setAddingState] = useState<"idle" | "form" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState("");
  const [sourceNameMap, setSourceNameMap] = useState<Record<string, string>>({});
  const [expandedCompanyId, setExpandedCompanyId] = useState<number | null>(null);

  // --- Search configuration preview (placeholder — does not affect the real search yet) ---
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  // --- Background search job (start + poll) ---
  const [searchProgress, setSearchProgress] = useState("");
  const [searchTimedOut, setSearchTimedOut] = useState(false);
  const [activeSearchJobId, setActiveSearchJobId] = useState<number | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMsRef = useRef<number | null>(null);
  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  };
  // Clean up the timers if the component unmounts mid-search
  useEffect(() => stopPolling, []);

  // Which of the 3 steps are we on? (1 = discovery, 2 = enrichment, 3 = manual evaluation)
  const currentStep = agentState === "step3" || agentState === "done"
    ? 3
    : searchProgress.toLowerCase().includes("enrich") ? 2 : 1;
  const elapsedLabel = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;

  // Loads the active company database — always excludes rejected companies.
  // Single source of truth so the database view can never accidentally include rejected rows.
  async function loadCompanies() {
    const { data } = await supabase.from("companies").select("*");
    if (data) setCompanies(data.filter((c: Company) => c.added && !c.rejected) as Company[]);
  }

  useEffect(() => {
    loadCompanies();
    fetch("/api/icp").then(r => r.json()).then(d => setIcpContent(d.content));
  }, []);

  const results = useMemo(() => {
    if (!searchParams) return [];
    return companies.filter((c) => {
      if (DEMO_MODE && c.pilot_source) return false;
      if (searchParams.geography !== "All" && c.geography !== searchParams.geography) return false;
      if (searchParams.category && c.product_category !== searchParams.category) return false;
      if (searchParams.priceMin && (c.max_price ?? 0) < Number(searchParams.priceMin)) return false;
      if (searchParams.priceMax && (c.max_price ?? 0) > Number(searchParams.priceMax)) return false;
      if (c.icp_fit < searchParams.icpMin) return false;
      if (searchParams.tier === "Early Mover" && c.priority_tier !== "early_mover") return false;
      if (searchParams.tier === "Follower" && c.priority_tier !== "follower") return false;
      if (searchParams.tier === "Enabler" && c.priority_tier !== "enabler") return false;
      return true;
    });
  }, [searchParams, companies]);

  function handleSearch() {
    setSearchState("loading");
    setSearchParams(null);
    setTimeout(() => {
      setSearchParams({ geography, category, priceMin, priceMax, icpMin, tier });
      setSearchState("done");
    }, 500);
  }

  async function deleteFromQueue(name: string) {
    await supabase.from("discovery_queue").delete().eq("name", name);
    setStaleCompanies(prev => prev.filter(n => n !== name));
  }

  // Called when the user abandons a search mid-flow (Cancel). Puts the current batch
  // back in the queue as "pending" so it resurfaces on the next search — the enriched
  // data is already cached, so Step 2 will not re-enrich (no extra cost).
  async function resetProcessingToQueue() {
    await supabase.from("discovery_queue").update({ status: "pending" }).eq("status", "processing");
  }

  async function handleAgentSearch() {
    setAgentError(null);
    setSearchResults([]);
    setStep3Paste("");
    setStep3CopyDone(false);
    setAddingState("idle");
    setPendingCompanies([]);
    setSearchTimedOut(false);

    if (DEMO_MODE) {
      setAgentState("searching");
      await new Promise(resolve => setTimeout(resolve, 2000));
      setSearchResults(mockResultsData.map(r => ({ ...r, selected: false })));
      setAgentState("done");
      return;
    }

    // Check for stuck companies and reset them automatically — then pause so the user can see what happened
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: staleRows } = await supabase
      .from("discovery_queue")
      .select("name")
      .eq("status", "processing")
      .lt("processing_started_at", staleThreshold);

    if (staleRows && staleRows.length > 0) {
      const staleNames = staleRows.map((r: { name: string }) => r.name);
      // Reset immediately — always the right thing to do
      await supabase.from("discovery_queue").update({ status: "pending" }).in("name", staleNames);
      setStaleCompanies(staleNames);
      setAgentState("stale_warning");
      return;
    }

    setAgentState("searching");
    setSearchProgress("Starting search…");
    try {
      // Start the search as a BACKGROUND job — returns immediately with a jobId.
      // NEXT_PUBLIC_WORKER_URL points at the Render worker when the UI is hosted elsewhere
      // (e.g. Vercel); empty means same origin (everything on one host / local dev).
      const workerBase = process.env.NEXT_PUBLIC_WORKER_URL ?? "";
      const res = await fetch(`${workerBase}/api/search/start`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setAgentError({
          title: "Could not start the search",
          detail: data.error ?? `Server error (HTTP ${res.status}). Check that the server and Supabase connection are working.`,
          canRetry: true,
        });
        setAgentState("error");
        return;
      }

      const jobId = data.jobId as number;
      setActiveSearchJobId(jobId);
      setLogLines([]);

      // Start the elapsed-time counter (updates every second).
      startMsRef.current = Date.now();
      setElapsedSec(0);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      elapsedRef.current = setInterval(() => {
        if (startMsRef.current) setElapsedSec(Math.floor((Date.now() - startMsRef.current) / 1000));
      }, 1000);

      // Poll the job row (and its log) every 3 seconds until it finishes.
      stopPolling();
      pollRef.current = setInterval(async () => {
        // Fetch the live log lines for this job
        const { data: logs } = await supabase
          .from("search_logs")
          .select("message")
          .eq("job_id", jobId)
          .order("created_at", { ascending: true });
        if (logs) setLogLines(logs.map((l: { message: string }) => l.message));

        const { data: job } = await supabase.from("search_jobs").select("*").eq("id", jobId).single();
        if (!job) return;
        setSearchProgress(job.message ?? "");

        if (job.status === "done") {
          stopPolling();
          const enriched = (job.enriched ?? []) as { name: string; source_name?: string }[];
          const map: Record<string, string> = {};
          for (const e of enriched) { if (e.source_name) map[e.name] = e.source_name; }
          setSourceNameMap(map);
          setStep3Prompt(job.step3_prompt ?? "");
          setSearchTimedOut(!!job.timed_out);
          setAgentState("step3");
        } else if (job.status === "no_companies") {
          stopPolling();
          setAgentError({
            title: "No new companies found",
            detail: "The search found no companies that aren't already in the database, rejected, or in the queue. This may mean the sources haven't published anything new, or the search terms keep hitting the same companies. Consider adjusting the sources or search terms in config/sources.json, or try again later.",
            canRetry: false,
          });
          setAgentState("error");
        } else if (job.status === "error") {
          stopPolling();
          setAgentError({
            title: "The search failed",
            detail: job.error ?? "Unknown error during the search.",
            canRetry: true,
          });
          setAgentState("error");
        }
      }, 3000);
    } catch (err) {
      stopPolling();
      console.error("Agent search error:", err);
      setAgentError({
        title: "Network error",
        detail: err instanceof Error ? err.message : "Could not reach the server. Check your internet connection and try again.",
        canRetry: true,
      });
      setAgentState("error");
    }
  }

  async function handleStep3Submit() {
    const raw = step3Paste.trim().replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;
    try {
      const parsed = JSON.parse(match[0]);
      setSearchResults(parsed.map((r: { name: string; website_url: string; description: string; priority_tier?: string | null; icp_score?: number | null }) => ({ ...r, selected: false })));

      // Mark companies that were enriched (step 2) but not returned by step 3 (AI-rejected) as rejected
      const returnedNames = new Set(parsed.map((r: { name: string }) => r.name));
      const aiRejected = Object.keys(sourceNameMap).filter(name => !returnedNames.has(name));
      if (aiRejected.length > 0) {
        await fetch("/api/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: aiRejected }),
        });
        console.log(`[step3] AI-rejected ${aiRejected.length} companies:`, aiRejected);
      }

      setAgentState("done");
    } catch {
      alert("Could not parse the response — check that you copied the correct JSON array.");
    }
  }

  function toggleResult(i: number) {
    setSearchResults(prev => prev.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r));
  }

  function handleAddSelected() {
    const selected = searchResults.filter(r => r.selected);
    setPendingCompanies(selected.map(r => ({
      ...r,
      geography: r.geography ?? "",
      product_category: r.product_category ?? "",
      revenue_meur: "",
      max_price: r.max_price_eur != null ? String(r.max_price_eur) : "",
      icp_fit: r.icp_score ?? 3,
    })));
    setAddingState("form");
  }

  function updatePending(i: number, field: string, value: string | number) {
    setPendingCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }

  async function handleSave() {
    setAddingState("saving");
    setSaveError("");
    const rows = pendingCompanies.map(c => ({
      name: c.name,
      website_url: c.website_url,
      description: c.description,
      geography: c.geography,
      product_category: c.product_category,
      revenue_meur: c.revenue_meur ? Number(c.revenue_meur) : null,
      max_price: c.max_price ? Number(c.max_price) : null,
      price_currency: c.price_currency || null,
      icp_fit: c.icp_fit,
      priority_tier: c.priority_tier ?? null,
      added: true,
    }));
    const { error } = await supabase.from("companies").upsert(rows, { onConflict: "name" });
    if (error) {
      console.error("[save] Supabase error:", error);
      setSaveError(`Something went wrong: ${error.message}`);
      setAddingState("form");
    } else {
      const savedNames = pendingCompanies.map((c) => c.name);

      // Look up source_name from discovery_queue, then remove the saved companies from the queue
      const { data: queueRows } = await supabase
        .from("discovery_queue")
        .select("name, source_name")
        .in("name", savedNames);

      const queueMap = new Map(
        (queueRows ?? []).map((r: { name: string; source_name: string }) => [r.name, r.source_name])
      );

      // Write source_name to companies table
      for (const name of savedNames) {
        const sourceName = queueMap.get(name);
        if (sourceName) {
          await supabase.from("companies").update({ source_name: sourceName }).eq("name", name);
        }
      }

      await supabase.from("discovery_queue").delete().in("name", savedNames);

      // Mark companies that appeared in results but were NOT saved as rejected
      const savedNameSet = new Set(savedNames);
      const rejectedNames = searchResults
        .filter((r) => !savedNameSet.has(r.name))
        .map((r) => r.name);
      if (rejectedNames.length > 0) {
        await fetch("/api/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: rejectedNames }),
        });
      }

      // Refetch the database view once all writes are done
      await loadCompanies();

      setAddingState("saved");
      setSearchResults([]);
      setAgentState("idle");
    }
  }

  // Safely derives a clean hostname for display; falls back to the raw string if the URL is malformed
  function displayHostname(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  // Ensures a URL has a protocol so it works as an external href (not treated as a relative link)
  function safeHref(url: string): string {
    if (!url) return "#";
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  const icpColor = (score: number) =>
    score >= 4 ? "#16a34a" : score === 3 ? "#d97706" : "#dc2626";

  const selectedCount = searchResults.filter(r => r.selected).length;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F4F5FA", fontFamily: "Inter, sans-serif" }}>

      {/* Top bar */}
      <div style={{ background: "#0C1C2E", borderBottom: "3px solid #4A63D8" }}>
        <div className="max-w-screen-2xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex flex-col gap-2" style={{ alignItems: "flex-start" }}>
            <img src="/AKBM logo.png" alt="Aker BioMarine" style={{ height: 52, width: "auto", objectFit: "contain", display: "block" }} />
            <p style={{ color: "#FFFFFF", fontSize: 20, fontWeight: 700, letterSpacing: "0.01em", marginLeft: 10 }}>Lysoveta Customer Finder</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-screen-2xl mx-auto px-8 flex">
          <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
            {[
              { key: "database", label: "Company Database", soon: false },
              { key: "search", label: "Find New Companies", soon: false },
              { key: "icp", label: "Lysoveta ICP Criteria", soon: false },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as "database" | "search" | "icp" | "prospectus")}
                style={{
                  padding: "10px 20px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                  background: tab === t.key ? "#F4F5FA" : "transparent",
                  color: tab === t.key ? "#1A2456" : "#A0AECF",
                  borderTop: tab === t.key ? "2px solid #0891B2" : "2px solid transparent",
                }}
              >
                {t.label}
              </button>
            ))}
            <div style={{ marginLeft: "auto" }}>
              <button
                disabled
                style={{
                  padding: "10px 20px", fontSize: 13, fontWeight: 600, border: "none", cursor: "default",
                  background: "transparent", color: "#8A93B2",
                  borderTop: "2px solid transparent",
                }}
              >
                Company Prospectus (Soon)
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto w-full px-8 py-8 flex-1 flex flex-col gap-6">

        {/* ── TAB 1: Company Database ── */}
        {tab === "database" && (
          <>
            <div>
              <button onClick={() => { setSearchParams({ geography: "All", category: "", priceMin: "", priceMax: "", icpMin: 1, tier: "All" }); setSearchState("done"); }}
                style={{ background: "#0891B2", color: "#FFFFFF", border: "none", padding: "12px 36px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#0670A0")}
                onMouseLeave={e => (e.currentTarget.style.background = "#0891B2")}>
                Show All Companies →
              </button>
            </div>

            <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8" }}>
              <div style={{ background: "#0C1C2E", padding: "12px 20px" }}>
                <p style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 700 }}>Filter Companies</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0" style={{ borderTop: "1px solid #E4E7F2" }}>

                <div style={{ padding: "18px 20px", borderRight: "1px solid #E4E7F2", borderBottom: "1px solid #E4E7F2" }}>
                  <label style={labelStyle}>Geography</label>
                  <select value={geography} onChange={(e) => setGeography(e.target.value)} style={inputStyle}>
                    {GEOGRAPHIES.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>

                <div style={{ padding: "18px 20px", borderRight: "1px solid #E4E7F2", borderBottom: "1px solid #E4E7F2" }}>
                  <label style={labelStyle}>Product Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                    {CATEGORIES.map(c => <option key={c} value={c === "All" ? "" : c}>{c}</option>)}
                  </select>
                </div>

                <div style={{ padding: "18px 20px", borderRight: "1px solid #E4E7F2", borderBottom: "1px solid #E4E7F2" }}>
                  <label style={labelStyle}>Min. ICP Fit Score</label>
                  <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setIcpMin(icpMin === star ? 1 : star)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, lineHeight: 1, padding: "0 2px", color: star <= icpMin ? (icpMin >= 4 ? "#15803D" : icpMin === 3 ? "#B45309" : "#DC2626") : "#D1D5DB" }}>
                        ★
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: "#A0AECF", marginTop: 4 }}>Showing {icpMin}★ and above</p>
                </div>

                <div style={{ padding: "18px 20px", borderBottom: "1px solid #E4E7F2" }}>
                  <label style={labelStyle}>Priority Tier</label>
                  <select value={tier} onChange={(e) => setTier(e.target.value)} style={inputStyle}>
                    {TIERS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>



                <div style={{ padding: "18px 20px", borderRight: "1px solid #E4E7F2" }}>
                  <label style={labelStyle}>Max. Price</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="number" placeholder="Min" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} style={inputStyle} />
                    <input type="number" placeholder="Max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} style={inputStyle} />
                  </div>
                </div>

                <div style={{ padding: "18px 20px" }} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={handleSearch}
                style={{ background: "#22B8D4", color: "#FFFFFF", border: "none", padding: "12px 36px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#1EA8C2")}
                onMouseLeave={e => (e.currentTarget.style.background = "#22B8D4")}>
                Find Companies →
              </button>
            </div>

            {searchState === "loading" && <p style={{ color: "#4A63D8", fontSize: 13 }}>Fetching companies…</p>}

            {searchState === "done" && (
              <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8" }}>
                <div style={{ background: "#0C1C2E", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 700 }}>Results</p>
                  <p style={{ color: "#FFFFFF", fontSize: 12 }}>{results.length} {results.length !== 1 ? "companies" : "company"} found</p>
                </div>
                {results.length === 0 ? (
                  <div style={{ padding: "48px 20px", textAlign: "center", color: "#A0AECF", fontSize: 13 }}>
                    No companies match the selected filters.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                    <thead>
                      <tr style={{ background: "#EEF0FA", borderBottom: "1px solid #D0D5E8" }}>
                        {["Company", "Website", "Source", "Geography", "Category", "Max. Price", "Priority", "ICP Fit Score"].map(h => (
                          <th key={h} style={{ padding: "12px 22px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4A63D8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((c, i) => (
                        <Fragment key={c.id}>
                          <tr onClick={() => setExpandedCompanyId(expandedCompanyId === c.id ? null : c.id)}
                            style={{ borderBottom: expandedCompanyId === c.id ? "none" : "1px solid #E4E7F2", background: i % 2 === 0 ? "#FFFFFF" : "#FAFBFF", cursor: "pointer" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#F0F4FF")}
                            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#FFFFFF" : "#FAFBFF")}>
                            <td style={{ padding: "16px 22px", fontWeight: 600, color: "#1A2456", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 10, color: "#A0AECF", marginRight: 2 }}>{expandedCompanyId === c.id ? "▾" : "▸"}</span>
                                {c.name}
                                {c.pilot_source && (
                                  <span title="Added during pilot phase — source not verified by stakeholders" style={{ background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3, letterSpacing: "0.05em", textTransform: "uppercase", border: "1px solid #FDE68A" }}>Pilot</span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: "16px 22px", whiteSpace: "nowrap" }}>
                              {c.website_url ? (
                                <a href={safeHref(c.website_url)} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  style={{ color: "#0891B2", fontSize: 12, textDecoration: "none" }}
                                  onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                                  onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}>
                                  {displayHostname(c.website_url)}
                                </a>
                              ) : (
                                <span style={{ color: "#A0AECF", fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "16px 22px", color: "#4B5563", fontSize: 12, whiteSpace: "nowrap" }}>
                              {c.source_name ?? <span style={{ color: "#A0AECF" }}>—</span>}
                            </td>
                            <td style={{ padding: "16px 22px", color: "#4B5563", whiteSpace: "nowrap" }}>{c.geography}</td>
                            <td style={{ padding: "16px 22px", color: "#4B5563", whiteSpace: "nowrap" }}>{c.product_category}</td>
                            <td style={{ padding: "16px 22px", color: "#4B5563", whiteSpace: "nowrap" }}>{c.max_price != null ? `${c.price_currency === "GBP" ? "£" : c.price_currency === "USD" ? "$" : c.price_currency === "EUR" ? "€" : ""}${c.max_price.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                            <td style={{ padding: "16px 22px", whiteSpace: "nowrap" }}>
                              {c.priority_tier === "early_mover" && (
                                <span style={{ background: "#DCFCE7", color: "#15803D", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em" }}>Early Mover</span>
                              )}
                              {c.priority_tier === "follower" && (
                                <span style={{ background: "#FEF9C3", color: "#854D0E", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em" }}>Follower</span>
                              )}
                              {c.priority_tier === "enabler" && (
                                <span style={{ background: "#EDE9FE", color: "#5B21B6", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em" }}>Enabler</span>
                              )}
                              {!c.priority_tier && <span style={{ color: "#A0AECF", fontSize: 12 }}>—</span>}
                            </td>
                            <td style={{ padding: "16px 22px", fontSize: 13, letterSpacing: 1, color: icpColor(c.icp_fit), whiteSpace: "nowrap" }}>{"★".repeat(c.icp_fit)}{"☆".repeat(5 - c.icp_fit)}</td>
                          </tr>
                          {expandedCompanyId === c.id && (
                            <tr style={{ borderBottom: "1px solid #E4E7F2", background: i % 2 === 0 ? "#FFFFFF" : "#FAFBFF" }}>
                              <td colSpan={8} style={{ padding: "0 20px 20px 48px" }}>
                                <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.7, maxWidth: 860 }}>
                                  {c.description ?? <span style={{ color: "#A0AECF", fontStyle: "italic" }}>No description available.</span>}
                                </p>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {searchState === "done" && results.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                <button
                  disabled
                  style={{ background: "#F3F4F6", color: "#9CA3AF", border: "1px solid #D1D5DB", padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "not-allowed", borderRadius: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  ↓ Export as Excel
                </button>
              </div>
            )}
          </>
        )}

        {/* ── TAB 2: Find New Companies ── */}
        {tab === "search" && (
          <>
            {/* Live search log — mirrors the server log, so no need to open the Render dashboard */}
            {activeSearchJobId != null && logLines.length > 0 && (
              <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8" }}>
                <div onClick={() => setShowLog(!showLog)}
                  style={{ background: "#0C1C2E", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                  <p style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700 }}>Search Log</p>
                  <span style={{ color: "#A0BEFF", fontSize: 12 }}>{showLog ? "Hide ▴" : "Show ▾"} ({logLines.length})</span>
                </div>
                {showLog && (
                  <pre style={{ margin: 0, padding: "14px 20px", fontSize: 12, fontFamily: "monospace", color: "#374151", background: "#F8F9FF", maxHeight: 340, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {logLines.join("\n")}
                  </pre>
                )}
              </div>
            )}

            {agentState === "idle" && addingState !== "saved" && (
              <>
                {/* Search configuration — PLACEHOLDER, not wired to the real search yet */}
                <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8" }}>
                  <div style={{ background: "#0C1C2E", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 700 }}>Search Configuration</p>
                    <span style={{ color: "#A0BEFF", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Preview</span>
                  </div>
                  <div style={{ background: "#FFFBEB", borderBottom: "1px solid #FCD34D", padding: "10px 20px" }}>
                    <p style={{ fontSize: 12, color: "#78350F" }}>Preview only — these selections don’t affect the search yet. The search currently uses the fixed sources and terms in config/sources.json.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2" style={{ padding: "20px", gap: 32, opacity: 0.5, pointerEvents: "none", filter: "grayscale(1)" }}>
                    {/* Search terms */}
                    <div>
                      <label style={labelStyle}>Search terms (choose up to 3)</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 4 }}>
                        {SEARCH_TERM_OPTIONS.map(t => {
                          const checked = selectedTerms.includes(t);
                          const atMax = selectedTerms.length >= 3;
                          return (
                            <label key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: checked || !atMax ? "#374151" : "#A0AECF", cursor: checked || !atMax ? "pointer" : "default" }}>
                              <input type="checkbox" checked={checked} disabled={!checked && atMax}
                                onChange={() => setSelectedTerms(checked ? selectedTerms.filter(x => x !== t) : [...selectedTerms, t])}
                                style={{ accentColor: "#0891B2", width: 15, height: 15 }} />
                              {t}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    {/* Sources */}
                    <div>
                      <label style={labelStyle}>Sources (choose up to 4)</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 4 }}>
                        {SOURCE_OPTIONS.map(s => {
                          const checked = selectedSources.includes(s);
                          const atMax = selectedSources.length >= 4;
                          return (
                            <label key={s} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: checked || !atMax ? "#374151" : "#A0AECF", cursor: checked || !atMax ? "pointer" : "default" }}>
                              <input type="checkbox" checked={checked} disabled={!checked && atMax}
                                onChange={() => setSelectedSources(checked ? selectedSources.filter(x => x !== s) : [...selectedSources, s])}
                                style={{ accentColor: "#0891B2", width: 15, height: 15 }} />
                              {s}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search action */}
                <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8", padding: "48px 32px", textAlign: "center" }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "#1A2456", marginBottom: 8 }}>Search for new prospects</p>
                  <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 28 }}>An AI agent will search the web for companies that match Aker BioMarine's customer profile.</p>
                  <button onClick={() => { if (!SEARCH_DISABLED) handleAgentSearch(); }} disabled={SEARCH_DISABLED}
                    style={{ background: SEARCH_DISABLED ? "#E4E7F2" : "#0891B2", color: SEARCH_DISABLED ? "#9CA3AF" : "#FFFFFF", border: SEARCH_DISABLED ? "1px solid #D1D5DB" : "none", padding: "12px 36px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: SEARCH_DISABLED ? "not-allowed" : "pointer" }}>
                    {SEARCH_DISABLED ? "Search Disabled (Demo)" : "Search for New Companies →"}
                  </button>
                  {SEARCH_DISABLED && (
                    <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 14 }}>Live search runs offline during the pilot — the database below is kept up to date.</p>
                  )}
                </div>
              </>
            )}

            {agentState === "stale_warning" && (
              <div style={{ background: "#FFFFFF", border: "1px solid #FCD34D" }}>
                <div style={{ background: "#78350F", padding: "12px 20px" }}>
                  <p style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 700 }}>A previous search didn’t finish</p>
                </div>
                <div style={{ padding: "24px" }}>
                  <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, marginBottom: 16 }}>
                    {staleCompanies.length} {staleCompanies.length === 1 ? "company" : "companies"} got stuck in the previous search and have now been put back in the queue. The search was stopped automatically so you can investigate what went wrong.
                  </p>
                  <div style={{ border: "1px solid #E4E7F2", marginBottom: 20 }}>
                    {staleCompanies.map((name) => (
                      <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #E4E7F2" }}>
                        <span style={{ fontSize: 13, color: "#374151" }}>{name}</span>
                        <button
                          onClick={() => deleteFromQueue(name)}
                          title="Remove from queue"
                          style={{ background: "transparent", border: "1px solid #E4E7F2", color: "#9CA3AF", padding: "3px 10px", fontSize: 12, cursor: "pointer" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = "#dc2626"; e.currentTarget.style.borderColor = "#dc2626"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; e.currentTarget.style.borderColor = "#E4E7F2"; }}>
                          Remove from queue ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", padding: "12px 16px", marginBottom: 24 }}>
                    <p style={{ fontSize: 13, color: "#78350F" }}>
                      If a particular company repeatedly hangs, you can remove it from the queue. Otherwise it’s safe to start a new search — they will be retried.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={() => { setAgentState("idle"); setStaleCompanies([]); }}
                      style={{ background: "#0C1C2E", color: "#FFFFFF", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                      OK, got it
                    </button>
                    <button onClick={() => { setStaleCompanies([]); setAgentState("searching"); handleAgentSearch(); }}
                      style={{ background: "#0891B2", color: "#FFFFFF", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                      Start new search →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {agentState === "searching" && (
              <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8", padding: "64px 32px", textAlign: "center" }}>
                <div style={{ display: "inline-block", width: 40, height: 40, border: "4px solid #E4E7F2", borderTop: "4px solid #0891B2", borderRadius: "50%", animation: "spin 0.9s linear infinite", marginBottom: 20 }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1A2456", marginBottom: 10 }}>
                  Step {currentStep} of 3 — {currentStep === 1 ? "Finding companies" : currentStep === 2 ? "Enriching companies" : "Evaluating"}
                </p>
                {/* Step progress dots */}
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                  {[1, 2, 3].map(s => (
                    <div key={s} style={{ width: 36, height: 5, borderRadius: 3, background: s <= currentStep ? "#0891B2" : "#E4E7F2" }} />
                  ))}
                </div>
                <p style={{ fontSize: 13, color: "#6B7280" }}>{searchProgress || "The AI agent is finding relevant companies. This may take a few minutes."}</p>
                <p style={{ fontSize: 13, color: "#1A2456", fontWeight: 600, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>Elapsed: {elapsedLabel}</p>
                <p style={{ fontSize: 12, color: "#A0AECF", marginTop: 10 }}>You can leave this page open — the search runs on the server and this view updates automatically.</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {agentState === "error" && agentError && (
              <div style={{ background: "#FFFFFF", border: "1px solid #FCA5A5" }}>
                <div style={{ background: "#7F1D1D", padding: "12px 20px" }}>
                  <p style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 700 }}>{agentError.title}</p>
                </div>
                <div style={{ padding: "24px 24px 20px" }}>
                  <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, marginBottom: 20 }}>{agentError.detail}</p>
                  <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", padding: "12px 16px", marginBottom: 20 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#991B1B", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Hva kan du gjøre?</p>
                    {agentError.canRetry ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        <li style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>Try the search again — companies that were mid-processing are reset automatically</li>
                        <li style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>Check that the API keys (ANTHROPIC_API_KEY, Supabase) are configured correctly</li>
                        <li style={{ fontSize: 13, color: "#374151" }}>See the console log (F12) for technical details about the error</li>
                      </ul>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        <li style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>Wait a few days and try again — trade media publish new articles regularly</li>
                        <li style={{ fontSize: 13, color: "#374151" }}>Consider adding new search terms in <code style={{ background: "#FEE2E2", padding: "1px 4px", fontSize: 12 }}>config/sources.json</code></li>
                      </ul>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    {agentError.canRetry && (
                      <button onClick={() => handleAgentSearch()}
                        style={{ background: "#0891B2", color: "#FFFFFF", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                        Try again →
                      </button>
                    )}
                    <button onClick={() => { setAgentState("idle"); setAgentError(null); }}
                      style={{ background: "transparent", color: "#6B7280", border: "1px solid #D0D5E8", padding: "10px 24px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {agentState === "step3" && (
              <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8" }}>
                {searchTimedOut && (
                  <div style={{ background: "#FFFBEB", borderBottom: "1px solid #FCD34D", padding: "14px 20px" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#78350F", marginBottom: 4 }}>⚠️ The search timed out after 20 minutes</p>
                    <p style={{ fontSize: 12.5, color: "#78350F", lineHeight: 1.6 }}>
                      Nothing was lost: companies found in Step 1 are saved in the queue, and companies that finished enrichment in Step 2 are in the company database. The next search will automatically pick up where this one left off. You can still evaluate the companies that were enriched below.
                    </p>
                  </div>
                )}
                <div style={{ background: "#0C1C2E", padding: "12px 20px" }}>
                  <p style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 700 }}>Step 3 — Manual Evaluation</p>
                  <p style={{ color: "#A0BEFF", fontSize: 12, marginTop: 2 }}>Steps 1 and 2 are done. Copy the prompt below and paste it into Claude Chat to evaluate the companies.</p>
                </div>
                <div style={{ padding: "24px 24px 0" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#4A63D8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>1. Copy this prompt and paste it into Claude Chat</p>
                  <div style={{ position: "relative" }}>
                    <textarea readOnly value={step3Prompt} rows={6}
                      style={{ width: "100%", fontSize: 12, fontFamily: "monospace", color: "#374151", background: "#F8F9FF", border: "1px solid #D0D5E8", padding: "12px", resize: "vertical", boxSizing: "border-box" }} />
                    <button
                      onClick={() => { navigator.clipboard.writeText(step3Prompt); setStep3CopyDone(true); }}
                      style={{ position: "absolute", top: 8, right: 8, background: step3CopyDone ? "#16a34a" : "#0891B2", color: "#fff", border: "none", padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {step3CopyDone ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                </div>
                <div style={{ padding: "20px 24px 24px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#4A63D8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>2. Paste the response from Claude Chat here</p>
                  <textarea
                    value={step3Paste}
                    onChange={e => setStep3Paste(e.target.value)}
                    placeholder='Paste the JSON response here, e.g. [{"name":"...","priority_tier":"early_mover","icp_score":4,"description":"...","website_url":"..."}]'
                    rows={6}
                    style={{ width: "100%", fontSize: 12, fontFamily: "monospace", color: "#374151", background: "#FAFBFF", border: "1px solid #D0D5E8", padding: "12px", resize: "vertical", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
                    <button onClick={() => { resetProcessingToQueue(); setAgentState("idle"); }}
                      style={{ background: "transparent", color: "#6B7280", border: "1px solid #D0D5E8", padding: "10px 24px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={handleStep3Submit} disabled={!step3Paste.trim()}
                      style={{ background: step3Paste.trim() ? "#0891B2" : "#C4CAE8", color: "#FFFFFF", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: step3Paste.trim() ? "pointer" : "default" }}>
                      Show results →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {agentState === "done" && addingState === "idle" && (
              <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8" }}>
                <div style={{ background: "#0C1C2E", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 700 }}>Search Results</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <p style={{ color: "#A0BEFF", fontSize: 12 }}>{searchResults.length} companies found</p>
                    <button onClick={() => { resetProcessingToQueue(); setAgentState("idle"); setSearchResults([]); }}
                      style={{ background: "#FFFFFF", color: "#1A2456", border: "none", padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em" }}>
                      ✕ Cancel
                    </button>
                  </div>
                </div>
                <div>
                  {searchResults.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "18px 20px", borderBottom: "1px solid #E4E7F2", background: r.selected ? "#F0F4FF" : i % 2 === 0 ? "#FFFFFF" : "#FAFBFF" }}>
                      <input type="checkbox" checked={r.selected} onChange={() => toggleResult(i)}
                        style={{ marginTop: 3, accentColor: "#0891B2", width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <p style={{ fontWeight: 600, color: "#1A2456", fontSize: 14 }}>{r.name}</p>
                          {r.priority_tier === "early_mover" && (
                            <span style={{ background: "#DCFCE7", color: "#15803D", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>Early Mover</span>
                          )}
                          {r.priority_tier === "follower" && (
                            <span style={{ background: "#FEF9C3", color: "#854D0E", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>Follower</span>
                          )}
                          {r.priority_tier === "enabler" && (
                            <span style={{ background: "#EDE9FE", color: "#5B21B6", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>Enabler</span>
                          )}
                          {r.icp_score != null && (
                            <span style={{ fontSize: 13, color: r.icp_score >= 4 ? "#15803D" : r.icp_score === 3 ? "#B45309" : "#DC2626", letterSpacing: 1 }}>
                              {"★".repeat(r.icp_score)}{"☆".repeat(5 - r.icp_score)}
                            </span>
                          )}
                        </div>
                        <a href={safeHref(r.website_url)} target="_blank" rel="noopener noreferrer"
                          style={{ color: "#0891B2", fontSize: 12, marginBottom: 6, display: "inline-block" }}>
                          {r.website_url}
                        </a>
                        <p style={{ fontSize: 13, color: "#4B5563" }}>{r.description}</p>
                        {sourceNameMap[r.name] && (
                          <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                            Source: {sourceNameMap[r.name]}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          fetch("/api/reject", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ names: [r.name] }),
                          });
                          setSearchResults(prev => prev.filter((_, idx) => idx !== i));
                        }}
                        title="Reject company"
                        style={{ background: "transparent", border: "1px solid #E4E7F2", color: "#9CA3AF", padding: "4px 10px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = "#dc2626"; e.currentTarget.style.borderColor = "#dc2626"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; e.currentTarget.style.borderColor = "#E4E7F2"; }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E4E7F2" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <p style={{ fontSize: 13, color: "#6B7280" }}>{selectedCount} {selectedCount === 1 ? "company" : "companies"} selected</p>
                    <button
                      onClick={() => setSearchResults(prev => prev.map(r => ({ ...r, selected: selectedCount < searchResults.length })))}
                      style={{ background: "none", border: "1px solid #C4CAE8", color: "#2E3F80", padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 4 }}>
                      {selectedCount === searchResults.length ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <button onClick={handleAddSelected} disabled={selectedCount === 0}
                    style={{ background: selectedCount > 0 ? "#2E3F80" : "#C4CAE8", color: "#FFFFFF", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: selectedCount > 0 ? "pointer" : "default" }}>
                    Add to Database →
                  </button>
                </div>
              </div>
            )}

            {(addingState === "form" || addingState === "saving") && (
              <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8" }}>
                <div style={{ background: "#0C1C2E", padding: "12px 20px" }}>
                  <p style={{ color: "#FFFFFF", fontSize: 18, fontWeight: 700 }}>Fill in Details</p>
                  <p style={{ color: "#A0BEFF", fontSize: 14, marginTop: 2 }}>Complete the information before adding to the database.</p>
                </div>
                <div style={{ background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", padding: "12px 20px" }}>
                  <p style={{ fontSize: 14, color: "#1E40AF" }}>All pre-filled fields are suggested by the AI agent based on search results — review and override if needed.</p>
                </div>
                {pendingCompanies.map((c, i) => (
                  <div key={i} style={{ padding: "20px", borderBottom: "1px solid #E4E7F2" }}>
                    <p style={{ fontWeight: 700, color: "#1A2456", fontSize: 14, marginBottom: 4 }}>{c.name}</p>
                    <a href={safeHref(c.website_url)} target="_blank" rel="noopener noreferrer" style={{ color: "#0891B2", fontSize: 12 }}>{c.website_url}</a>
                    {c.description && (
                      <p style={{ fontSize: 13, color: "#4B5563", marginTop: 8, lineHeight: 1.6 }}>{c.description}</p>
                    )}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginTop: 14 }}>
                      <div>
                        <label style={labelStyle}>Geography</label>
                        <select value={c.geography} onChange={(e) => updatePending(i, "geography", e.target.value)} style={inputStyle}>
                          <option value="">Select…</option>
                          {GEO_OPTIONS.map(g => <option key={g}>{g}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Product Category</label>
                        <select value={c.product_category} onChange={(e) => updatePending(i, "product_category", e.target.value)} style={inputStyle}>
                          <option value="">Select…</option>
                          {CAT_OPTIONS.map(cat => <option key={cat}>{cat}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Revenue (M EUR)</label>
                        <input type="number" placeholder="Optional" value={c.revenue_meur}
                          onChange={(e) => updatePending(i, "revenue_meur", e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Max. Price</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input type="number" placeholder="Optional" value={c.max_price}
                            onChange={(e) => updatePending(i, "max_price", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                          <select value={c.price_currency ?? ""} onChange={(e) => updatePending(i, "price_currency", e.target.value)} style={{ ...inputStyle, width: 84 }}>
                            <option value="">—</option>
                            <option value="EUR">EUR</option>
                            <option value="GBP">GBP</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <label style={labelStyle}>ICP Fit Score</label>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button key={star} onClick={() => updatePending(i, "icp_fit", star)}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 1px", color: star <= c.icp_fit ? (c.icp_fit >= 4 ? "#15803D" : c.icp_fit === 3 ? "#B45309" : "#DC2626") : "#D1D5DB" }}>
                              ★
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Priority Tier</label>
                        <select value={c.priority_tier ?? ""} onChange={(e) => updatePending(i, "priority_tier", e.target.value)} style={{ ...inputStyle, width: 160 }}>
                          <option value="">Unknown</option>
                          <option value="early_mover">Early Mover</option>
                          <option value="follower">Follower</option>
                          <option value="enabler">Enabler</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
                {saveError && <p style={{ padding: "12px 20px", color: "#dc2626", fontSize: 13 }}>{saveError}</p>}
                <div style={{ padding: "16px 20px", display: "flex", justifyContent: "flex-end", gap: 12 }}>
                  <button onClick={() => setAddingState("idle")} disabled={addingState === "saving"}
                    style={{ background: "transparent", color: "#6B7280", border: "1px solid #D0D5E8", padding: "10px 24px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={addingState === "saving"}
                    style={{ background: addingState === "saving" ? "#A0AECF" : "#0891B2", color: "#FFFFFF", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: addingState === "saving" ? "default" : "pointer" }}>
                    {addingState === "saving" ? "Saving…" : "Confirm & Save →"}
                  </button>
                </div>
              </div>
            )}

            {addingState === "saved" && (
              <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8", padding: "48px 32px", textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#16a34a", marginBottom: 8 }}>Companies added to database</p>
                <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 28 }}>You can find them under the Company Database tab.</p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button onClick={() => { setAddingState("idle"); setAgentState("idle"); }}
                    style={{ background: "transparent", color: "#2E3F80", border: "1px solid #2E3F80", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                    Search Again
                  </button>
                  <button onClick={() => { setAddingState("idle"); setAgentState("idle"); setTab("database"); }}
                    style={{ background: "#0C1C2E", color: "#FFFFFF", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                    Go to Company Database →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {/* ── TAB 3: ICP Criteria ── */}
        {tab === "icp" && (
          <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8" }}>
            <div style={{ background: "#0C1C2E", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 700 }}>Lysoveta ICP Criteria</p>
              <button disabled style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.5)", padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "not-allowed", borderRadius: 4, letterSpacing: "0.04em" }}>
                ✎ Edit Criteria
              </button>
            </div>
            <div style={{ padding: "20px 40px", borderBottom: "1px solid #E4E7F2", background: "#F8F9FC" }}>
              <p style={{ color: "#4B5563", fontSize: 13, lineHeight: 1.6, fontStyle: "italic" }}>
                This document defines the Ideal Customer Profile (ICP) for Lysoveta in Europe. It is used during Step 3 of the enrichment pipeline, where the AI agent evaluates each discovered company against these criteria to assign a priority tier (Early Mover, Follower, or Enabler) and an ICP fit score.
              </p>
            </div>
            <div style={{ padding: "32px 48px", maxWidth: 820 }}>
              {!icpContent ? (
                <p style={{ color: "#A0AECF", fontSize: 14 }}>Laster…</p>
              ) : (() => {
                const toLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                const stripBold = (s: string) => s.replace(/\*\*(.*?)\*\*/g, "$1");
                const isTableRow = (l: string) => l.trim().startsWith("|");
                const isSeparatorRow = (l: string) => /^\|[-| :]+\|$/.test(l.trim());

                const lines = icpContent.split("\n");
                const elements: React.ReactNode[] = [];
                let i = 0;

                while (i < lines.length) {
                  const line = lines[i];

                  // Collect table blocks
                  if (isTableRow(line)) {
                    const tableLines: string[] = [];
                    while (i < lines.length && isTableRow(lines[i])) {
                      tableLines.push(lines[i]);
                      i++;
                    }
                    const rows = tableLines.filter(l => !isSeparatorRow(l));
                    const parseRow = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
                    const [header, ...body] = rows;
                    elements.push(
                      <div key={`table-${i}`} style={{ overflowX: "auto", margin: "16px 0 24px 0" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                          <thead>
                            <tr style={{ background: "#F0F3FA" }}>
                              {parseRow(header).map((cell, ci) => (
                                <th key={ci} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: "#1A2456", borderBottom: "2px solid #D0D5E8", whiteSpace: "nowrap" }}>{stripBold(cell)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {body.map((row, ri) => (
                              <tr key={ri} style={{ borderBottom: "1px solid #E9ECF5", background: ri % 2 === 0 ? "#FFFFFF" : "#F8F9FC" }}>
                                {parseRow(row).map((cell, ci) => (
                                  <td key={ci} style={{ padding: "9px 14px", color: ci === 0 && cell ? "#1A2456" : "#374151", fontWeight: ci === 0 && cell ? 600 : 400 }}>{stripBold(cell)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                    continue;
                  }

                  if (line.startsWith("# ")) { elements.push(<h1 key={i} style={{ fontSize: 24, fontWeight: 700, color: "#1A2456", marginBottom: 4, marginTop: 0 }}>{line.slice(2)}</h1>); }
                  else if (line.startsWith("## ")) { elements.push(<h2 key={i} style={{ fontSize: 18, fontWeight: 700, color: "#1A2456", marginTop: 32, marginBottom: 4 }}>{line.slice(3)}</h2>); }
                  else if (line.startsWith("### ")) { elements.push(<h3 key={i} style={{ fontSize: 16, fontWeight: 700, color: "#2E3F80", marginTop: 22, marginBottom: 4 }}>{toLabel(line.slice(4))}</h3>); }
                  else if (line.startsWith("---")) { elements.push(<div key={i} style={{ height: 4 }} />); }
                  else if (line.startsWith("- ")) {
                    elements.push(
                      <p key={i} style={{ fontSize: 15, color: "#374151", margin: "4px 0", paddingLeft: 20, position: "relative", lineHeight: 1.7 }}>
                        <span style={{ position: "absolute", left: 0, color: "#2E3F80", fontWeight: 700 }}>·</span>{stripBold(line.slice(2))}
                      </p>
                    );
                  }
                  else if (line.startsWith("**") && line.endsWith("**")) { elements.push(<p key={i} style={{ fontSize: 15, fontWeight: 700, color: "#1A2456", marginTop: 14, marginBottom: 2 }}>{line.slice(2, -2)}</p>); }
                  else if (line === "") { elements.push(<div key={i} style={{ height: 4 }} />); }
                  else { elements.push(<p key={i} style={{ fontSize: 15, color: "#374151", lineHeight: 1.75, margin: "3px 0" }}>{stripBold(line)}</p>); }

                  i++;
                }
                return elements;
              })()}
            </div>
          </div>
        )}

      </div>

      <footer style={{ borderTop: "1px solid #D0D5E8", padding: "16px 32px", background: "#FFFFFF" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#A0AECF" }}>Aker BioMarine — Internal Tool</p>
      </footer>
    </div>
  );
}
