"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { US_MARKET_ENABLED } from "@/lib/features";
import mockResultsData from "@/config/mock-results.json";
import { DEMO_MODE, SEARCH_TERM_OPTIONS, SOURCE_OPTIONS } from "@/lib/uiConstants";
import { parseMulti, joinMulti } from "@/lib/format";
import type {
  SearchResult, PendingCompany,
  SourceFields, SourceRecord, DraftTerm, DraftSource,
} from "@/lib/uiTypes";

// Owns the entire "Find New Companies" domain: search configuration (sources/terms draft
// editing), the background agent search job (start + poll), the discovery queue, result
// review + save, and the shared source-performance settings/helpers.
// reloadCompanies is called after a save so the Company Database view stays in sync.
export function useSearch(reloadCompanies: () => Promise<void> | void) {
  // --- Search tab state ---
  const [agentState, setAgentState] = useState<"idle" | "stale_warning" | "searching" | "done" | "error">("idle")
  const [agentError, setAgentError] = useState<{ title: string; detail: string; canRetry: boolean } | null>(null)
  const [staleCompanies, setStaleCompanies] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [pendingCompanies, setPendingCompanies] = useState<PendingCompany[]>([]);
  const [addingState, setAddingState] = useState<"idle" | "form" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState("");
  const [sourceNameMap, setSourceNameMap] = useState<Record<string, string>>({});

  // --- Search configuration (read from the DB, editable in the app) ---
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  // Target market — a soft geography steer for discovery (not a hard filter). "both" = no steer.
  // While US support is off, this is locked to Europe (the selector is shown but disabled).
  const [targetMarket, setTargetMarket] = useState<"eu" | "us" | "both">(US_MARKET_ENABLED ? "both" : "eu");
  // Search config read from the DB on mount; initialised from the sources.json-derived
  // defaults so there's something before the fetch resolves (and as a fallback).
  const [sourceOptions, setSourceOptions] = useState(SOURCE_OPTIONS);
  const [termOptions, setTermOptions] = useState(SEARCH_TERM_OPTIONS);
  // Edit mode: a local DRAFT of the config. Nothing is written to the DB until "Save changes".
  const [configEditMode, setConfigEditMode] = useState(false);
  // Full DB records (with ids) — the baseline the draft is diffed against on save.
  const [termRecords, setTermRecords] = useState<{ id: number; term: string; is_default: boolean }[]>([]);
  const [sourceRecords, setSourceRecords] = useState<SourceRecord[]>([]);
  const [draftTerms, setDraftTerms] = useState<DraftTerm[]>([]);
  const [draftSources, setDraftSources] = useState<DraftSource[]>([]);
  const keyRef = useRef(0);
  const nextKey = () => `k${keyRef.current++}`;
  // Add/edit-source modal — edits the DRAFT, not the DB. editingSourceKey === null means "add new".
  const [newSource, setNewSource] = useState<SourceFields>({ name: "", type: "web site", url: "", search_prefix: "", note: "", market: "" });
  const [editingSourceKey, setEditingSourceKey] = useState<string | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceInfoOpen, setSourceInfoOpen] = useState(false);
  const [termsExpanded, setTermsExpanded] = useState(false);
  // Per source-type column (Website / Single page / YouTube) expand state, keyed by heading.
  const [expandedSourceGroups, setExpandedSourceGroups] = useState<Record<string, boolean>>({});
  const toggleSourceGroup = (h: string) => setExpandedSourceGroups(prev => ({ ...prev, [h]: !prev[h] }));
  const [configBusy, setConfigBusy] = useState(false);
  const [configError, setConfigError] = useState("");

  // --- Background search job (start + poll) ---
  const [searchProgress, setSearchProgress] = useState("");
  const [activeSearchJobId, setActiveSearchJobId] = useState<number | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  // Pending companies in the discovery queue. If >= 5, Step 1 (discovery) is skipped, so a run
  // won't search newly selected sources/terms — surfaced as a warning in the UI.
  const [pendingQueueCount, setPendingQueueCount] = useState<number | null>(null);
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [clearingQueue, setClearingQueue] = useState(false);
  // Source-performance warning thresholds (shared, from app_settings). A source is flagged when its
  // hit rate (companies found ÷ times used) falls below warnThresholdPct %, once it has been used at
  // least warnMinUses times. Editable in the Source performance modal.
  const [warnThresholdPct, setWarnThresholdPct] = useState(1);
  const [warnMinUses, setWarnMinUses] = useState(5);
  const [perfModalOpen, setPerfModalOpen] = useState(false);
  const [perfDraftPct, setPerfDraftPct] = useState("1");
  const [perfDraftMin, setPerfDraftMin] = useState("5");
  const [perfSaving, setPerfSaving] = useState(false);
  // The threshold is read-only by default; editing is revealed inline (no nested modal) by the
  // "Edit hit rate threshold" button.
  const [perfEditThreshold, setPerfEditThreshold] = useState(false);
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

  // Which of the 3 steps are we on? (1 = discovery, 2 = enrichment, 3 = ICP matching)
  // While the job is still running, drive the indicator from the progress message: "evaluat…" →
  // step 3 (automatic ICP matching), "enrich…" → step 2, otherwise step 1.
  const currentStep = agentState === "done"
    ? 3
    : searchProgress.toLowerCase().includes("evaluat") ? 3
    : searchProgress.toLowerCase().includes("enrich") ? 2 : 1;
  const elapsedLabel = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;

  // Loads the search config (sources + terms) from the DB into the full records (with ids) and the
  // derived selection lists. On a read error it leaves state untouched, so a transient failure never
  // wipes the list. Stale selections (renamed/removed items) are pruned.
  async function loadSearchConfig() {
    const [{ data: srcs }, { data: terms }] = await Promise.all([
      supabase.from("sources").select("*").eq("active", true).order("id"),
      supabase.from("search_terms").select("id, term, is_default").eq("active", true).order("id"),
    ]);
    if (srcs) {
      const recs: SourceRecord[] = srcs.map((s: { id: number; name: string; type: string | null; url: string | null; search_prefix: string | null; note: string | null; market?: string | null; times_used?: number | null; companies_found?: number | null }) => ({
        id: s.id, name: s.name, type: (s.type ?? "web site") as "web site" | "web page" | "youtube",
        url: s.url ?? "", search_prefix: s.search_prefix ?? "", note: s.note ?? "", market: s.market ?? "",
        times_used: s.times_used ?? 0, companies_found: s.companies_found ?? 0,
      }));
      setSourceRecords(recs);
      setSourceOptions(recs.map(s => ({ name: s.name, type: s.type, url: s.url, market: s.market, times_used: s.times_used, companies_found: s.companies_found })));
      setSelectedSources(prev => prev.filter(n => recs.some(r => r.name === n)));
    }
    if (terms) {
      const recs = terms.map((t: { id: number; term: string; is_default: boolean }) => ({ id: t.id, term: t.term, is_default: t.is_default }));
      setTermRecords(recs);
      setTermOptions(recs.map(t => t.term));
      setSelectedTerms(prev => prev.filter(x => recs.some(r => r.term === x)));
    }
  }

  // --- Draft editing (local until "Save changes") ---
  function enterConfigEdit() {
    setDraftTerms(termRecords.map(t => ({ key: nextKey(), id: t.id, term: t.term, is_default: t.is_default })));
    setDraftSources(sourceRecords.map(s => ({ key: nextKey(), id: s.id, name: s.name, type: s.type, url: s.url, search_prefix: s.search_prefix, note: s.note, market: s.market })));
    setConfigError("");
    setConfigEditMode(true);
  }
  function cancelConfigEdit() {
    setConfigEditMode(false);
    setSourceModalOpen(false);
    setConfigError("");
  }
  const updateDraftTerm = (key: string, term: string) => setDraftTerms(prev => prev.map(t => t.key === key ? { ...t, term } : t));
  const removeDraftTerm = (key: string) => setDraftTerms(prev => prev.filter(t => t.key !== key));
  const addDraftTerm = () => setDraftTerms(prev => [...prev, { key: nextKey(), id: null, term: "", is_default: false }]);
  const removeDraftSource = (key: string) => setDraftSources(prev => prev.filter(s => s.key !== key));
  function openAddSource() {
    setNewSource({ name: "", type: "web site", url: "", search_prefix: "", note: "", market: "" });
    setEditingSourceKey(null); setConfigError(""); setSourceInfoOpen(false); setSourceModalOpen(true);
  }
  function openEditSource(s: DraftSource) {
    setNewSource({ name: s.name, type: s.type, url: s.url, search_prefix: s.search_prefix, note: s.note, market: s.market });
    setEditingSourceKey(s.key); setConfigError(""); setSourceInfoOpen(false); setSourceModalOpen(true);
  }
  // Modal "Done" — validate the single source and write it into the draft (no DB call).
  function applySource() {
    const name = newSource.name.trim();
    if (!name) { setConfigError("Name is required."); return; }
    if (newSource.type === "web site" && !newSource.search_prefix.trim()) { setConfigError("A website source needs a search prefix (e.g. nutraingredients.com)."); return; }
    if (newSource.type === "web page" && !newSource.url.trim()) { setConfigError("A single-page source needs a URL."); return; }
    const keepPrefix = newSource.type === "web site" || newSource.type === "youtube";
    const fields: SourceFields = { name, type: newSource.type, url: newSource.type === "youtube" ? "" : newSource.url.trim(), search_prefix: keepPrefix ? newSource.search_prefix.trim() : "", note: newSource.note.trim(), market: newSource.market };
    if (editingSourceKey) setDraftSources(prev => prev.map(s => s.key === editingSourceKey ? { ...s, ...fields } : s));
    else setDraftSources(prev => [...prev, { key: nextKey(), id: null, ...fields }]);
    setSourceModalOpen(false); setConfigError("");
  }

  // Diff the draft against the loaded records and apply inserts/updates/deletes in one go.
  async function saveConfig() {
    if (configBusy) return;
    const terms = draftTerms.map(t => ({ ...t, term: t.term.trim() }));
    if (terms.some(t => !t.term)) { setConfigError("Search terms can't be empty — remove the blank one or fill it in."); return; }
    if (new Set(terms.map(t => t.term.toLowerCase())).size !== terms.length) { setConfigError("Two search terms are identical."); return; }
    const srcs = draftSources;
    if (srcs.some(s => !s.name.trim())) { setConfigError("Every source needs a name."); return; }
    if (new Set(srcs.map(s => s.name.trim().toLowerCase())).size !== srcs.length) { setConfigError("Two sources have the same name."); return; }

    setConfigBusy(true); setConfigError("");
    try {
      // TERMS diff
      const draftTermIds = new Set(terms.filter(t => t.id != null).map(t => t.id));
      const termDeletes = termRecords.filter(r => !draftTermIds.has(r.id)).map(r => r.id);
      const termInserts = terms.filter(t => t.id == null).map(t => ({ term: t.term, is_default: t.is_default }));
      const termUpdates = terms.filter(t => t.id != null).filter(t => { const o = termRecords.find(r => r.id === t.id); return o && o.term !== t.term; });
      // SOURCES diff
      const toRow = (s: SourceFields) => ({ type: s.type, name: s.name.trim(), url: s.url.trim() || null, search_prefix: (s.type === "web site" || s.type === "youtube") ? (s.search_prefix.trim() || null) : null, note: s.note.trim() || null, market: s.market.trim() || null });
      const draftSrcIds = new Set(srcs.filter(s => s.id != null).map(s => s.id));
      const srcDeletes = sourceRecords.filter(r => !draftSrcIds.has(r.id)).map(r => r.id);
      const srcInserts = srcs.filter(s => s.id == null).map(toRow);
      const srcUpdates = srcs.filter(s => s.id != null).filter(s => {
        const o = sourceRecords.find(r => r.id === s.id);
        if (!o) return false;
        return o.name !== s.name.trim() || o.type !== s.type || o.url !== s.url.trim()
          || o.search_prefix !== ((s.type === "web site" || s.type === "youtube") ? s.search_prefix.trim() : "") || o.note !== s.note.trim() || o.market !== s.market.trim();
      });

      // Deletes first, so a rename/re-add can reuse a freed unique name.
      if (termDeletes.length) { const { error } = await supabase.from("search_terms").delete().in("id", termDeletes); if (error) throw error; }
      if (srcDeletes.length) { const { error } = await supabase.from("sources").delete().in("id", srcDeletes); if (error) throw error; }
      if (termInserts.length) { const { error } = await supabase.from("search_terms").insert(termInserts); if (error) throw error; }
      if (srcInserts.length) { const { error } = await supabase.from("sources").insert(srcInserts); if (error) throw error; }
      for (const t of termUpdates) { const { error } = await supabase.from("search_terms").update({ term: t.term }).eq("id", t.id!); if (error) throw error; }
      for (const s of srcUpdates) { const { error } = await supabase.from("sources").update(toRow(s)).eq("id", s.id!); if (error) throw error; }

      await loadSearchConfig();
      setConfigEditMode(false);
      setSourceModalOpen(false);
    } catch (e) {
      setConfigError(`Could not save: ${(e as { message?: string })?.message ?? "unknown error"}`);
    }
    setConfigBusy(false);
  }

  // How many companies are still queued for research (Step 1 is skipped while this is >= 5).
  async function loadPendingCount() {
    const { count } = await supabase.from("discovery_queue").select("*", { count: "exact", head: true }).eq("status", "pending");
    setPendingQueueCount(count ?? 0);
  }
  // Empties the pending waiting list so the next search runs discovery on the user's selected
  // sources/terms. Discards not-yet-researched discoveries (they may be found again later).
  async function clearQueue() {
    setClearingQueue(true);
    await supabase.from("discovery_queue").delete().eq("status", "pending");
    await loadPendingCount();
    setClearingQueue(false);
  }

  // --- Source-performance settings (shared thresholds in app_settings) ---
  async function loadSettings() {
    const { data } = await supabase.from("app_settings").select("key, value");
    if (!data) return;
    const map = new Map(data.map((r: { key: string; value: string }) => [r.key, r.value]));
    const pct = Number(map.get("source_warn_threshold_pct"));
    const min = Number(map.get("source_warn_min_uses"));
    if (Number.isFinite(pct)) { setWarnThresholdPct(pct); setPerfDraftPct(String(pct)); }
    if (Number.isFinite(min)) { setWarnMinUses(min); setPerfDraftMin(String(min)); }
  }

  async function saveSettings() {
    const pct = Math.max(0, Number(perfDraftPct));
    const min = Math.max(0, Math.round(Number(perfDraftMin)));
    if (!Number.isFinite(pct) || !Number.isFinite(min)) return;
    setPerfSaving(true);
    await supabase.from("app_settings").upsert([
      { key: "source_warn_threshold_pct", value: String(pct), updated_at: new Date().toISOString() },
      { key: "source_warn_min_uses", value: String(min), updated_at: new Date().toISOString() },
    ], { onConflict: "key" });
    setWarnThresholdPct(pct); setWarnMinUses(min);
    setPerfSaving(false);
  }

  // Hit rate = companies found ÷ times used (as a fraction; ×100 for a %). null until the source has
  // been used. A source is "low" once it has enough uses and its hit rate is below the threshold.
  const sourceHitRate = (times_used: number, companies_found: number): number | null =>
    times_used > 0 ? companies_found / times_used : null;
  const sourceIsLow = (times_used: number, companies_found: number): boolean => {
    if (times_used < warnMinUses) return false;
    const hr = sourceHitRate(times_used, companies_found);
    return hr !== null && hr * 100 < warnThresholdPct;
  };
  const fmtHitRate = (times_used: number, companies_found: number): string => {
    const hr = sourceHitRate(times_used, companies_found);
    if (hr === null) return "—";
    const pct = hr * 100;
    return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
  };
  // Saved rate = approved companies ÷ times used, as a % — a quality parameter only (NOT used for the
  // warning). Guarded against divide-by-zero: returns "—" until the source has been used.
  const fmtSavedRate = (times_used: number, saved: number): string => {
    if (times_used <= 0) return "—";
    const pct = (saved / times_used) * 100;
    return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
  };

  useEffect(() => {
    loadSearchConfig();
    loadPendingCount();
    loadSettings();
  }, []);

  // Refresh the queue count whenever we return to an idle/finished state (e.g. after a search).
  useEffect(() => {
    if (agentState === "idle" || agentState === "done" || agentState === "stale_warning") loadPendingCount();
  }, [agentState]);

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
    setAddingState("idle");
    setPendingCompanies([]);

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
      const res = await fetch(`${workerBase}/api/search/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchConcepts: selectedTerms, sourceNames: selectedSources, targetMarket }),
      });
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

      // Clear any timers left over from a previous run BEFORE starting new ones. stopPolling()
      // clears both the poll AND the elapsed intervals, so it must run first — calling it after
      // starting the elapsed timer (as before) killed the counter immediately, freezing it at 0:00.
      stopPolling();

      // Start the elapsed-time counter (updates every second).
      startMsRef.current = Date.now();
      setElapsedSec(0);
      elapsedRef.current = setInterval(() => {
        if (startMsRef.current) setElapsedSec(Math.floor((Date.now() - startMsRef.current) / 1000));
      }, 1000);

      // Poll the job row (and its log) every 3 seconds until it finishes.
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
          // Step 3 succeeded → jump straight to the selectable results. If it's null, scoring didn't
          // complete; the enriched companies are saved, so the user can just search again to re-score.
          const autoResults = (job.results ?? null) as SearchResult[] | null;
          if (autoResults) {
            setSearchResults(autoResults.map((r) => ({ ...r, selected: false })));
            setAgentState("done");
          } else {
            setAgentError({
              title: "Scoring didn’t complete",
              detail: "The companies were researched and saved, but the ICP scoring step didn’t finish. Nothing is lost — search again to score them (already-researched companies are reused, so it’s quick).",
              canRetry: true,
            });
            setAgentState("error");
          }
        } else if (job.status === "no_companies") {
          stopPolling();
          setAgentError({
            title: "No new companies found",
            detail: "The search found no companies that aren't already in the database, rejected, or in the queue. This may mean the sources haven't published anything new, or the search terms keep hitting the same companies. Consider adjusting the sources or search terms in the Search Configuration panel (Edit), or try again later.",
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

  function toggleResult(i: number) {
    setSearchResults(prev => prev.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r));
  }

  function handleAddSelected() {
    const selected = searchResults.filter(r => r.selected);
    setPendingCompanies(selected.map(r => ({
      ...r,
      geography: parseMulti(r.geography),
      product_category: parseMulti(r.product_category),
      max_price: r.max_price_eur != null ? String(r.max_price_eur) : "",
      icp_fit: r.icp_score ?? 3,
    })));
    setAddingState("form");
  }

  function updatePending(i: number, field: string, value: string | number | string[]) {
    setPendingCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }

  async function handleSave() {
    setAddingState("saving");
    setSaveError("");
    const rows = pendingCompanies.map(c => ({
      name: c.name,
      website_url: c.website_url,
      description: c.description,
      geography: joinMulti(c.geography),
      product_category: joinMulti(c.product_category),
      max_price: c.max_price ? Number(c.max_price) : null,
      price_currency: c.price_currency || null,
      icp_fit: c.icp_fit,
      priority_tier: c.priority_tier ?? null,
      added: true,
      added_at: new Date().toISOString(),
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
      await reloadCompanies();

      setAddingState("saved");
      setSearchResults([]);
      setAgentState("idle");
    }
  }

  const selectedCount = searchResults.filter(r => r.selected).length;

  return {
    // search job state
    agentState, setAgentState, agentError, setAgentError, staleCompanies, setStaleCompanies,
    searchResults, setSearchResults, pendingCompanies, addingState, setAddingState,
    saveError, sourceNameMap,
    // config state
    selectedTerms, setSelectedTerms, selectedSources, setSelectedSources,
    targetMarket, setTargetMarket, sourceOptions, termOptions,
    configEditMode, draftTerms, draftSources,
    newSource, setNewSource, editingSourceKey,
    sourceModalOpen, setSourceModalOpen, sourceInfoOpen, setSourceInfoOpen,
    termsExpanded, setTermsExpanded, expandedSourceGroups, toggleSourceGroup,
    configBusy, configError, setConfigError,
    // background job / log / queue
    searchProgress, activeSearchJobId, logLines, showLog, setShowLog,
    pendingQueueCount, queueModalOpen, setQueueModalOpen, clearingQueue,
    // perf settings
    warnThresholdPct, warnMinUses, perfModalOpen, setPerfModalOpen,
    perfDraftPct, setPerfDraftPct, perfDraftMin, setPerfDraftMin,
    perfSaving, perfEditThreshold, setPerfEditThreshold,
    elapsedSec,
    // derived
    currentStep, elapsedLabel, selectedCount,
    // config handlers
    enterConfigEdit, cancelConfigEdit, updateDraftTerm, removeDraftTerm, addDraftTerm,
    removeDraftSource, openAddSource, openEditSource, applySource, saveConfig,
    // queue / settings handlers
    loadPendingCount, clearQueue, saveSettings,
    // helpers
    sourceHitRate, sourceIsLow, fmtHitRate, fmtSavedRate,
    // job handlers
    deleteFromQueue, resetProcessingToQueue, handleAgentSearch,
    toggleResult, handleAddSelected, updatePending, handleSave,
  };
}

export type SearchApi = ReturnType<typeof useSearch>;
