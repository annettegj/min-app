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
// Menu of selectable search terms: the curated concepts first, then the wider keyword bank (deduped).
const SEARCH_TERM_OPTIONS = Array.from(new Set([
  ...((sourcesConfig as { search_concepts?: string[] }).search_concepts ?? []),
  ...((sourcesConfig as { keyword_bank?: string[] }).keyword_bank ?? []),
]));
const SOURCE_OPTIONS = ((sourcesConfig as { sources?: { name: string; type?: string; url?: string }[] }).sources ?? [])
  .map(s => ({ name: s.name, type: s.type ?? "web site", url: s.url ?? "" }));

type Company = {
  id: number;
  name: string;
  geography: string;
  product_category: string;
  max_price: number | null;
  price_currency: string | null;
  icp_fit: number;
  website_url?: string;
  source_name?: string;
  description?: string;
  priority_tier?: string | null;
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
  max_price: string;
  icp_fit: number;
};

type EditDraft = {
  geography: string; product_category: string; max_price: string; price_currency: string;
  icp_fit: number; priority_tier: string; website_url: string; description: string;
};

// --- Shared styles ---
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border-input)", padding: "8px 10px",
  fontSize: 13, color: "var(--navy)", background: "var(--surface-input)", outline: "none", borderRadius: 4,
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--text-slate)", marginBottom: 6,
};

// --- Button hierarchy (one teal accent = primary; neutral = secondary; red = destructive) ---
// Spread these and override padding/size per call site, e.g. style={{ ...btnPrimary, padding: "12px 36px" }}.
const btnBase: React.CSSProperties = {
  padding: "10px 24px", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", cursor: "pointer", borderRadius: 4,
};
const btnPrimary: React.CSSProperties = { ...btnBase, background: "var(--accent)", color: "var(--white)", border: "none" };
const btnSecondary: React.CSSProperties = { ...btnBase, background: "var(--white)", color: "var(--ink)", border: "1px solid var(--border)" };
// Full-width dashed "create" affordance for the config lists (add source / add search term).
const addBtnStyle: React.CSSProperties = {
  background: "transparent", border: "1px dashed var(--border)", color: "var(--accent)",
  padding: "8px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
  textTransform: "uppercase", cursor: "pointer", borderRadius: 4, width: "100%",
};
const hintStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 };
const reqStyle: React.CSSProperties = { color: "var(--danger-text)", fontWeight: 700, marginLeft: 3 };
const optStyle: React.CSSProperties = { fontSize: 10, fontWeight: 400, color: "var(--text-dim)", textTransform: "none", letterSpacing: 0, marginLeft: 6 };

