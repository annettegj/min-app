"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { US_MARKET_ENABLED } from "@/lib/features";
import mockResultsData from "@/config/mock-results.json";
import { MarketBadge } from "@/app/components/common/MarketBadge";
import { AuthScreen } from "@/app/components/common/AuthScreen";
import { HowItWorksTab } from "@/app/components/about/HowItWorksTab";
import { QueueModal } from "@/app/components/search/QueueModal";
import { SourcePerfModal } from "@/app/components/search/SourcePerfModal";
import { SourceModal } from "@/app/components/search/SourceModal";
import { IcpTab } from "@/app/components/icp/IcpTab";
import { CompanyDatabaseTab } from "@/app/components/database/CompanyDatabaseTab";
import { useCompanies } from "@/app/hooks/useCompanies";
import { inputStyle, labelStyle, btnPrimary, btnSecondary, addBtnStyle, hintStyle, reqStyle, optStyle } from "@/lib/styles";
import { safeHref } from "@/lib/format";
import {
  DEMO_MODE, SEARCH_DISABLED, GEO_OPTIONS, CAT_OPTIONS,
  SEARCH_TERM_OPTIONS, SOURCE_OPTIONS, AUTH_KEY, AUTH_MAX_AGE,
} from "@/lib/uiConstants";
import type {
  SearchResult, PendingCompany,
  SourceFields, SourceRecord, DraftTerm, DraftSource,
} from "@/lib/uiTypes";

export default function Home() {
  // Simple pilot login. undefined = still checking localStorage; null = logged out; string = email.
  const [authEmail, setAuthEmail] = useState<string | null | undefined>(undefined);
  const [tab, setTab] = useState<"database" | "search" | "icp" | "prospectus" | "about">("database");

  // --- Company Database domain (state + handlers) ---
  const companiesApi = useCompanies();
  const { savedBySource, loadCompanies } = companiesApi;

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


  // --- Simple pilot login (against the plain app_users table; not secure) ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) {
        const { email, loginAt } = JSON.parse(raw) as { email?: string; loginAt?: number };
        if (email && loginAt && Date.now() - loginAt < AUTH_MAX_AGE) { setAuthEmail(email); return; }
        localStorage.removeItem(AUTH_KEY); // expired (>2 weeks)
      }
    } catch { /* ignore */ }
    setAuthEmail(null);
  }, []);

  async function login(email: string, password: string): Promise<string | null> {
    const e = email.trim().toLowerCase();
    const { data, error } = await supabase.from("app_users").select("email").eq("email", e).eq("password", password).maybeSingle();
    if (error) return "Something went wrong — please try again.";
    if (!data) return "Wrong email or password.";
    localStorage.setItem(AUTH_KEY, JSON.stringify({ email: e, loginAt: Date.now() }));
    setAuthEmail(e);
    return null;
  }
  async function signup(email: string, password: string): Promise<string | null> {
    const e = email.trim().toLowerCase();
    const { data: existing } = await supabase.from("app_users").select("email").eq("email", e).maybeSingle();
    if (existing) return "That email already has an account — log in instead.";
    const { error } = await supabase.from("app_users").insert({ email: e, password });
    if (error) return "Could not create the account — please try again.";
    localStorage.setItem(AUTH_KEY, JSON.stringify({ email: e, loginAt: Date.now() }));
    setAuthEmail(e);
    return null;
  }
  function logout() {
    localStorage.removeItem(AUTH_KEY);
    setAuthEmail(null);
  }

  // Per-source count of approved companies in the database (Z in "used X · queued Y · saved Z").
  // Computed live from the loaded companies grouped by source_name — no stored counter, so it can
  // never drift. Companies saved before source_name was tracked simply don't count.
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

  // --- ICP documents (DB-editable, fall back to config files) ---
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
      geography: r.geography ?? "",
      product_category: r.product_category ?? "",
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
      await loadCompanies();

      setAddingState("saved");
      setSearchResults([]);
      setAgentState("idle");
    }
  }

  const selectedCount = searchResults.filter(r => r.selected).length;

  if (authEmail === undefined) return null; // still checking localStorage
  if (!authEmail) return <AuthScreen onLogin={login} onSignup={signup} />;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--page)", fontFamily: "Inter, sans-serif" }}>

      {/* Top bar */}
      <div style={{ background: "var(--header)", borderBottom: "3px solid var(--accent)" }}>
        <div className="max-w-screen-2xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex flex-col gap-2" style={{ alignItems: "flex-start" }}>
            <img src="/AKBM logo.png" alt="Aker BioMarine" style={{ height: 52, width: "auto", objectFit: "contain", display: "block" }} />
            <p style={{ color: "var(--white)", fontSize: 20, fontWeight: 700, letterSpacing: "0.01em", marginLeft: 10 }}>Lysoveta Customer Finder</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "var(--on-dark)", fontSize: 12 }}>{authEmail}</span>
            <button type="button" onClick={logout}
              style={{ background: "transparent", color: "var(--white)", border: "1px solid var(--border-on-dark)", borderRadius: 4, padding: "6px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", cursor: "pointer" }}>
              Log out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-screen-2xl mx-auto px-8 flex">
          <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
            {[
              { key: "database", label: "Company Database", soon: false },
              { key: "search", label: "Find New Companies", soon: false },
              { key: "icp", label: "Lysoveta ICP Criteria", soon: false },
              { key: "about", label: "How It Works", soon: false },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as "database" | "search" | "icp" | "prospectus" | "about")}
                style={{
                  padding: "10px 20px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                  borderRadius: 4,
                  background: tab === t.key ? "var(--page)" : "transparent",
                  color: tab === t.key ? "var(--navy)" : "var(--text-faint)",
                  borderTop: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
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
                  borderRadius: 4,
                  background: "transparent", color: "var(--text-disabled)",
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
        {tab === "database" && <CompanyDatabaseTab api={companiesApi} />}

        {/* ── TAB 2: Find New Companies ── */}
        {/* Narrower, centered column for this tab only — the top bar stays full-width. */}
        {tab === "search" && (
          <div style={{ maxWidth: 1180, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Live search log — mirrors the server log, so no need to open the Render dashboard */}
            {activeSearchJobId != null && logLines.length > 0 && (
              <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                <div onClick={() => setShowLog(!showLog)}
                  style={{ background: "var(--header)", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                  <p style={{ color: "var(--white)", fontSize: 13, fontWeight: 700 }}>Search Log</p>
                  <span style={{ color: "var(--on-dark)", fontSize: 12 }}>{showLog ? "Hide ▴" : "Show ▾"} ({logLines.length})</span>
                </div>
                {showLog && (
                  <pre style={{ margin: 0, padding: "14px 20px", fontSize: 12, fontFamily: "monospace", color: "var(--text)", background: "var(--surface-code)", maxHeight: 340, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {logLines.join("\n")}
                  </pre>
                )}
              </div>
            )}

            {agentState === "idle" && addingState !== "saved" && (
              <>
                {/* Search configuration — read from the DB; editable in place (Edit toggle) */}
                <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ background: "var(--header)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Search Configuration</p>
                    {!configEditMode && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button type="button" onClick={() => { setPerfDraftPct(String(warnThresholdPct)); setPerfDraftMin(String(warnMinUses)); setPerfEditThreshold(false); setPerfModalOpen(true); }}
                          style={{ background: "transparent", color: "var(--white)", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 4, padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer" }}>
                          Source performance
                        </button>
                        <button type="button" onClick={enterConfigEdit}
                          style={{ background: "var(--accent)", color: "var(--white)", border: "none", borderRadius: 4, padding: "6px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer" }}>
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                  {configEditMode && (
                    <div style={{ background: "var(--banner-warn-bg)", borderBottom: "1px solid var(--banner-warn-border)", padding: "10px 20px" }}>
                      <p style={{ fontSize: 12, color: "var(--banner-warn-text)" }}>
                        Editing the shared configuration. Click a term or source to change its fields; nothing is saved until you press <strong>Save changes</strong>. Saved changes affect every search, for everyone.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-4" style={{ padding: "20px", gap: 32 }}>
                    {/* Search terms */}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <label style={labelStyle}>{configEditMode ? "Search terms" : "Search terms (choose up to 3)"}</label>
                      {configEditMode ? (
                        <>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4, maxHeight: 320, overflowY: "auto", paddingRight: 6 }}>
                            {draftTerms.map(t => (
                              <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <button type="button" title="Remove term" onClick={() => removeDraftTerm(t.key)}
                                  style={{ background: "transparent", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>✕</button>
                                <input type="text" value={t.term} onChange={e => updateDraftTerm(t.key, e.target.value)}
                                  placeholder="Search term" style={{ ...inputStyle, flex: 1 }} />
                              </div>
                            ))}
                            {draftTerms.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>No search terms yet — add one below.</p>}
                          </div>
                          <div style={{ marginTop: "auto", paddingTop: 12 }}>
                            <button type="button" onClick={addDraftTerm} style={addBtnStyle}>+ Add new search term</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4, maxHeight: termsExpanded ? "none" : 232, overflowY: termsExpanded ? "visible" : "auto", paddingRight: 6 }}>
                            {termOptions.map(t => {
                              const checked = selectedTerms.includes(t);
                              const atMax = selectedTerms.length >= 3;
                              return (
                                <label key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: checked || !atMax ? "var(--text)" : "var(--text-faint)", cursor: checked || !atMax ? "pointer" : "default" }}>
                                  <input type="checkbox" checked={checked} disabled={!checked && atMax}
                                    onChange={() => setSelectedTerms(checked ? selectedTerms.filter(x => x !== t) : [...selectedTerms, t])}
                                    style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
                                  {t}
                                </label>
                              );
                            })}
                          </div>
                          {termOptions.length > 8 && (
                            <button type="button" onClick={() => setTermsExpanded(v => !v)}
                              style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "6px 0", marginTop: 4, textAlign: "left" }}>
                              {termsExpanded ? "Show fewer ▴" : `Show all ${termOptions.length} ▾`}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {/* Sources — spans 3 of the 4 columns so the type groups sit side by side */}
                    <div className="md:col-span-3" style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>{configEditMode ? "Sources" : "Sources (choose up to 4)"}</label>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}><strong>Website</strong> = a whole site · <strong>Single page</strong> = one specific URL</span>
                      </div>
                      {configEditMode ? (
                        <>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 6 }}>
                            {draftSources.map(s => (
                              <div key={s.key} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                <button type="button" title="Remove source" onClick={() => removeDraftSource(s.key)}
                                  style={{ background: "transparent", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1, padding: "2px 6px", borderRadius: 4, marginTop: 7, flexShrink: 0 }}>✕</button>
                                <button type="button" onClick={() => openEditSource(s)}
                                  style={{ flex: 1, textAlign: "left", background: "var(--surface-input)", border: "1px solid var(--border-input)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", color: "var(--navy)" }}>
                                  <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name || "(unnamed source)"}</span>
                                  <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginTop: 2, wordBreak: "break-all" }}>
                                    {s.type === "web page" ? "Single page" : s.type === "youtube" ? "YouTube" : "Website"}
                                    {s.type === "web page" && s.url ? ` · ${s.url.replace(/^https?:\/\//, "")}` : ""}
                                    {(s.type === "web site" || s.type === "youtube") && s.search_prefix ? ` · ${s.search_prefix}` : ""}
                                    {s.market ? ` · ${s.market}` : ""}
                                    <span style={{ color: "var(--accent)", fontWeight: 700 }}> · Edit ✎</span>
                                  </span>
                                </button>
                              </div>
                            ))}
                            {draftSources.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>No sources yet — add one below.</p>}
                          </div>
                          <div style={{ marginTop: "auto", paddingTop: 14 }}>
                            <button type="button" onClick={openAddSource} style={addBtnStyle}>+ Add new source</button>
                          </div>
                        </>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 20, marginTop: 4 }}>
                          {[
                            { heading: "Website", items: sourceOptions.filter(s => (s.type ?? "web site") === "web site") },
                            { heading: "Single page", items: sourceOptions.filter(s => s.type === "web page") },
                            { heading: "YouTube", items: sourceOptions.filter(s => s.type === "youtube") },
                          ].map(group => {
                            if (group.items.length === 0) return null;
                            const expanded = !!expandedSourceGroups[group.heading];
                            return (
                              <div key={group.heading}>
                                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>{group.heading}</p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: expanded ? "none" : 200, overflowY: expanded ? "visible" : "auto", paddingRight: 4 }}>
                                  {group.items.map(s => {
                                    const isPage = s.type === "web page";
                                    const checked = selectedSources.includes(s.name);
                                    const atMax = selectedSources.length >= 4;
                                    return (
                                      <label key={s.name} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: checked || !atMax ? "var(--text)" : "var(--text-faint)", cursor: checked || !atMax ? "pointer" : "default" }}>
                                        <input type="checkbox" checked={checked} disabled={!checked && atMax}
                                          onChange={() => setSelectedSources(checked ? selectedSources.filter(x => x !== s.name) : [...selectedSources, s.name])}
                                          style={{ accentColor: "var(--accent)", width: 15, height: 15, marginTop: 2, flexShrink: 0 }} />
                                        <span>
                                          {s.name}<MarketBadge market={s.market} />
                                          {isPage && s.url && (
                                            <a href={/^https?:\/\//.test(s.url) ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer"
                                              onClick={e => e.stopPropagation()}
                                              style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginTop: 1, wordBreak: "break-all", textDecoration: "underline" }}>
                                              {s.url.replace(/^https?:\/\//, "")}
                                            </a>
                                          )}
                                          <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>
                                            {s.times_used > 0 || s.companies_found > 0 || (savedBySource.get(s.name) ?? 0) > 0
                                              ? `used ${s.times_used} · queued ${s.companies_found} · saved ${savedBySource.get(s.name) ?? 0}`
                                              : "Not used yet"}
                                          </span>
                                          {sourceIsLow(s.times_used, s.companies_found) && (
                                            <span style={{ display: "block", fontSize: 10.5, color: "var(--danger-text)", fontWeight: 700, marginTop: 2 }}>
                                              ⚠ Low hit rate ({fmtHitRate(s.times_used, s.companies_found)}) — consider editing or removing
                                            </span>
                                          )}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                                {group.items.length > 4 && (
                                  <button type="button" onClick={() => toggleSourceGroup(group.heading)}
                                    style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: "6px 0 0", textAlign: "left" }}>
                                    {expanded ? "Show fewer ▴" : `Show all ${group.items.length} ▾`}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  {configError && <p style={{ padding: "0 20px 16px", fontSize: 12, color: "var(--danger-text)" }}>{configError}</p>}
                  {configEditMode && (
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "0 20px 18px" }}>
                      <button type="button" onClick={cancelConfigEdit} disabled={configBusy} style={{ ...btnSecondary, padding: "9px 20px" }}>Cancel</button>
                      <button type="button" onClick={saveConfig} disabled={configBusy} style={{ ...btnPrimary, padding: "9px 24px", opacity: configBusy ? 0.6 : 1 }}>{configBusy ? "Saving…" : "Save changes"}</button>
                    </div>
                  )}
                </div>

                {/* Search action */}
                <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", padding: "72px 32px 48px", textAlign: "center", position: "relative" }}>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>An AI agent will search the web for companies that match Lysoveta’s ideal customer profile.</p>

                  {/* Target market — soft region steer for discovery */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 28 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" }}>Target market</span>
                    <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
                      {([
                        { value: "eu", label: "Europe" },
                        { value: "us", label: "US" },
                        { value: "both", label: "No preference" },
                      ] as const).map((opt) => {
                        const active = targetMarket === opt.value;
                        const locked = !US_MARKET_ENABLED; // US off → selector is a disabled placeholder
                        return (
                          <button key={opt.value} type="button" disabled={locked} onClick={() => setTargetMarket(opt.value)}
                            style={{ background: active ? "var(--accent)" : "var(--white)", color: active ? "var(--white)" : (locked ? "var(--text-faint)" : "var(--text-slate)"), border: "none", borderRadius: 0, padding: "7px 18px", fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", cursor: locked ? "not-allowed" : "pointer", opacity: locked && !active ? 0.5 : 1 }}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{US_MARKET_ENABLED
                      ? "Guides the search toward companies in this region. Any from other regions that turn up are still kept and scored against their own ICP."
                      : "The search focuses on European companies."}</span>
                  </div>

                  <button onClick={() => { if (SEARCH_DISABLED) return; if (pendingQueueCount != null && pendingQueueCount >= 5) setQueueModalOpen(true); else handleAgentSearch(); }} disabled={SEARCH_DISABLED}
                    style={{ background: SEARCH_DISABLED ? "var(--border-light)" : "var(--accent)", color: SEARCH_DISABLED ? "var(--text-dim)" : "var(--white)", border: SEARCH_DISABLED ? "1px solid var(--border-grey)" : "none", padding: "12px 36px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: SEARCH_DISABLED ? "not-allowed" : "pointer", borderRadius: 4 }}>
                    {SEARCH_DISABLED ? "Search Disabled (Demo)" : "Search for New Companies →"}
                  </button>
                  {SEARCH_DISABLED && (
                    <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 14 }}>Live search runs offline during the pilot — the database below is kept up to date.</p>
                  )}
                </div>
              </>
            )}

            {agentState === "stale_warning" && (
              <div style={{ background: "var(--white)", border: "1px solid var(--banner-warn-border)" }}>
                <div style={{ background: "var(--banner-warn-text)", padding: "12px 20px" }}>
                  <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>A previous search didn’t finish</p>
                </div>
                <div style={{ padding: "24px" }}>
                  <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6, marginBottom: 16 }}>
                    {staleCompanies.length} {staleCompanies.length === 1 ? "company" : "companies"} got stuck in the previous search and have now been put back in the queue. The search was stopped automatically so you can investigate what went wrong.
                  </p>
                  <div style={{ border: "1px solid var(--border-light)", marginBottom: 20 }}>
                    {staleCompanies.map((name) => (
                      <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--border-light)" }}>
                        <span style={{ fontSize: 13, color: "var(--text)" }}>{name}</span>
                        <button
                          onClick={() => deleteFromQueue(name)}
                          title="Remove from queue"
                          style={{ background: "transparent", border: "1px solid var(--border-light)", color: "var(--text-dim)", padding: "3px 10px", fontSize: 12, cursor: "pointer" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-danger)"; e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border-light)"; }}>
                          Remove from queue ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "var(--banner-warn-bg)", border: "1px solid var(--banner-warn-border)", padding: "12px 16px", marginBottom: 24 }}>
                    <p style={{ fontSize: 13, color: "var(--banner-warn-text)" }}>
                      If a particular company repeatedly hangs, you can remove it from the queue. Otherwise it’s safe to start a new search — they will be retried.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={() => { setAgentState("idle"); setStaleCompanies([]); }}
                      style={{ background: "var(--header)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                      Back to search options
                    </button>
                    <button onClick={() => { setStaleCompanies([]); setAgentState("searching"); handleAgentSearch(); }}
                      style={{ background: "var(--accent)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                      Start new search →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {agentState === "searching" && (
              <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", padding: "64px 32px", textAlign: "center" }}>
                <div style={{ display: "inline-block", width: 40, height: 40, border: "4px solid var(--border-light)", borderTop: "4px solid var(--accent)", borderRadius: "50%", animation: "spin 0.9s linear infinite", marginBottom: 20 }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>
                  Step {currentStep} of 3 — {currentStep === 1 ? "Finding companies" : currentStep === 2 ? "Enriching companies" : "Evaluating"}
                </p>
                {/* Step progress dots */}
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                  {[1, 2, 3].map(s => (
                    <div key={s} style={{ width: 36, height: 5, borderRadius: 3, background: s <= currentStep ? "var(--accent)" : "var(--border-light)" }} />
                  ))}
                </div>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{searchProgress || "The AI agent is finding relevant companies. This may take a few minutes."}</p>
                <p style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>Elapsed: {elapsedLabel}</p>
                <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10 }}>You can leave this page open — the search runs on the server and this view updates automatically.</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {agentState === "error" && agentError && (
              <div style={{ background: "var(--white)", border: "1px solid var(--border-danger)" }}>
                <div style={{ background: "var(--danger-dark)", padding: "12px 20px" }}>
                  <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>{agentError.title}</p>
                </div>
                <div style={{ padding: "24px 24px 20px" }}>
                  <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6, marginBottom: 20 }}>{agentError.detail}</p>
                  <div style={{ background: "var(--surface-danger)", border: "1px solid var(--border-danger)", padding: "12px 16px", marginBottom: 20 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--danger-strong)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>What you can do</p>
                    {agentError.canRetry ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        <li style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>Try the search again — companies that were mid-processing are reset automatically</li>
                        <li style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>Check that the API keys (ANTHROPIC_API_KEY, Supabase) are configured correctly</li>
                        <li style={{ fontSize: 13, color: "var(--text)" }}>See the console log (F12) for technical details about the error</li>
                      </ul>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        <li style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>Wait a few days and try again</li>
                        <li style={{ fontSize: 13, color: "var(--text)" }}>Consider adding new sources or search terms via <strong>Edit</strong> in the Search Configuration panel</li>
                      </ul>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    {agentError.canRetry && (
                      <button onClick={() => handleAgentSearch()}
                        style={{ background: "var(--accent)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                        Try again →
                      </button>
                    )}
                    <button onClick={() => { setAgentState("idle"); setAgentError(null); }}
                      style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-card)", padding: "10px 24px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {agentState === "done" && addingState === "idle" && (
              <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ background: "var(--header)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Search Results</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <p style={{ color: "var(--on-dark)", fontSize: 12 }}>{searchResults.length} companies found</p>
                    <button onClick={() => { resetProcessingToQueue(); setAgentState("idle"); setSearchResults([]); }}
                      style={{ background: "var(--white)", color: "var(--navy)", border: "none", padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em" }}>
                      ✕ Cancel
                    </button>
                  </div>
                </div>
                <div>
                  {searchResults.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "18px 20px", borderBottom: "1px solid var(--border-light)", background: r.selected ? "var(--surface-row-hover)" : i % 2 === 0 ? "var(--white)" : "var(--surface-input)" }}>
                      <input type="checkbox" checked={r.selected} onChange={() => toggleResult(i)}
                        style={{ marginTop: 3, accentColor: "var(--accent)", width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <p style={{ fontWeight: 600, color: "var(--navy)", fontSize: 14 }}>{r.name}</p>
                          {r.priority_tier === "early_mover" && (
                            <span style={{ background: "var(--badge-green-bg)", color: "var(--success)", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>Early Mover</span>
                          )}
                          {r.priority_tier === "follower" && (
                            <span style={{ background: "var(--badge-yellow-bg)", color: "var(--badge-yellow-text)", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>Follower</span>
                          )}
                          {r.priority_tier === "enabler" && (
                            <span style={{ background: "var(--badge-purple-bg)", color: "var(--badge-purple-text)", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>Enabler</span>
                          )}
                          {r.icp_score != null && (
                            <span style={{ fontSize: 13, color: r.icp_score >= 4 ? "var(--success)" : r.icp_score === 3 ? "var(--warning)" : "var(--danger)", letterSpacing: 1 }}>
                              {"★".repeat(r.icp_score)}{"☆".repeat(5 - r.icp_score)}
                            </span>
                          )}
                        </div>
                        <a href={safeHref(r.website_url)} target="_blank" rel="noopener noreferrer"
                          style={{ color: "var(--accent)", fontSize: 12, marginBottom: 6, display: "inline-block" }}>
                          {r.website_url}
                        </a>
                        <p style={{ fontSize: 13, color: "var(--text-body)" }}>{r.description}</p>
                        {sourceNameMap[r.name] && (
                          <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
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
                        style={{ background: "transparent", border: "1px solid var(--border-light)", color: "var(--text-dim)", padding: "4px 10px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-danger)"; e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border-light)"; }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{selectedCount} {selectedCount === 1 ? "company" : "companies"} selected</p>
                    <button
                      onClick={() => setSearchResults(prev => prev.map(r => ({ ...r, selected: selectedCount < searchResults.length })))}
                      style={{ background: "none", border: "1px solid var(--border-input)", color: "var(--navy-mid)", padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 4 }}>
                      {selectedCount === searchResults.length ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <button onClick={handleAddSelected} disabled={selectedCount === 0}
                    style={{ background: selectedCount > 0 ? "var(--navy-mid)" : "var(--border-input)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: selectedCount > 0 ? "pointer" : "default" }}>
                    Add to Database →
                  </button>
                </div>
              </div>
            )}

            {(addingState === "form" || addingState === "saving") && (
              <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ background: "var(--header)", padding: "12px 20px" }}>
                  <p style={{ color: "var(--white)", fontSize: 18, fontWeight: 700 }}>Fill in Details</p>
                  <p style={{ color: "var(--on-dark)", fontSize: 14, marginTop: 2 }}>Complete the information before adding to the database.</p>
                </div>
                <div style={{ background: "var(--banner-info-bg)", borderBottom: "1px solid var(--banner-info-border)", padding: "12px 20px" }}>
                  <p style={{ fontSize: 14, color: "var(--banner-info-text)" }}>All pre-filled fields are suggested by the AI agent based on search results — review and override if needed.</p>
                </div>
                {pendingCompanies.map((c, i) => (
                  <div key={i} style={{ padding: "20px", borderBottom: "1px solid var(--border-light)" }}>
                    <p style={{ fontWeight: 700, color: "var(--navy)", fontSize: 14, marginBottom: 4 }}>{c.name}</p>
                    <a href={safeHref(c.website_url)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 12 }}>{c.website_url}</a>
                    {c.description && (
                      <p style={{ fontSize: 13, color: "var(--text-body)", marginTop: 8, lineHeight: 1.6 }}>{c.description}</p>
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
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 1px", color: star <= c.icp_fit ? (c.icp_fit >= 4 ? "var(--success)" : c.icp_fit === 3 ? "var(--warning)" : "var(--danger)") : "var(--border-grey)" }}>
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
                {saveError && <p style={{ padding: "12px 20px", color: "var(--danger)", fontSize: 13 }}>{saveError}</p>}
                <div style={{ padding: "16px 20px", display: "flex", justifyContent: "flex-end", gap: 12 }}>
                  <button onClick={() => setAddingState("idle")} disabled={addingState === "saving"}
                    style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-card)", padding: "10px 24px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={addingState === "saving"}
                    style={{ background: addingState === "saving" ? "var(--text-faint)" : "var(--accent)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: addingState === "saving" ? "default" : "pointer" }}>
                    {addingState === "saving" ? "Saving…" : "Confirm & Save →"}
                  </button>
                </div>
              </div>
            )}

            {addingState === "saved" && (
              <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", padding: "48px 32px", textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--success-bright)", marginBottom: 8 }}>Companies added to database</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 28 }}>You can find them under the Company Database tab.</p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button onClick={() => { setAddingState("idle"); setAgentState("idle"); }}
                    style={{ background: "transparent", color: "var(--navy-mid)", border: "1px solid var(--navy-mid)", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                    Search Again
                  </button>
                  <button onClick={() => { setAddingState("idle"); setAgentState("idle"); setTab("database"); }}
                    style={{ background: "var(--header)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                    Go to Company Database →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ── TAB 3: ICP Criteria ── */}
        {tab === "icp" && <IcpTab authEmail={authEmail} />}

        {/* ── TAB: How It Works ── */}
        {tab === "about" && <HowItWorksTab />}

      </div>

      <footer style={{ borderTop: "1px solid var(--border-card)", padding: "16px 32px", background: "var(--white)" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-faint)" }}>Aker BioMarine — Internal Tool</p>
      </footer>

      {/* Remove-company modal — opened by the ✕ on a row in edit mode */}

      {/* Queue warning — pops up when the user clicks Search while >= 5 companies are still waiting */}
      {queueModalOpen && (
        <QueueModal
          pendingQueueCount={pendingQueueCount}
          clearingQueue={clearingQueue}
          onResearch={() => { setQueueModalOpen(false); handleAgentSearch(); }}
          onClearAndSearch={async () => { await clearQueue(); setQueueModalOpen(false); handleAgentSearch(); }}
          onClose={() => setQueueModalOpen(false)}
        />
      )}

      {/* Source-performance modal — opened by "Source performance" in the Search Configuration panel */}
      {perfModalOpen && (
        <SourcePerfModal
          warnThresholdPct={warnThresholdPct}
          warnMinUses={warnMinUses}
          editThreshold={perfEditThreshold}
          draftPct={perfDraftPct}
          draftMin={perfDraftMin}
          saving={perfSaving}
          setDraftPct={setPerfDraftPct}
          setDraftMin={setPerfDraftMin}
          onEdit={() => { setPerfDraftPct(String(warnThresholdPct)); setPerfDraftMin(String(warnMinUses)); setPerfEditThreshold(true); }}
          onSave={async () => { await saveSettings(); setPerfEditThreshold(false); }}
          onCancelEdit={() => { setPerfDraftPct(String(warnThresholdPct)); setPerfDraftMin(String(warnMinUses)); setPerfEditThreshold(false); }}
          onClose={() => setPerfModalOpen(false)}
          sources={sourceOptions}
          savedBySource={savedBySource}
          hitRate={sourceHitRate}
          isLow={sourceIsLow}
          fmtHitRate={fmtHitRate}
          fmtSavedRate={fmtSavedRate}
        />
      )}

      {/* "What does the AI review check?" — shows/edits the review instructions (the editable rubric). */}


      {/* Manage test example companies — the fixed, user-editable set used by "Test on example companies". */}

      {sourceModalOpen && (
        <SourceModal
          source={newSource}
          setSource={setNewSource}
          editing={editingSourceKey !== null}
          infoOpen={sourceInfoOpen}
          setInfoOpen={setSourceInfoOpen}
          error={configError}
          busy={configBusy}
          onApply={applySource}
          onClose={() => { setSourceModalOpen(false); setConfigError(""); }}
        />
      )}
    </div>
  );
}