// --- Search-configuration draft types (edit mode edits a local draft; Save commits the diff) ---
type SourceFields = { name: string; type: "web site" | "web page" | "youtube"; url: string; search_prefix: string; note: string };
type SourceRecord = SourceFields & { id: number };
type DraftTerm = { key: string; id: number | null; term: string; is_default: boolean };
type DraftSource = SourceFields & { key: string; id: number | null };

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
  // Inline company editing / removal (Company Database tab)
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editOriginal, setEditOriginal] = useState<EditDraft | null>(null);
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [pendingExport, setPendingExport] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  // List-level edit mode (unlocks per-row edit/remove) + session-only "hidden from view" rows
  // (a client-side curation, e.g. to tailor an Excel export; not persisted to the database).
  const [editMode, setEditMode] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());

  // --- Search tab state ---
  const [agentState, setAgentState] = useState<"idle" | "stale_warning" | "searching" | "step3" | "done" | "error">("idle")
  const [agentError, setAgentError] = useState<{ title: string; detail: string; canRetry: boolean } | null>(null)
  const [staleCompanies, setStaleCompanies] = useState<string[]>([]);
  const [step3Prompt, setStep3Prompt] = useState("");
  const [step3Paste, setStep3Paste] = useState("");
  const [step3CopyDone, setStep3CopyDone] = useState(false);
  // Step 3 mode: "auto" runs ICP matching via the Anthropic API in the worker; "manual" builds the
  // prompt to paste into Claude Chat. Sent to the worker when the search starts. Currently LOCKED on
  // "auto" — the UI switch is disabled. To re-enable it, restore the setter: `[step3Mode, setStep3Mode]`
  // and wire the switch buttons' onClick/disabled back up.
  const [step3Mode] = useState<"auto" | "manual">("auto");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [pendingCompanies, setPendingCompanies] = useState<PendingCompany[]>([]);
  const [addingState, setAddingState] = useState<"idle" | "form" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState("");
  const [sourceNameMap, setSourceNameMap] = useState<Record<string, string>>({});
  const [expandedCompanyId, setExpandedCompanyId] = useState<number | null>(null);

  // --- Search configuration (read from the DB, editable in the app) ---
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
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
  const [newSource, setNewSource] = useState<SourceFields>({ name: "", type: "web site", url: "", search_prefix: "", note: "" });
  const [editingSourceKey, setEditingSourceKey] = useState<string | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceInfoOpen, setSourceInfoOpen] = useState(false);
  const [termsExpanded, setTermsExpanded] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const [configError, setConfigError] = useState("");

  // --- Background search job (start + poll) ---
  const [searchProgress, setSearchProgress] = useState("");
  const [searchTimedOut, setSearchTimedOut] = useState(false);
  const [activeSearchJobId, setActiveSearchJobId] = useState<number | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  // Pending companies in the discovery queue. If >= 5, Step 1 (discovery) is skipped, so a run
  // won't search newly selected sources/terms — surfaced as a warning in the UI.
  const [pendingQueueCount, setPendingQueueCount] = useState<number | null>(null);
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [clearingQueue, setClearingQueue] = useState(false);
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
  const currentStep = agentState === "step3" || agentState === "done"
    ? 3
    : searchProgress.toLowerCase().includes("evaluat") ? 3
    : searchProgress.toLowerCase().includes("enrich") ? 2 : 1;
  const elapsedLabel = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;


  // Loads the active company database — always excludes rejected companies.
  // Single source of truth so the database view can never accidentally include rejected rows.
  async function loadCompanies() {
    const { data } = await supabase.from("companies").select("*");
    if (data) setCompanies(data.filter((c: Company) => c.added && !c.rejected) as Company[]);
  }

  // Loads the search config (sources + terms) from the DB into the full records (with ids) and the
  // derived selection lists. On a read error it leaves state untouched, so a transient failure never
  // wipes the list. Stale selections (renamed/removed items) are pruned.
  async function loadSearchConfig() {
    const [{ data: srcs }, { data: terms }] = await Promise.all([
      supabase.from("sources").select("id, name, type, url, search_prefix, note").eq("active", true).order("id"),
      supabase.from("search_terms").select("id, term, is_default").eq("active", true).order("id"),
    ]);
    if (srcs) {
      const recs: SourceRecord[] = srcs.map((s: { id: number; name: string; type: string | null; url: string | null; search_prefix: string | null; note: string | null }) => ({
        id: s.id, name: s.name, type: (s.type ?? "web site") as "web site" | "web page" | "youtube",
        url: s.url ?? "", search_prefix: s.search_prefix ?? "", note: s.note ?? "",
      }));
      setSourceRecords(recs);
      setSourceOptions(recs.map(s => ({ name: s.name, type: s.type, url: s.url })));
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
    setDraftSources(sourceRecords.map(s => ({ key: nextKey(), id: s.id, name: s.name, type: s.type, url: s.url, search_prefix: s.search_prefix, note: s.note })));
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
    setNewSource({ name: "", type: "web site", url: "", search_prefix: "", note: "" });
    setEditingSourceKey(null); setConfigError(""); setSourceInfoOpen(false); setSourceModalOpen(true);
  }
  function openEditSource(s: DraftSource) {
    setNewSource({ name: s.name, type: s.type, url: s.url, search_prefix: s.search_prefix, note: s.note });
    setEditingSourceKey(s.key); setConfigError(""); setSourceInfoOpen(false); setSourceModalOpen(true);
  }
  // Modal "Done" — validate the single source and write it into the draft (no DB call).
  function applySource() {
    const name = newSource.name.trim();
    if (!name) { setConfigError("Name is required."); return; }
    if (newSource.type === "web site" && !newSource.search_prefix.trim()) { setConfigError("A website source needs a search prefix (e.g. nutraingredients.com)."); return; }
    if (newSource.type === "web page" && !newSource.url.trim()) { setConfigError("A single-page source needs a URL."); return; }
    const keepPrefix = newSource.type === "web site" || newSource.type === "youtube";
    const fields: SourceFields = { name, type: newSource.type, url: newSource.type === "youtube" ? "" : newSource.url.trim(), search_prefix: keepPrefix ? newSource.search_prefix.trim() : "", note: newSource.note.trim() };
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
      const toRow = (s: SourceFields) => ({ type: s.type, name: s.name.trim(), url: s.url.trim() || null, search_prefix: (s.type === "web site" || s.type === "youtube") ? (s.search_prefix.trim() || null) : null, note: s.note.trim() || null });
      const draftSrcIds = new Set(srcs.filter(s => s.id != null).map(s => s.id));
      const srcDeletes = sourceRecords.filter(r => !draftSrcIds.has(r.id)).map(r => r.id);
      const srcInserts = srcs.filter(s => s.id == null).map(toRow);
      const srcUpdates = srcs.filter(s => s.id != null).filter(s => {
        const o = sourceRecords.find(r => r.id === s.id);
        if (!o) return false;
        return o.name !== s.name.trim() || o.type !== s.type || o.url !== s.url.trim()
          || o.search_prefix !== ((s.type === "web site" || s.type === "youtube") ? s.search_prefix.trim() : "") || o.note !== s.note.trim();
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

  useEffect(() => {
    loadCompanies();
    fetch("/api/icp").then(r => r.json()).then(d => setIcpContent(d.content));
    loadSearchConfig();
    loadPendingCount();
  }, []);

  // Refresh the queue count whenever we return to an idle/finished state (e.g. after a search).
  useEffect(() => {
    if (agentState === "idle" || agentState === "done" || agentState === "stale_warning") loadPendingCount();
  }, [agentState]);

  const results = useMemo(() => {
    if (!searchParams) return [];
    return companies.filter((c) => {
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

  // Rows actually shown in the table = filtered results minus any hidden-from-view rows. This is a
  // session-only curation (not persisted); it also drives what the Excel export includes.
  const visibleResults = useMemo(
    () => results.filter((c) => !hiddenIds.has(c.id)),
    [results, hiddenIds]
  );
  // The company targeted by the remove modal (null when the modal is closed).
  const removeTarget = confirmRemoveId != null ? companies.find((c) => c.id === confirmRemoveId) ?? null : null;

  // Exports the currently filtered company list (`results`) to a real .xlsx file, generated
  // client-side. exceljs is dynamically imported so it only loads when the user clicks Export.
  const [exporting, setExporting] = useState(false);
  async function handleExportExcel() {
    if (visibleResults.length === 0 || exporting) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Companies");
      ws.columns = [
        { header: "Name", key: "name", width: 28 },
        { header: "Geography", key: "geography", width: 12 },
        { header: "Product category", key: "product_category", width: 26 },
        { header: "Max price", key: "max_price", width: 12 },
        { header: "Currency", key: "price_currency", width: 10 },
        { header: "ICP fit", key: "icp_fit", width: 9 },
        { header: "Priority tier", key: "priority_tier", width: 14 },
        { header: "Website", key: "website_url", width: 34 },
        { header: "Source", key: "source_name", width: 22 },
        { header: "Description", key: "description", width: 60 },
      ];
      ws.getRow(1).font = { bold: true };
      for (const c of visibleResults) {
        ws.addRow({
          name: c.name,
          geography: c.geography,
          product_category: c.product_category,
          max_price: c.max_price ?? "",
          price_currency: c.price_currency ?? "",
          icp_fit: c.icp_fit,
          priority_tier: c.priority_tier ?? "",
          website_url: c.website_url ?? "",
          source_name: c.source_name ?? "",
          description: c.description ?? "",
        });
      }
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `lysoveta-companies-${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[export] Excel export failed:", err);
      alert("Could not generate the Excel file. See the console (F12) for details.");
    } finally {
      setExporting(false);
    }
  }

  // --- Company Database: inline edit + soft-delete ---
  function startEdit(c: Company) {
    setExpandedCompanyId(c.id);
    setEditingCompanyId(c.id);
    setConfirmRemoveId(null);
    setEditError("");
    const draft: EditDraft = {
      geography: c.geography ?? "",
      product_category: c.product_category ?? "",
      max_price: c.max_price != null ? String(c.max_price) : "",
      price_currency: c.price_currency ?? "",
      icp_fit: c.icp_fit ?? 3,
      priority_tier: c.priority_tier ?? "",
      website_url: c.website_url ?? "",
      description: c.description ?? "",
    };
    setEditDraft(draft);
    setEditOriginal(draft);
  }

  function cancelEdit() {
    setEditingCompanyId(null);
    setEditDraft(null);
    setEditOriginal(null);
    setEditError("");
  }

  async function saveEdit(c: Company) {
    if (!editDraft) return;
    setSavingEdit(true);
    setEditError("");
    const { error } = await supabase
      .from("companies")
      .update({
        geography: editDraft.geography,
        product_category: editDraft.product_category,
        max_price: editDraft.max_price ? Number(editDraft.max_price) : null,
        price_currency: editDraft.price_currency || null,
        icp_fit: editDraft.icp_fit,
        priority_tier: editDraft.priority_tier || null,
        website_url: editDraft.website_url || null,
        description: editDraft.description || null,
      })
      .eq("id", c.id);
    if (error) {
      setEditError(`Could not save: ${error.message}`);
      setSavingEdit(false);
      return;
    }
    await loadCompanies();
    setSavingEdit(false);
    setEditingCompanyId(null);
    setEditDraft(null);
    setEditOriginal(null);
  }

  // Soft delete: mark rejected (reversible, preserves enriched_data) so it drops out of the view,
  // and remove it from the discovery queue so it isn't re-processed.
  async function removeCompany(c: Company) {
    setRemoving(true);
    setEditError("");
    const { error } = await supabase.from("companies").update({ rejected: true }).eq("id", c.id);
    if (error) {
      setEditError(`Could not remove: ${error.message}`);
      setRemoving(false);
      return;
    }
    await supabase.from("discovery_queue").delete().eq("name", c.name);
    await loadCompanies();
    setRemoving(false);
    setConfirmRemoveId(null);
    setExpandedCompanyId(null);
  }

  function toggleEditMode() {
    if (editMode) {
      // Leaving edit mode — abandon any in-progress edit or remove-confirmation.
      cancelEdit();
      setConfirmRemoveId(null);
    }
    setEditMode((v) => !v);
  }

  // Hide a row from the current view only (session-only, reversible via "Restore hidden").
  function hideFromView(id: number) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (expandedCompanyId === id) setExpandedCompanyId(null);
  }

  function restoreHidden() {
    setHiddenIds(new Set());
  }

  // Clears the shown results and returns the Company Database tab to its empty starting state
  // (filter panel only, no table). Also resets edit mode and any session-only hidden rows.
  function clearResults() {
    setSearchState("idle");
    setSearchParams(null);
    setExpandedCompanyId(null);
    setEditMode(false);
    cancelEdit();
    setConfirmRemoveId(null);
    setHiddenIds(new Set());
  }

  // True only when an edit form is open AND a field has actually been changed from the original.
  function hasUnsavedEdit() {
    return editingCompanyId != null && editDraft != null && editOriginal != null
      && JSON.stringify(editDraft) !== JSON.stringify(editOriginal);
  }
  // Runs `proceed` immediately — unless there's an unsaved edit, in which case it asks first.
  function guardUnsavedEdit(proceed: () => void) {
    if (hasUnsavedEdit()) setPendingNav(() => proceed);
    else proceed();
  }

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
      const res = await fetch(`${workerBase}/api/search/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step3Mode, searchConcepts: selectedTerms, sourceNames: selectedSources }),
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
          setStep3Prompt(job.step3_prompt ?? "");
          setSearchTimedOut(!!job.timed_out);
          // Automatic Step 3 succeeded → jump straight to the selectable results. Otherwise (manual
          // mode, or automatic evaluation failed) fall back to the manual paste box.
          const autoResults = (job.results ?? null) as SearchResult[] | null;
          if (autoResults) {
            setSearchResults(autoResults.map((r) => ({ ...r, selected: false })));
            setAgentState("done");
          } else {
            setAgentState("step3");
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
    score >= 4 ? "var(--success-bright)" : score === 3 ? "var(--warning-bright)" : "var(--danger)";

  const selectedCount = searchResults.filter(r => r.selected).length;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--page)", fontFamily: "Inter, sans-serif" }}>

      {/* Top bar */}
      <div style={{ background: "var(--header)", borderBottom: "3px solid var(--accent)" }}>
        <div className="max-w-screen-2xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex flex-col gap-2" style={{ alignItems: "flex-start" }}>
            <img src="/AKBM logo.png" alt="Aker BioMarine" style={{ height: 52, width: "auto", objectFit: "contain", display: "block" }} />
            <p style={{ color: "var(--white)", fontSize: 20, fontWeight: 700, letterSpacing: "0.01em", marginLeft: 10 }}>Lysoveta Customer Finder</p>
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
        {tab === "database" && (
          <>
            <div>
              <button onClick={() => guardUnsavedEdit(() => { setSearchParams({ geography: "All", category: "", priceMin: "", priceMax: "", icpMin: 1, tier: "All" }); setSearchState("done"); })}
                style={{ ...btnSecondary, padding: "12px 36px", fontSize: 13, letterSpacing: "0.08em" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--white)")}>
                Show All Companies →
              </button>
            </div>

            <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ background: "var(--header)", padding: "12px 20px" }}>
                <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Filter Companies</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0" style={{ borderTop: "1px solid var(--border-light)" }}>

                <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
                  <label style={labelStyle}>Geography</label>
                  <select value={geography} onChange={(e) => setGeography(e.target.value)} style={inputStyle}>
                    {GEOGRAPHIES.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>

                <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
                  <label style={labelStyle}>Product Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                    {CATEGORIES.map(c => <option key={c} value={c === "All" ? "" : c}>{c}</option>)}
                  </select>
                </div>

                <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
                  <label style={labelStyle}>Min. ICP Fit Score</label>
                  <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setIcpMin(icpMin === star ? 1 : star)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, lineHeight: 1, padding: "0 2px", color: star <= icpMin ? (icpMin >= 4 ? "var(--success)" : icpMin === 3 ? "var(--warning)" : "var(--danger)") : "var(--border-grey)" }}>
                        ★
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Showing {icpMin}★ and above</p>
                </div>

                <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
                  <label style={labelStyle}>Priority Tier</label>
                  <select value={tier} onChange={(e) => setTier(e.target.value)} style={inputStyle}>
                    {TIERS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>



                <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border-light)" }}>
                  <label style={labelStyle}>Price Range</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="number" placeholder="Min" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} style={inputStyle} />
                    <input type="number" placeholder="Max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} style={inputStyle} />
                  </div>
                </div>

                <div style={{ padding: "18px 20px" }} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              {searchState === "done" && (
                <button onClick={() => guardUnsavedEdit(clearResults)}
                  style={{ ...btnSecondary, padding: "12px 36px", fontSize: 13, letterSpacing: "0.08em" }}>
                  Clear Results
                </button>
              )}
              <button onClick={() => guardUnsavedEdit(handleSearch)}
                style={{ ...btnPrimary, padding: "12px 36px", fontSize: 13, letterSpacing: "0.08em" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--accent)")}>
                Find Companies →
              </button>
            </div>

            {searchState === "loading" && <p style={{ color: "var(--text-slate)", fontSize: 13 }}>Fetching companies…</p>}

            {searchState === "done" && (
              <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ background: "var(--header)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Results</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <p style={{ color: "var(--white)", fontSize: 12 }}>
                      {visibleResults.length} {visibleResults.length !== 1 ? "companies" : "company"}{hiddenIds.size > 0 ? ` · ${hiddenIds.size} hidden` : ""}
                    </p>
                    {hiddenIds.size > 0 && (
                      <button type="button" onClick={restoreHidden}
                        style={{ background: "transparent", color: "var(--on-dark)", border: "1px solid var(--border-on-dark)", padding: "5px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", borderRadius: 4 }}>
                        Restore hidden
                      </button>
                    )}
                    {results.length > 0 && (
                      <button type="button" onClick={toggleEditMode}
                        style={{ background: editMode ? "var(--white)" : "var(--accent)", color: editMode ? "var(--header)" : "var(--white)", border: "none", padding: "6px 18px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", borderRadius: 4 }}>
                        {editMode ? "Done editing" : "Edit list"}
                      </button>
                    )}
                  </div>
                </div>
                {results.length === 0 ? (
                  <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
                    No companies match the selected filters.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-table-head)", borderBottom: "1px solid var(--border-card)" }}>
                        {["Company", "Website", "Source", "Geography", "Category", "Max. Price", "Priority", "ICP Fit Score"].map(h => (
                          <th key={h} style={{ padding: "12px 22px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-slate)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleResults.map((c, i) => (
                        <Fragment key={c.id}>
                          <tr onClick={() => setExpandedCompanyId(expandedCompanyId === c.id ? null : c.id)}
                            style={{ borderBottom: expandedCompanyId === c.id ? "none" : "1px solid var(--border-light)", background: i % 2 === 0 ? "var(--white)" : "var(--surface-input)", cursor: "pointer" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-row-hover)")}
                            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "var(--white)" : "var(--surface-input)")}>
                            <td style={{ padding: "16px 22px", fontWeight: 600, color: "var(--navy)", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{expandedCompanyId === c.id ? "▾" : "▸"}</span>
                                {editMode && (
                                  <span style={{ display: "flex", gap: 10 }}>
                                    <button type="button" title="Edit"
                                      onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                      style={{ background: "transparent", border: "none", borderRadius: 4, color: "var(--ink)", cursor: "pointer", padding: "4px 6px", display: "inline-flex", alignItems: "center", lineHeight: 0 }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                      </svg>
                                    </button>
                                    <button type="button" title="Remove…"
                                      onClick={(e) => { e.stopPropagation(); setConfirmRemoveId(confirmRemoveId === c.id ? null : c.id); setEditError(""); }}
                                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-danger-hover)")}
                                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                      style={{ background: "transparent", border: "none", borderRadius: 4, color: "var(--danger-text)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "4px 7px" }}>✕</button>
                                  </span>
                                )}
                                {c.name}
                              </div>
                            </td>
                            <td style={{ padding: "16px 22px", whiteSpace: "nowrap" }}>
                              {c.website_url ? (
                                <a href={safeHref(c.website_url)} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  style={{ color: "var(--accent)", fontSize: 12, textDecoration: "none" }}
                                  onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                                  onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}>
                                  {displayHostname(c.website_url)}
                                </a>
                              ) : (
                                <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "16px 22px", color: "var(--text-body)", fontSize: 12, whiteSpace: "nowrap" }}>
                              {c.source_name ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                            </td>
                            <td style={{ padding: "16px 22px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{c.geography}</td>
                            <td style={{ padding: "16px 22px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{c.product_category}</td>
                            <td style={{ padding: "16px 22px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{c.max_price != null ? `${c.price_currency === "GBP" ? "£" : c.price_currency === "USD" ? "$" : c.price_currency === "EUR" ? "€" : ""}${c.max_price.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                            <td style={{ padding: "16px 22px", whiteSpace: "nowrap" }}>
                              {c.priority_tier === "early_mover" && (
                                <span style={{ background: "var(--badge-green-bg)", color: "var(--success)", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em" }}>Early Mover</span>
                              )}
                              {c.priority_tier === "follower" && (
                                <span style={{ background: "var(--badge-yellow-bg)", color: "var(--badge-yellow-text)", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em" }}>Follower</span>
                              )}
                              {c.priority_tier === "enabler" && (
                                <span style={{ background: "var(--badge-purple-bg)", color: "var(--badge-purple-text)", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em" }}>Enabler</span>
                              )}
                              {!c.priority_tier && <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>}
                            </td>
                            <td style={{ padding: "16px 22px", fontSize: 13, letterSpacing: 1, color: icpColor(c.icp_fit), whiteSpace: "nowrap" }}>{"★".repeat(c.icp_fit)}{"☆".repeat(5 - c.icp_fit)}</td>
                          </tr>
                          {expandedCompanyId === c.id && (
                            <tr style={{ borderBottom: "1px solid var(--border-light)", background: i % 2 === 0 ? "var(--white)" : "var(--surface-input)" }}>
                              <td colSpan={8} style={{ padding: "0 20px 20px 48px" }}>
                                {editingCompanyId === c.id && editDraft ? (
                                  <div style={{ maxWidth: 900 }}>
                                    <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16, marginBottom: 16 }}>
                                      <div>
                                        <label style={labelStyle}>Geography</label>
                                        <select value={editDraft.geography} onChange={e => setEditDraft({ ...editDraft, geography: e.target.value })} style={inputStyle}>
                                          {GEO_OPTIONS.map(g => <option key={g}>{g}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label style={labelStyle}>Product category</label>
                                        <select value={editDraft.product_category} onChange={e => setEditDraft({ ...editDraft, product_category: e.target.value })} style={inputStyle}>
                                          {CAT_OPTIONS.map(cat => <option key={cat}>{cat}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label style={labelStyle}>Max price</label>
                                        <input type="number" value={editDraft.max_price} onChange={e => setEditDraft({ ...editDraft, max_price: e.target.value })} style={inputStyle} />
                                      </div>
                                      <div>
                                        <label style={labelStyle}>Currency</label>
                                        <select value={editDraft.price_currency} onChange={e => setEditDraft({ ...editDraft, price_currency: e.target.value })} style={inputStyle}>
                                          <option value="">—</option>
                                          {["EUR", "GBP", "USD", "NOK", "SEK", "DKK", "CHF"].map(cur => <option key={cur}>{cur}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label style={labelStyle}>ICP fit</label>
                                        <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                                          {[1, 2, 3, 4, 5].map(star => (
                                            <button key={star} type="button" onClick={() => setEditDraft({ ...editDraft, icp_fit: star })}
                                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, lineHeight: 1, padding: "0 2px", color: star <= editDraft.icp_fit ? "var(--accent)" : "var(--border-grey)" }}>★</button>
                                          ))}
                                        </div>
                                      </div>
                                      <div>
                                        <label style={labelStyle}>Priority tier</label>
                                        <select value={editDraft.priority_tier} onChange={e => setEditDraft({ ...editDraft, priority_tier: e.target.value })} style={inputStyle}>
                                          <option value="">—</option>
                                          <option value="early_mover">Early Mover</option>
                                          <option value="follower">Follower</option>
                                          <option value="enabler">Enabler</option>
                                        </select>
                                      </div>
                                      <div style={{ gridColumn: "1 / -1" }}>
                                        <label style={labelStyle}>Website</label>
                                        <input type="text" value={editDraft.website_url} onChange={e => setEditDraft({ ...editDraft, website_url: e.target.value })} style={inputStyle} />
                                      </div>
                                      <div style={{ gridColumn: "1 / -1" }}>
                                        <label style={labelStyle}>Description</label>
                                        <textarea value={editDraft.description} onChange={e => setEditDraft({ ...editDraft, description: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                                      </div>
                                    </div>
                                    {editError && <p style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{editError}</p>}
                                    <div style={{ display: "flex", gap: 10 }}>
                                      <button type="button" onClick={() => saveEdit(c)} disabled={savingEdit}
                                        style={{ ...btnPrimary, padding: "9px 22px", background: savingEdit ? "var(--accent-disabled)" : "var(--accent)", cursor: savingEdit ? "default" : "pointer" }}>
                                        {savingEdit ? "Saving…" : "Save"}
                                      </button>
                                      <button type="button" onClick={cancelEdit} disabled={savingEdit}
                                        style={{ ...btnSecondary, padding: "9px 22px" }}>
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ maxWidth: 900 }}>
                                    <p style={{ fontSize: 14, color: "var(--text-body)", lineHeight: 1.7, maxWidth: 860, marginBottom: 16 }}>
                                      {c.description ?? <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>No description available.</span>}
                                    </p>
                                  </div>
                                )}
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
                  onClick={() => { if (hasUnsavedEdit()) setPendingExport(true); else handleExportExcel(); }}
                  disabled={exporting}
                  style={{ ...btnSecondary, padding: "9px 20px", borderRadius: 4, opacity: exporting ? 0.6 : 1, cursor: exporting ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  {exporting ? "Exporting…" : "↓ Export as Excel"}
                </button>
              </div>
            )}
          </>
        )}

        {/* ── TAB 2: Find New Companies ── */}
        {/* Narrower, centered column for this tab only — the top bar stays full-width. */}
        {tab === "search" && (
          <div style={{ maxWidth: 960, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
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
                      <button type="button" onClick={enterConfigEdit}
                        style={{ background: "var(--accent)", color: "var(--white)", border: "none", borderRadius: 4, padding: "6px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer" }}>
                        Edit
                      </button>
                    )}
                  </div>
                  {configEditMode && (
                    <div style={{ background: "var(--banner-warn-bg)", borderBottom: "1px solid var(--banner-warn-border)", padding: "10px 20px" }}>
                      <p style={{ fontSize: 12, color: "var(--banner-warn-text)" }}>
                        Editing the shared configuration. Click a term or source to change its fields; nothing is saved until you press <strong>Save changes</strong>. Saved changes affect every search, for everyone.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2" style={{ padding: "20px", gap: 32 }}>
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
                    {/* Sources */}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <label style={labelStyle}>{configEditMode ? "Sources" : "Sources (choose up to 4)"}</label>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -2, marginBottom: 6, lineHeight: 1.6 }}>
                        <strong>Website</strong> = a whole site<br />
                        <strong>Single page</strong> = one specific URL
                      </p>
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
                        <>
                          <div style={{ maxHeight: sourcesExpanded ? "none" : 232, overflowY: sourcesExpanded ? "visible" : "auto", paddingRight: 6 }}>
                          {[
                            { heading: "Website", items: sourceOptions.filter(s => (s.type ?? "web site") === "web site") },
                            { heading: "Single page", items: sourceOptions.filter(s => s.type === "web page") },
                            { heading: "YouTube", items: sourceOptions.filter(s => s.type === "youtube") },
                          ].map(group => group.items.length === 0 ? null : (
                            <div key={group.heading} style={{ marginTop: 10 }}>
                              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>{group.heading}</p>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                                        {s.name}
                                        {isPage && s.url && (
                                          <a href={/^https?:\/\//.test(s.url) ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            style={{ display: "block", fontSize: 11, color: "var(--accent)", marginTop: 1, wordBreak: "break-all", textDecoration: "underline" }}>
                                            {s.url.replace(/^https?:\/\//, "")}
                                          </a>
                                        )}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          </div>
                          {sourceOptions.length > 6 && (
                            <button type="button" onClick={() => setSourcesExpanded(v => !v)}
                              style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "6px 0", marginTop: 4, textAlign: "left" }}>
                              {sourcesExpanded ? "Show fewer ▴" : `Show all ${sourceOptions.length} ▾`}
                            </button>
                          )}
                        </>
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
                  {/* Step 3 decision — segmented on/off switch in the top-right corner */}
                  <div style={{ position: "absolute", top: 16, right: 20, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" }}>Step 3 decision:</span>
                    <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }} title="Locked on Automatic for now">
                      {([
                        { value: "auto", label: "Automatic" },
                        { value: "manual", label: "Manual" },
                      ] as const).map((opt) => {
                        const active = step3Mode === opt.value;
                        return (
                          <button key={opt.value} type="button" disabled
                            style={{ background: active ? "var(--accent)" : "var(--white)", color: active ? "var(--white)" : "var(--switch-off-text)", border: "none", borderRadius: 0, padding: "6px 16px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", cursor: "not-allowed" }}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "var(--navy)", marginBottom: 8 }}>Search for new prospects</p>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 28 }}>An AI agent will search the web for companies that match Lysoveta’s ideal customer profile.</p>

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

            {agentState === "step3" && (
              <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                {searchTimedOut && (
                  <div style={{ background: "var(--banner-warn-bg)", borderBottom: "1px solid var(--banner-warn-border)", padding: "14px 20px" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "var(--banner-warn-text)", marginBottom: 4 }}>⚠️ The search timed out after 30 minutes</p>
                    <p style={{ fontSize: 12.5, color: "var(--banner-warn-text)", lineHeight: 1.6 }}>
                      Nothing was lost: companies found in Step 1 are saved in the queue, and companies that finished enrichment in Step 2 are in the company database. The next search will automatically pick up where this one left off. You can still evaluate the companies that were enriched below.
                    </p>
                  </div>
                )}
                <div style={{ background: "var(--header)", padding: "12px 20px" }}>
                  <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Step 3 — Manual Evaluation</p>
                  <p style={{ color: "var(--on-dark)", fontSize: 12, marginTop: 2 }}>Steps 1 and 2 are done. Copy the prompt below and paste it into Claude Chat to evaluate the companies.</p>
                </div>
                <div style={{ padding: "24px 24px 0" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-slate)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>1. Copy this prompt and paste it into Claude Chat</p>
                  <div style={{ position: "relative" }}>
                    <textarea readOnly value={step3Prompt} rows={6}
                      style={{ width: "100%", fontSize: 12, fontFamily: "monospace", color: "var(--text)", background: "var(--surface-code)", border: "1px solid var(--border-card)", padding: "12px", resize: "vertical", boxSizing: "border-box" }} />
                    <button
                      onClick={() => { navigator.clipboard.writeText(step3Prompt); setStep3CopyDone(true); }}
                      style={{ position: "absolute", top: 8, right: 8, background: step3CopyDone ? "var(--success-bright)" : "var(--accent)", color: "var(--white)", border: "none", padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {step3CopyDone ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                </div>
                <div style={{ padding: "20px 24px 24px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-slate)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>2. Paste the response from Claude Chat here</p>
                  <textarea
                    value={step3Paste}
                    onChange={e => setStep3Paste(e.target.value)}
                    placeholder='Paste the JSON response here, e.g. [{"name":"...","priority_tier":"early_mover","icp_score":4,"description":"...","website_url":"..."}]'
                    rows={6}
                    style={{ width: "100%", fontSize: 12, fontFamily: "monospace", color: "var(--text)", background: "var(--surface-input)", border: "1px solid var(--border-card)", padding: "12px", resize: "vertical", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
                    <button onClick={() => { resetProcessingToQueue(); setAgentState("idle"); }}
                      style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-card)", padding: "10px 24px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={handleStep3Submit} disabled={!step3Paste.trim()}
                      style={{ background: step3Paste.trim() ? "var(--accent)" : "var(--border-input)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: step3Paste.trim() ? "pointer" : "default" }}>
                      Show results →
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
        {tab === "icp" && (
          <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 920, width: "100%", margin: "0 auto" }}>
            <div style={{ background: "var(--header)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Lysoveta ICP Criteria</p>
              <button disabled style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.5)", padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "not-allowed", borderRadius: 4, letterSpacing: "0.04em" }}>
                ✎ Edit Criteria
              </button>
            </div>
            <div style={{ padding: "20px 40px", borderBottom: "1px solid var(--border-light)", background: "var(--surface-tint)" }}>
              <p style={{ color: "var(--text-body)", fontSize: 13, lineHeight: 1.6, fontStyle: "italic" }}>
                This document defines the Ideal Customer Profile (ICP) for Lysoveta in Europe. It is used during Step 3 of the enrichment pipeline, where the AI agent evaluates each discovered company against these criteria to assign a priority tier (Early Mover, Follower, or Enabler) and an ICP fit score.
              </p>
            </div>
            <div style={{ padding: "32px 48px", maxWidth: 820 }}>
              {!icpContent ? (
                <p style={{ color: "var(--text-faint)", fontSize: 14 }}>Laster…</p>
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
                            <tr style={{ background: "var(--surface-tint2)" }}>
                              {parseRow(header).map((cell, ci) => (
                                <th key={ci} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: "var(--navy)", borderBottom: "2px solid var(--border-card)", whiteSpace: "nowrap" }}>{stripBold(cell)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {body.map((row, ri) => (
                              <tr key={ri} style={{ borderBottom: "1px solid var(--surface-tint3)", background: ri % 2 === 0 ? "var(--white)" : "var(--surface-tint)" }}>
                                {parseRow(row).map((cell, ci) => (
                                  <td key={ci} style={{ padding: "9px 14px", color: ci === 0 && cell ? "var(--navy)" : "var(--text)", fontWeight: ci === 0 && cell ? 600 : 400 }}>{stripBold(cell)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                    continue;
                  }

                  if (line.startsWith("# ")) { elements.push(<h1 key={i} style={{ fontSize: 24, fontWeight: 700, color: "var(--navy)", marginBottom: 4, marginTop: 0 }}>{line.slice(2)}</h1>); }
                  else if (line.startsWith("## ")) { elements.push(<h2 key={i} style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", marginTop: 32, marginBottom: 4 }}>{line.slice(3)}</h2>); }
                  else if (line.startsWith("### ")) { elements.push(<h3 key={i} style={{ fontSize: 16, fontWeight: 700, color: "var(--navy-mid)", marginTop: 22, marginBottom: 4 }}>{toLabel(line.slice(4))}</h3>); }
                  else if (line.startsWith("---")) { elements.push(<div key={i} style={{ height: 4 }} />); }
                  else if (line.startsWith("- ")) {
                    elements.push(
                      <p key={i} style={{ fontSize: 15, color: "var(--text)", margin: "4px 0", paddingLeft: 20, position: "relative", lineHeight: 1.7 }}>
                        <span style={{ position: "absolute", left: 0, color: "var(--navy-mid)", fontWeight: 700 }}>·</span>{stripBold(line.slice(2))}
                      </p>
                    );
                  }
                  else if (line.startsWith("**") && line.endsWith("**")) { elements.push(<p key={i} style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)", marginTop: 14, marginBottom: 2 }}>{line.slice(2, -2)}</p>); }
                  else if (line === "") { elements.push(<div key={i} style={{ height: 4 }} />); }
                  else { elements.push(<p key={i} style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.75, margin: "3px 0" }}>{stripBold(line)}</p>); }

                  i++;
                }
                return elements;
              })()}
            </div>
          </div>
        )}

      </div>

      <footer style={{ borderTop: "1px solid var(--border-card)", padding: "16px 32px", background: "var(--white)" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-faint)" }}>Aker BioMarine — Internal Tool</p>
      </footer>

      {/* Remove-company modal — opened by the ✕ on a row in edit mode */}
      {removeTarget && (
        <div
          onClick={() => { if (!removing) setConfirmRemoveId(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 660, width: "100%", padding: "26px 28px", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>Remove {removeTarget.name}?</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Choose how you want to remove this company.</p>
            <div style={{ display: "flex", gap: 14 }}>
              <button type="button" onClick={() => { hideFromView(removeTarget.id); setConfirmRemoveId(null); }} disabled={removing}
                style={{ flex: 1, textAlign: "left", background: "var(--white)", color: "var(--navy)", border: "1px solid var(--border)", padding: "16px", cursor: removing ? "default" : "pointer" }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Remove from this view only</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>Hides it from the current list and the Excel export. Not deleted — use “Restore hidden” to bring it back.</span>
              </button>
              <button type="button" onClick={() => removeCompany(removeTarget)} disabled={removing}
                style={{ flex: 1, textAlign: "left", background: "var(--white)", color: "var(--danger-text)", border: "1px solid var(--border-danger)", padding: "16px", cursor: removing ? "default" : "pointer" }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{removing ? "Deleting…" : "Delete from the company database"}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--danger-muted)", lineHeight: 1.5 }}>Removes it from the database. Kept internally as rejected, so it can be restored later and won’t be re-discovered.</span>
              </button>
            </div>
            <div style={{ marginTop: 20 }}>
              <button type="button" onClick={() => setConfirmRemoveId(null)} disabled={removing}
                style={{ background: "var(--surface)", color: "var(--text-slate)", border: "1px solid var(--border)", padding: "9px 22px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: removing ? "default" : "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved-edit guard — shown only when a row edit has actually been changed */}
      {pendingNav && (
        <div onClick={() => setPendingNav(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 460, width: "100%", padding: "24px 26px", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>You have unsaved changes</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Discard your edits to this company and continue?</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => { const go = pendingNav; cancelEdit(); setPendingNav(null); if (go) go(); }}
                style={{ ...btnSecondary, color: "var(--danger-text)", border: "1px solid var(--border-danger)" }}>
                Discard changes
              </button>
              <button type="button" onClick={() => setPendingNav(null)} style={{ ...btnPrimary }}>
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export guard — unsaved edits aren't in the saved data the export reads */}
      {pendingExport && (
        <div onClick={() => setPendingExport(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 460, width: "100%", padding: "24px 26px", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>You have unsaved changes</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Your unsaved edits won’t be included in the Excel export. Export anyway?</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => { setPendingExport(false); handleExportExcel(); }}
                style={{ ...btnSecondary }}>
                Export anyway
              </button>
              <button type="button" onClick={() => setPendingExport(false)} style={{ ...btnPrimary }}>
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue warning — pops up when the user clicks Search while >= 5 companies are still waiting */}
      {queueModalOpen && (
        <div onClick={() => { if (!clearingQueue) setQueueModalOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 520, width: "100%", padding: "26px 28px", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>{pendingQueueCount} companies are still waiting to be researched</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
              If you search now, the app will only research this waiting list — your selected sources and terms will <strong>not</strong> be searched, because it looks for new companies only once the list is below 5. Choose what to do:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button type="button" disabled={clearingQueue} onClick={() => { setQueueModalOpen(false); handleAgentSearch(); }}
                style={{ textAlign: "left", background: "var(--white)", color: "var(--navy)", border: "1px solid var(--border)", borderRadius: 4, padding: "14px 16px", cursor: clearingQueue ? "default" : "pointer" }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Research the waiting list</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>Runs the search on the {pendingQueueCount} waiting companies. Your selected sources/terms are searched on a later run.</span>
              </button>
              <button type="button" disabled={clearingQueue} onClick={async () => { await clearQueue(); setQueueModalOpen(false); handleAgentSearch(); }}
                style={{ textAlign: "left", background: "var(--white)", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "14px 16px", cursor: clearingQueue ? "default" : "pointer" }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{clearingQueue ? "Clearing…" : "Clear the list & search my selections"}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>Removes the waiting companies (not yet researched; may be found again later), then searches your selected sources and terms.</span>
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="button" disabled={clearingQueue} onClick={() => setQueueModalOpen(false)}
                style={{ background: "var(--surface)", color: "var(--text-slate)", border: "1px solid var(--border)", padding: "9px 22px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: clearingQueue ? "default" : "pointer", borderRadius: 4 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-source modal — opened by "+ Add new source" in the Search Configuration panel */}
      {sourceModalOpen && (
        <div onClick={() => { if (!configBusy) { setSourceModalOpen(false); setConfigError(""); } }}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 520, width: "100%", padding: "26px 28px", boxShadow: "0 12px 40px rgba(12,28,46,0.25)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>{editingSourceKey ? "Edit source" : "Add a source"}</p>
              <button type="button" title="What do these fields mean?" aria-label="Help" onClick={() => setSourceInfoOpen(v => !v)}
                style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", border: "1px solid var(--border)", background: sourceInfoOpen ? "var(--accent)" : "var(--white)", color: sourceInfoOpen ? "var(--white)" : "var(--text-muted)", fontSize: 13, fontWeight: 700, fontStyle: "italic", cursor: "pointer", lineHeight: 1, fontFamily: "Georgia, serif" }}>i</button>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Applied to the draft — nothing is saved until you press <strong>Save changes</strong> in the panel. <span style={reqStyle}>*</span>
              <span style={{ marginLeft: 4 }}>marks a required field.</span>
            </p>
            {sourceInfoOpen && (
              <div style={{ background: "var(--banner-info-bg)", border: "1px solid var(--banner-info-border)", borderRadius: 4, padding: "12px 14px", marginBottom: 18, fontSize: 12.5, color: "var(--banner-info-text)", lineHeight: 1.6 }}>
                <p style={{ marginBottom: 8 }}><strong>Which type should I choose?</strong></p>
                <p style={{ marginBottom: 8 }}><strong>Website</strong> — the AI runs a web search across the whole site, once per search term, looking for companies mentioned anywhere on it. Choose this for an ongoing publication that keeps posting new articles (e.g. a trade-news site). It needs a <strong>search prefix</strong> — usually the domain (like <em>nutraingredients.com</em>) — which is put in front of each term to keep the search on that site.</p>
                <p style={{ marginBottom: 8 }}><strong>Single page</strong> — the AI reads one specific URL, once, and pulls the companies from it. Choose this when you want it to go through a single fixed page, e.g. a <em>“Top 10 supplement brands for 2026”</em> list. Best for a fixed list — re-running finds nothing new after the first read.</p>
                <p style={{ margin: 0 }}><strong>Note to the AI</strong> is a free-text instruction for this source — e.g. a paywall tip or a region to focus on.</p>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Name <span style={reqStyle}>*</span></label>
                <input type="text" autoFocus value={newSource.name} onChange={e => setNewSource({ ...newSource, name: e.target.value })}
                  placeholder="e.g. Nutrition Insight" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Type <span style={reqStyle}>*</span></label>
                <select value={newSource.type} onChange={e => setNewSource({ ...newSource, type: e.target.value as "web site" | "web page" | "youtube" })} style={inputStyle}>
                  <option value="web site">Website</option>
                  <option value="web page">Single page</option>
                  <option value="youtube">YouTube search</option>
                </select>
              </div>
              {newSource.type === "web site" ? (
                <>
                  <div>
                    <label style={labelStyle}>Search prefix <span style={reqStyle}>*</span></label>
                    <input type="text" value={newSource.search_prefix} onChange={e => setNewSource({ ...newSource, search_prefix: e.target.value })}
                      placeholder="e.g. nutraingredients.com Europe" style={inputStyle} />
                    <p style={hintStyle}>Put in front of each search term to target this site — the search becomes <em>“&lt;prefix&gt; &lt;term&gt;”</em>, e.g. <em>nutraingredients.com longevity</em>. Usually just the domain.</p>
                  </div>
                  <div>
                    <label style={labelStyle}>Homepage URL <span style={optStyle}>optional</span></label>
                    <input type="text" value={newSource.url} onChange={e => setNewSource({ ...newSource, url: e.target.value })}
                      placeholder="https://www.nutraingredients.com" style={inputStyle} />
                  </div>
                </>
              ) : newSource.type === "youtube" ? (
                <div>
                  <label style={labelStyle}>Query bias <span style={optStyle}>optional</span></label>
                  <input type="text" value={newSource.search_prefix} onChange={e => setNewSource({ ...newSource, search_prefix: e.target.value })}
                    placeholder="e.g. supplement review" style={inputStyle} />
                  <p style={hintStyle}>Optional words added in front of each term when searching YouTube, e.g. <em>supplement review longevity</em>. Leave blank to search the term alone. (Requires the server’s YouTube API key.)</p>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>Page URL <span style={reqStyle}>*</span></label>
                  <input type="text" value={newSource.url} onChange={e => setNewSource({ ...newSource, url: e.target.value })}
                    placeholder="https://www.healthline.com/nutrition/best-vitamin-brands" style={inputStyle} />
                  <p style={hintStyle}>The exact page to read. Fetched once — best for a fixed list of brands.</p>
                </div>
              )}
              <div>
                <label style={labelStyle}>Note to the AI <span style={optStyle}>optional</span></label>
                <textarea value={newSource.note} onChange={e => setNewSource({ ...newSource, note: e.target.value })} rows={3}
                  placeholder={'e.g. Serves the US edition by default — always keep "Europe" in the query.'}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
                <p style={hintStyle}>Passed to the AI as an instruction for this source (paywall tips, region focus, etc.).</p>
              </div>
            </div>
            {configError && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 14 }}>{configError}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button type="button" onClick={applySource} disabled={!newSource.name.trim()}
                style={{ ...btnPrimary, opacity: !newSource.name.trim() ? 0.6 : 1 }}>
                {editingSourceKey ? "Update source" : "Add source"}
              </button>
              <button type="button" onClick={() => { setSourceModalOpen(false); setConfigError(""); }} style={{ ...btnSecondary }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
