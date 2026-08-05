"use client";

import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_ICP_REVIEW_INSTRUCTIONS, ICP_REVIEW_INSTRUCTIONS_KEY } from "@/lib/icpReview";
import { US_MARKET_ENABLED } from "@/lib/features";
import { ICP_TEST_COMPANIES_KEY, EXPECTED_LABELS, expectedMatch, type IcpTestExample, type ExpectedCategory } from "@/lib/icpTest";
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
const SOURCE_OPTIONS = ((sourcesConfig as { sources?: { name: string; type?: string; url?: string; market?: string }[] }).sources ?? [])
  .map(s => ({ name: s.name, type: s.type ?? "web site", url: s.url ?? "", market: s.market ?? "", times_used: 0, companies_found: 0 }));

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
  added_at?: string | null;
  enriched_at?: string | null;
  status?: string | null;
};

// Outreach status the user can set per company (migration 015). Values are stored; labels are shown.
const STATUS_OPTIONS = [
  { value: "not_contacted", label: "Not contacted" },
  { value: "contacted", label: "Contacted" },
  { value: "in_dialogue", label: "In dialogue" },
  { value: "not_relevant", label: "Not relevant" },
];

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

// Small EU / US / Global tag shown next to a source so the user knows which market it leans toward.
function MarketBadge({ market }: { market?: string | null }) {
  if (!market) return null;
  const m = market.toUpperCase();
  const isEU = m === "EU", isUS = m === "US";
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", padding: "1px 5px", borderRadius: 3, marginLeft: 6, textTransform: "uppercase", whiteSpace: "nowrap",
      background: isEU ? "var(--badge-green-bg)" : isUS ? "var(--banner-info-bg)" : "var(--surface-hover)",
      color: isEU ? "var(--success)" : isUS ? "var(--banner-info-text)" : "var(--text-muted)" }}>{market}</span>
  );
}

// Simple pilot login screen (NOT secure — see migration 011). Calls back to the parent to log in /
// create an account against the plain app_users table; the callbacks return an error string or null.
function AuthScreen({ onLogin, onSignup }: { onLogin: (e: string, p: string) => Promise<string | null>; onSignup: (e: string, p: string) => Promise<string | null> }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email.trim() || !password) { setError("Enter an email and a password."); return; }
    setBusy(true); setError("");
    const err = mode === "login" ? await onLogin(email, password) : await onSignup(email, password);
    if (err) { setError(err); setBusy(false); } // on success the parent swaps to the app
  };
  return (
    <div style={{ minHeight: "100vh", background: "var(--page)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 420, width: "100%", boxShadow: "0 12px 40px rgba(12,28,46,0.12)" }}>
        <div style={{ background: "var(--header)", padding: "18px 24px", borderBottom: "3px solid var(--accent)" }}>
          <p style={{ color: "var(--white)", fontSize: 18, fontWeight: 700 }}>Lysoveta Customer Finder</p>
        </div>
        <div style={{ padding: "24px 26px" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
            {(["login", "signup"] as const).map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(""); }}
                style={{ flex: 1, padding: "8px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: mode === m ? "var(--accent)" : "var(--surface)", color: mode === m ? "var(--white)" : "var(--text-slate)" }}>
                {m === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} autoFocus onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="you@company.com" style={{ ...inputStyle, marginBottom: 12 }} />
          <label style={labelStyle}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="Lysoveta123" style={inputStyle} />
          {error && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 10 }}>{error}</p>}
          <button type="button" onClick={submit} disabled={busy} style={{ ...btnPrimary, width: "100%", marginTop: 16, padding: "11px", opacity: busy ? 0.6 : 1 }}>
            {busy ? "…" : mode === "login" ? "Log in →" : "Create account →"}
          </button>
          <div style={{ background: "var(--banner-warn-bg)", border: "1px solid var(--banner-warn-border)", borderRadius: 4, padding: "10px 12px", marginTop: 16 }}>
            <p style={{ fontSize: 11.5, color: "var(--banner-warn-text)", lineHeight: 1.55 }}>
              This is a pilot login with <strong>no real security yet</strong> — please don&apos;t reuse a password you use elsewhere. Pick something simple like <strong>Lysoveta123</strong>. Proper security is handled at handover.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Search-configuration draft types (edit mode edits a local draft; Save commits the diff) ---
type SourceFields = { name: string; type: "web site" | "web page" | "youtube"; url: string; search_prefix: string; note: string; market: string };
type SourceRecord = SourceFields & { id: number; times_used: number; companies_found: number };
type DraftTerm = { key: string; id: number | null; term: string; is_default: boolean };
type DraftSource = SourceFields & { key: string; id: number | null };

const AUTH_KEY = "cf_auth"; // localStorage key for the simple pilot login
const AUTH_MAX_AGE = 14 * 24 * 60 * 60 * 1000; // auto-logout after 2 weeks

// A simple line-level diff (LCS) for showing what the AI changed in an ICP draft before it's applied.
// Returns segments in order: "equal" (unchanged), "remove" (old line dropped), "add" (new line).
type DiffSeg = { type: "equal" | "add" | "remove"; text: string };
function diffLines(oldText: string, newText: string): DiffSeg[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length, m = b.length;
  // LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffSeg[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "equal", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "remove", text: a[i] }); i++; }
    else { out.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: "remove", text: a[i] }); i++; }
  while (j < m) { out.push({ type: "add", text: b[j] }); j++; }
  return out;
}

export default function Home() {
  // Simple pilot login. undefined = still checking localStorage; null = logged out; string = email.
  const [authEmail, setAuthEmail] = useState<string | null | undefined>(undefined);
  const [tab, setTab] = useState<"database" | "search" | "icp" | "prospectus" | "about">("database");
  const [aboutSection, setAboutSection] = useState("overview");
  const [icpDocs, setIcpDocs] = useState<{ eu: string; us: string } | null>(null);
  const [icpRegion, setIcpRegion] = useState<"eu" | "us">("eu");
  // ICP editing (stored in the DB; falls back to config files). Free-form Markdown per market, with
  // a version snapshot on every save so edits can be reverted.
  const [icpEditMode, setIcpEditMode] = useState(false);
  const [icpDraft, setIcpDraft] = useState("");
  const [icpSaving, setIcpSaving] = useState(false);
  const [icpError, setIcpError] = useState("");
  const [icpHistoryOpen, setIcpHistoryOpen] = useState(false);
  const [icpVersions, setIcpVersions] = useState<{ id: number; content: string; saved_by: string | null; created_at: string }[]>([]);
  // Advisory AI review of an edit before it's saved (never blocks — user can save anyway).
  const [icpChecking, setIcpChecking] = useState(false);
  const [icpCheck, setIcpCheck] = useState<{ ok: boolean | null; summary: string; issues: { severity: string; text: string }[]; error?: string } | null>(null);
  // Applying a single suggestion: the AI rewrites the draft for that point; the result loads back
  // into the editor (not saved). icpApplying = index being applied; note/error give feedback.
  const [icpApplying, setIcpApplying] = useState<number | null>(null);
  const [icpApplyNote, setIcpApplyNote] = useState("");
  const [icpApplyError, setIcpApplyError] = useState("");
  // A proposed AI rewrite awaiting the user's OK — shown as a diff before it goes into the editor.
  const [icpDiff, setIcpDiff] = useState<{ revised: string; segments: DiffSeg[]; issueIdx: number } | null>(null);
  // Optional "test on example companies" — scores real enriched companies against the current draft.
  type IcpTestRow = { name: string; icp_score: number; priority_tier: string; geography: string; product_category: string; included: boolean; reason: string; expected: ExpectedCategory };
  const [icpTesting, setIcpTesting] = useState(false);
  const [icpTestResults, setIcpTestResults] = useState<IcpTestRow[] | null>(null);
  const [icpTestError, setIcpTestError] = useState("");
  const [icpTestEmpty, setIcpTestEmpty] = useState(false);
  // The fixed, user-editable example set (from app_settings) + the "Manage examples" modal.
  const [icpTestSet, setIcpTestSet] = useState<IcpTestExample[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageDraft, setManageDraft] = useState<IcpTestExample[]>([]);
  const [manageOptions, setManageOptions] = useState<{ name: string; priority_tier: string | null; added: boolean; rejected: boolean }[]>([]);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState("");
  // The editable AI-review instructions (the rubric), shown/edited in the "What does the AI review
  // check?" window. Stored in app_settings; defaults to DEFAULT_ICP_REVIEW_INSTRUCTIONS.
  const [reviewInstructions, setReviewInstructions] = useState(DEFAULT_ICP_REVIEW_INSTRUCTIONS);
  const [reviewInfoOpen, setReviewInfoOpen] = useState(false);
  const [reviewEditing, setReviewEditing] = useState(false);
  const [reviewDraft, setReviewDraft] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewInfoError, setReviewInfoError] = useState("");

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
  // Row selection in the Company Database — pick specific companies to view-only / export.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  // Manual "Add company" form (pop-up) — lets users enter a company they came across themselves.
  const EMPTY_ADD_FORM = { name: "", website_url: "", geography: "EU", product_category: CAT_OPTIONS[0], max_price: "", price_currency: "", icp_fit: 3, priority_tier: "", description: "", source_name: "" };
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addFormError, setAddFormError] = useState("");

  // --- Search tab state ---
  const [agentState, setAgentState] = useState<"idle" | "stale_warning" | "searching" | "done" | "error">("idle")
  const [agentError, setAgentError] = useState<{ title: string; detail: string; canRetry: boolean } | null>(null)
  const [staleCompanies, setStaleCompanies] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [pendingCompanies, setPendingCompanies] = useState<PendingCompany[]>([]);
  const [addingState, setAddingState] = useState<"idle" | "form" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState("");
  const [sourceNameMap, setSourceNameMap] = useState<Record<string, string>>({});
  const [expandedCompanyId, setExpandedCompanyId] = useState<number | null>(null);

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
  const savedBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of companies) {
      if (!c.source_name) continue;
      m.set(c.source_name, (m.get(c.source_name) ?? 0) + 1);
    }
    return m;
  }, [companies]);

  // Loads the active company database — always excludes rejected companies.
  // Single source of truth so the database view can never accidentally include rejected rows.
  async function loadCompanies() {
    const { data } = await supabase.from("companies").select("*");
    if (data) setCompanies(data.filter((c: Company) => c.added && !c.rejected) as Company[]);
  }

  // Manual add: open the form fresh, and save a user-entered company straight into the database.
  function openAddCompany() { setAddForm(EMPTY_ADD_FORM); setAddFormError(""); setAddOpen(true); }
  async function submitAddCompany() {
    const name = addForm.name.trim();
    if (!name) { setAddFormError("Company name is required."); return; }
    setAddSaving(true); setAddFormError("");
    const { error } = await supabase.from("companies").upsert({
      name,
      website_url: addForm.website_url.trim() || null,
      geography: addForm.geography,
      product_category: addForm.product_category,
      max_price: addForm.max_price ? Number(addForm.max_price) : null,
      price_currency: addForm.price_currency || null,
      icp_fit: addForm.icp_fit,
      priority_tier: addForm.priority_tier || null,
      description: addForm.description.trim() || null,
      source_name: addForm.source_name.trim() || "Manually added",
      added: true,
      rejected: false,
      added_at: new Date().toISOString(),
      status: "not_contacted",
    }, { onConflict: "name" });
    if (error) { setAddFormError("Could not save: " + error.message); setAddSaving(false); return; }
    await loadCompanies();
    setAddSaving(false); setAddOpen(false);
    // Reset to show-all so the newly added company is visible right away.
    setSearchParams({ geography: "All", category: "", priceMin: "", priceMax: "", icpMin: 1, tier: "All" });
    setSearchState("done");
  }

  // "Date added" to the database — falls back to enriched_at for rows saved before added_at existed.
  function fmtAddedDate(c: Company): string {
    const iso = c.added_at ?? c.enriched_at;
    return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
  }
  // Update a company's outreach status (optimistic — writes straight to the DB).
  async function updateCompanyStatus(id: number, status: string) {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    const { error } = await supabase.from("companies").update({ status }).eq("id", id);
    if (error) { console.error("[status] update failed:", error.message); loadCompanies(); }
  }

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
  async function loadIcp() {
    const [fileDocs, dbRes] = await Promise.all([
      fetch("/api/icp").then(r => r.json()).catch(() => ({ eu: "", us: "" })),
      supabase.from("icp_docs").select("market, content"),
    ]);
    const dbMap = new Map((dbRes.data ?? []).map((r: { market: string; content: string }) => [r.market, r.content]));
    const pick = (m: "eu" | "us") => {
      const db = ((dbMap.get(m) as string) ?? "").trim();
      return db ? (dbMap.get(m) as string) : (fileDocs[m] ?? fileDocs.content ?? "");
    };
    setIcpDocs({ eu: pick("eu"), us: pick("us") });
  }
  function enterIcpEdit() {
    setIcpDraft(icpDocs?.[icpRegion] ?? "");
    setIcpError(""); setIcpHistoryOpen(false); setIcpCheck(null); setIcpApplyNote(""); setIcpApplyError(""); setIcpDiff(null);
    setIcpTestResults(null); setIcpTestError(""); setIcpTestEmpty(false); setIcpEditMode(true);
  }
  function cancelIcpEdit() { setIcpEditMode(false); setIcpError(""); setIcpHistoryOpen(false); setIcpCheck(null); setIcpApplyNote(""); setIcpApplyError(""); setIcpDiff(null); setIcpTestResults(null); setIcpTestError(""); setIcpTestEmpty(false); }

  // Apply one review suggestion: the AI rewrites the draft for that single point. The result is shown
  // as a DIFF first (acceptIcpDiff / discardIcpDiff) so the user sees exactly what changed before it
  // goes into the editor — nothing is saved.
  async function applyIcpFix(issueText: string, idx: number) {
    setIcpApplying(idx); setIcpApplyError(""); setIcpApplyNote("");
    try {
      const workerBase = process.env.NEXT_PUBLIC_WORKER_URL ?? "";
      const res = await fetch(`${workerBase}/api/icp/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: icpDraft, market: icpRegion, issue: issueText }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.content !== "string") throw new Error(data.error ?? "Could not apply the suggestion.");
      setIcpDiff({ revised: data.content, segments: diffLines(icpDraft, data.content), issueIdx: idx });
    } catch (err) {
      setIcpApplyError(icpNetworkMsg(err));
    } finally {
      setIcpApplying(null);
    }
  }
  function acceptIcpDiff() {
    if (!icpDiff) return;
    const idx = icpDiff.issueIdx;
    setIcpDraft(icpDiff.revised);
    // Drop the applied point from the panel; the rest still apply to the now-updated draft.
    setIcpCheck(prev => {
      if (!prev) return prev;
      const remaining = prev.issues.filter((_, i) => i !== idx);
      return remaining.length ? { ...prev, issues: remaining } : null;
    });
    setIcpApplyNote("Applied — the change is now in the editor above. Review it (edit further if you like), then Save changes when you're ready.");
    setIcpDiff(null);
  }
  function discardIcpDiff() { setIcpDiff(null); }

  // Turns a raw fetch error into a friendly message. "Failed to fetch" (a TypeError from fetch) means
  // the worker never answered — almost always a cold Render worker waking up, or a redeploy in flight.
  function icpNetworkMsg(err: unknown): string {
    const m = err instanceof Error ? err.message : String(err);
    if (/failed to fetch|networkerror|load failed|fetch failed/i.test(m)) {
      return "couldn’t reach the server — it may be waking up after being idle (this can take ~30 seconds). Wait a moment and try again.";
    }
    return m;
  }

  // Optional test: score a sample of enriched companies against whatever is in the editor right now.
  // Can be run any time — before or after the review / applied fixes.
  async function testIcp() {
    if (!icpDraft.trim()) { setIcpError("The ICP text can't be empty."); return; }
    setIcpTesting(true); setIcpTestError(""); setIcpTestEmpty(false); setIcpTestResults(null);
    try {
      const workerBase = process.env.NEXT_PUBLIC_WORKER_URL ?? "";
      const res = await fetch(`${workerBase}/api/icp/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: icpDraft, market: icpRegion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed.");
      if (data.empty) { setIcpTestEmpty(true); setIcpTestResults([]); }
      else setIcpTestResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setIcpTestError(icpNetworkMsg(err));
    } finally {
      setIcpTesting(false);
    }
  }

  // Save flow: run an advisory AI review first. If it comes back clean, save straight away; if it
  // finds issues (or can't run), show them and let the user save anyway or keep editing.
  async function reviewIcp() {
    if (!icpDraft.trim()) { setIcpError("The ICP text can't be empty."); return; }
    setIcpError(""); setIcpCheck(null); setIcpApplyNote(""); setIcpApplyError(""); setIcpDiff(null); setIcpChecking(true);
    try {
      const workerBase = process.env.NEXT_PUBLIC_WORKER_URL ?? "";
      const res = await fetch(`${workerBase}/api/icp/check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: icpDraft, market: icpRegion }),
      });
      const data = await res.json();
      const issues = Array.isArray(data.issues) ? data.issues : [];
      // Always show the result and let the user press Save — the button says "review", so saving is
      // never automatic (even when the review is clean).
      setIcpCheck({ ok: data.ok ?? null, summary: data.summary ?? "", issues, error: data.error });
    } catch (err) {
      // Review couldn't run — advisory only, so let the user decide to save anyway.
      setIcpCheck({ ok: null, summary: "", issues: [], error: icpNetworkMsg(err) });
    } finally {
      setIcpChecking(false);
    }
  }
  async function commitIcp() {
    if (!icpDraft.trim()) { setIcpError("The ICP text can't be empty."); return; }
    setIcpSaving(true);
    const { error } = await supabase.from("icp_docs").upsert(
      { market: icpRegion, content: icpDraft, updated_at: new Date().toISOString() }, { onConflict: "market" });
    if (error) { setIcpError("Could not save: " + error.message); setIcpSaving(false); return; }
    // Snapshot this version so it can be reverted later (best-effort — a failed snapshot doesn't block the save).
    await supabase.from("icp_doc_versions").insert({ market: icpRegion, content: icpDraft, saved_by: authEmail ?? null });
    await loadIcp();
    setIcpSaving(false); setIcpEditMode(false); setIcpHistoryOpen(false); setIcpCheck(null); setIcpApplyNote(""); setIcpApplyError("");
  }
  async function toggleIcpHistory() {
    const next = !icpHistoryOpen;
    setIcpHistoryOpen(next);
    if (next) {
      const { data } = await supabase.from("icp_doc_versions")
        .select("id, content, saved_by, created_at").eq("market", icpRegion)
        .order("created_at", { ascending: false }).limit(30);
      setIcpVersions((data ?? []) as { id: number; content: string; saved_by: string | null; created_at: string }[]);
    }
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
    const rev = map.get(ICP_REVIEW_INSTRUCTIONS_KEY) as string | undefined;
    if (rev && rev.trim()) setReviewInstructions(rev);
    const testSet = map.get(ICP_TEST_COMPANIES_KEY) as string | undefined;
    if (testSet) { try { const p = JSON.parse(testSet); if (Array.isArray(p)) setIcpTestSet(p.filter((e) => e && typeof e.name === "string")); } catch { /* ignore */ } }
  }

  // --- Manage the example-companies set (fixed, user-editable, in app_settings) ---
  async function openManageExamples() {
    setManageDraft(icpTestSet.map(e => ({ ...e })));
    setManageError(""); setManageOpen(true);
    // Load the pool of companies that CAN be examples (have enriched_data), with tier + flags.
    const { data } = await supabase.from("companies").select("name, priority_tier, added, rejected").not("enriched_data", "is", null).order("enriched_at", { ascending: false });
    setManageOptions((data ?? []).map((r: { name: string; priority_tier: string | null; added: boolean; rejected: boolean }) => ({ name: r.name, priority_tier: r.priority_tier, added: r.added, rejected: r.rejected })));
  }
  function suggestStarterSet() {
    // 2 early movers, 1 follower, 1 enabler (from approved companies by tier) + 2 clearly rejected.
    const pick = (n: number, fn: (o: typeof manageOptions[number]) => boolean, expected: ExpectedCategory) =>
      manageOptions.filter(fn).slice(0, n).map(o => ({ name: o.name, expected }));
    const draft: IcpTestExample[] = [
      ...pick(2, o => o.added && o.priority_tier === "early_mover", "early_mover"),
      ...pick(1, o => o.added && o.priority_tier === "follower", "follower"),
      ...pick(1, o => o.added && o.priority_tier === "enabler", "enabler"),
      ...pick(2, o => o.rejected, "reject"),
    ];
    // De-dupe by name (a company could match two filters in odd data).
    const seen = new Set<string>();
    setManageDraft(draft.filter(e => (seen.has(e.name) ? false : (seen.add(e.name), true))));
    setManageError("");
  }
  function addExample(name: string) {
    if (!name || manageDraft.some(e => e.name === name)) return;
    setManageDraft(prev => [...prev, { name, expected: "" }]);
  }
  function setExampleExpected(name: string, expected: ExpectedCategory) {
    setManageDraft(prev => prev.map(e => e.name === name ? { ...e, expected } : e));
  }
  function removeExample(name: string) { setManageDraft(prev => prev.filter(e => e.name !== name)); }
  async function saveExamples() {
    setManageSaving(true);
    const { error } = await supabase.from("app_settings").upsert(
      { key: ICP_TEST_COMPANIES_KEY, value: JSON.stringify(manageDraft), updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) { setManageError("Could not save: " + error.message); setManageSaving(false); return; }
    setIcpTestSet(manageDraft); setManageSaving(false); setManageOpen(false);
  }

  // --- AI-review instructions (the editable rubric shown in "What does the AI review check?") ---
  function openReviewInfo() { setReviewEditing(false); setReviewInfoError(""); setReviewInfoOpen(true); }
  function editReviewInstructions() { setReviewDraft(reviewInstructions); setReviewInfoError(""); setReviewEditing(true); }
  async function saveReviewInstructions() {
    if (!reviewDraft.trim()) { setReviewInfoError("The instructions can't be empty."); return; }
    setReviewSaving(true);
    const { error } = await supabase.from("app_settings").upsert(
      { key: ICP_REVIEW_INSTRUCTIONS_KEY, value: reviewDraft, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) { setReviewInfoError("Could not save: " + error.message); setReviewSaving(false); return; }
    setReviewInstructions(reviewDraft); setReviewSaving(false); setReviewEditing(false);
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
    loadCompanies();
    loadIcp();
    loadSearchConfig();
    loadPendingCount();
    loadSettings();
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
    () => results.filter((c) => !hiddenIds.has(c.id) && (!showOnlySelected || selectedIds.has(c.id))),
    [results, hiddenIds, showOnlySelected, selectedIds]
  );

  // Toggle one row's selection; if it empties the selection, drop out of "view only" mode.
  function toggleSelected(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setShowOnlySelected(false);
      return next;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); setShowOnlySelected(false); }
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
        { header: "Added", key: "added", width: 14 },
        { header: "Status", key: "status", width: 16 },
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
          added: fmtAddedDate(c),
          status: STATUS_OPTIONS.find(o => o.value === (c.status ?? "not_contacted"))?.label ?? "",
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
        {tab === "database" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <button onClick={() => guardUnsavedEdit(() => { setSearchParams({ geography: "All", category: "", priceMin: "", priceMax: "", icpMin: 1, tier: "All" }); setSearchState("done"); })}
                style={{ ...btnSecondary, padding: "12px 36px", fontSize: 13, letterSpacing: "0.08em" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--white)")}>
                Show All Companies →
              </button>
              <button onClick={openAddCompany}
                style={{ ...btnPrimary, padding: "12px 28px", fontSize: 13, letterSpacing: "0.08em" }}>
                + Add Company
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
                      {visibleResults.length} {visibleResults.length !== 1 ? "companies" : "company"}{hiddenIds.size > 0 ? ` · ${hiddenIds.size} hidden` : ""}{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
                    </p>
                    {selectedIds.size > 0 && (
                      <>
                        <button type="button" onClick={() => setShowOnlySelected(v => !v)}
                          style={{ background: showOnlySelected ? "var(--white)" : "transparent", color: showOnlySelected ? "var(--header)" : "var(--on-dark)", border: "1px solid var(--border-on-dark)", padding: "5px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", borderRadius: 4 }}>
                          {showOnlySelected ? "Show all" : "View only selected"}
                        </button>
                        <button type="button" onClick={clearSelection}
                          style={{ background: "transparent", color: "var(--on-dark)", border: "1px solid var(--border-on-dark)", padding: "5px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", borderRadius: 4 }}>
                          Clear selection
                        </button>
                      </>
                    )}
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
                  <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-table-head)", borderBottom: "1px solid var(--border-card)" }}>
                        <th style={{ padding: "10px 8px 10px 14px", width: 1 }}>
                          <input type="checkbox" aria-label="Select all shown"
                            checked={visibleResults.length > 0 && visibleResults.every(c => selectedIds.has(c.id))}
                            onChange={e => {
                              const check = e.target.checked;
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (check) visibleResults.forEach(c => next.add(c.id));
                                else { visibleResults.forEach(c => next.delete(c.id)); if (next.size === 0) setShowOnlySelected(false); }
                                return next;
                              });
                            }}
                            style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
                        </th>
                        {["Company", "Website", "Source", "Geography", "Category", "Max. Price", "Priority", "ICP Fit", "Added", "Status"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-slate)" }}>{h}</th>
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
                            <td style={{ padding: "12px 8px 12px 14px", width: 1 }} onClick={e => e.stopPropagation()}>
                              <input type="checkbox" aria-label={`Select ${c.name}`} checked={selectedIds.has(c.id)}
                                onChange={() => toggleSelected(c.id)}
                                style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
                            </td>
                            <td style={{ padding: "12px 14px", fontWeight: 600, color: "var(--navy)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                            <td style={{ padding: "12px 14px", wordBreak: "break-word" }}>
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
                            <td style={{ padding: "12px 14px", color: "var(--text-body)", fontSize: 12 }}>
                              {c.source_name ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                            </td>
                            <td style={{ padding: "12px 14px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{c.geography}</td>
                            <td style={{ padding: "12px 14px", color: "var(--text-body)" }}>{c.product_category}</td>
                            <td style={{ padding: "12px 14px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{c.max_price != null ? `${c.price_currency === "GBP" ? "£" : c.price_currency === "USD" ? "$" : c.price_currency === "EUR" ? "€" : ""}${c.max_price.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                            <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
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
                            <td style={{ padding: "12px 14px", fontSize: 13, letterSpacing: 1, color: icpColor(c.icp_fit), whiteSpace: "nowrap" }}>{"★".repeat(c.icp_fit)}{"☆".repeat(5 - c.icp_fit)}</td>
                            <td style={{ padding: "12px 14px", color: "var(--text-body)", fontSize: 12.5, whiteSpace: "nowrap" }}>{fmtAddedDate(c)}</td>
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                              <select value={c.status ?? "not_contacted"} onChange={e => updateCompanyStatus(c.id, e.target.value)}
                                style={{ fontSize: 12, padding: "5px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--white)", color: (c.status ?? "not_contacted") === "contacted" ? "var(--success-bright, #2e7d32)" : (c.status ?? "not_contacted") === "not_relevant" ? "var(--text-faint)" : "var(--text)", cursor: "pointer" }}>
                                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </td>
                          </tr>
                          {expandedCompanyId === c.id && (
                            <tr style={{ borderBottom: "1px solid var(--border-light)", background: i % 2 === 0 ? "var(--white)" : "var(--surface-input)" }}>
                              <td colSpan={11} style={{ padding: "0 20px 20px 48px" }}>
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
                  </div>
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
        {tab === "icp" && (
          <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 920, width: "100%", margin: "0 auto" }}>
            <div style={{ background: "var(--header)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Lysoveta ICP Criteria</p>
              {!icpEditMode && (
                <button type="button" onClick={enterIcpEdit}
                  style={{ background: "var(--accent)", border: "none", color: "var(--white)", padding: "5px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  ✎ Edit Criteria
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, padding: "10px 20px", borderBottom: "1px solid var(--border-light)", background: "var(--surface-tint)" }}>
              {([{ key: "eu", label: "European ICP" }, { key: "us", label: "US ICP" }] as const).map(r => {
                const usLocked = r.key === "us" && !US_MARKET_ENABLED; // US off → shown but disabled (placeholder)
                const disabled = icpEditMode || usLocked;
                return (
                  <button key={r.key} type="button" disabled={disabled} onClick={() => setIcpRegion(r.key)}
                    title={usLocked ? "US market support is coming later" : undefined}
                    style={{ padding: "7px 16px", borderRadius: 4, border: "none", cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
                      opacity: usLocked ? 0.45 : (icpEditMode && icpRegion !== r.key ? 0.4 : 1),
                      background: icpRegion === r.key ? "var(--accent)" : "transparent",
                      color: icpRegion === r.key ? "var(--white)" : "var(--text-slate)" }}>
                    {r.label}{usLocked ? " · soon" : ""}
                  </button>
                );
              })}
            </div>
            <div style={{ padding: "16px 40px", borderBottom: "1px solid var(--border-light)", background: "var(--surface-tint)" }}>
              <p style={{ color: "var(--text-body)", fontSize: 13, lineHeight: 1.6, fontStyle: "italic" }}>
                {icpRegion === "eu"
                  ? "The Ideal Customer Profile (ICP) for Lysoveta in Europe. In Step 3 the AI scores each company whose primary market is European against these criteria, assigning a priority tier (Early Mover, Follower, or Enabler) and an ICP fit score."
                  : "The US Ideal Customer Profile. Once it holds real criteria (not the placeholder), Step 3 automatically scores companies whose primary market is the United States against it instead of the European ICP."}
              </p>
            </div>
            {icpEditMode && (
              <div style={{ padding: "24px 40px" }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
                  Editing the <strong>{icpRegion === "eu" ? "European" : "US"}</strong> ICP. This text is the exact criteria the AI uses to score companies in Step 3 — write it as clear instructions (Markdown: <code>##</code> headings, <code>-</code> bullets, and <code>|</code> tables all render). Changes are shared and take effect on the next search. Every save is snapshotted so you can revert.
                </p>
                <textarea value={icpDraft} onChange={e => setIcpDraft(e.target.value)} spellCheck={false}
                  style={{ width: "100%", minHeight: 460, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: 1.6, color: "var(--text)", resize: "vertical" }} />
                {icpError && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 8 }}>{icpError}</p>}
                <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
                  <button type="button" onClick={reviewIcp} disabled={icpSaving || icpChecking}
                    style={{ ...btnPrimary, padding: "9px 24px", opacity: (icpSaving || icpChecking) ? 0.6 : 1 }}>{icpChecking ? "Reviewing…" : icpSaving ? "Saving…" : "Review changes with AI"}</button>
                  <button type="button" onClick={cancelIcpEdit} disabled={icpSaving || icpChecking}
                    style={{ ...btnSecondary, padding: "9px 22px" }}>Cancel</button>
                  <button type="button" onClick={testIcp} disabled={icpTesting || icpSaving || icpChecking || !icpDraft.trim()}
                    style={{ ...btnSecondary, padding: "9px 18px", opacity: (icpTesting || !icpDraft.trim()) ? 0.6 : 1 }}>
                    {icpTesting ? "Testing…" : "Test on example companies"}
                  </button>
                  <button type="button" onClick={toggleIcpHistory} disabled={icpChecking}
                    style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: 13, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>
                    {icpHistoryOpen ? "Hide version history" : "Version history"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 18, alignItems: "center", paddingTop: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={openReviewInfo}
                    style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left" }}>
                    ⓘ What does the AI review check?
                  </button>
                  <button type="button" onClick={openManageExamples}
                    style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left" }}>
                    ⚙ Manage test example companies{icpTestSet.length > 0 ? ` (${icpTestSet.length})` : ""}
                  </button>
                </div>

                {icpTestError && <p style={{ fontSize: 12.5, color: "var(--danger-text)", marginTop: 12 }}>Couldn’t run the test ({icpTestError}).</p>}
                {icpTestEmpty && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 12 }}>No example companies to test — click <strong>⚙ Manage test example companies</strong> to add some (or run a search first so there’s enriched company data).</p>}
                {icpTestResults && icpTestResults.length > 0 && (
                  <div style={{ marginTop: 14, border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ padding: "10px 16px", background: "var(--surface)", borderBottom: "1px solid var(--border-card)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>Test results — how the current draft scores</p>
                        <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>Scored against the text in the editor right now (not the saved ICP). A sample of real enriched companies — nothing is changed or saved.</p>
                      </div>
                      <button type="button" onClick={() => { setIcpTestResults(null); setIcpTestEmpty(false); }}
                        style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>×</button>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ textAlign: "left", color: "var(--text-muted)", borderBottom: "1px solid var(--border-card)" }}>
                            <th style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Company</th>
                            <th style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Geography</th>
                            <th style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Tier</th>
                            <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>Score</th>
                            <th style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Result</th>
                            <th style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Expected</th>
                            <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>Match</th>
                            <th style={{ padding: "8px 12px", fontWeight: 700 }}>Why</th>
                          </tr>
                        </thead>
                        <tbody>
                          {icpTestResults.map((r, k) => {
                            const m = expectedMatch(r.expected, r.included, r.priority_tier);
                            const expLabel = EXPECTED_LABELS.find(e => e.value === r.expected)?.label ?? "—";
                            return (
                            <tr key={k} style={{ borderBottom: "1px solid var(--border-card)", background: m === "mismatch" ? "var(--banner-warn-bg)" : r.included ? "transparent" : "var(--surface)" }}>
                              <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--navy)", whiteSpace: "nowrap" }}>{r.name}</td>
                              <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.geography || "—"}</td>
                              <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.priority_tier && r.priority_tier !== "none" ? r.priority_tier.replace(/_/g, " ") : "—"}</td>
                              <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, whiteSpace: "nowrap" }}>{r.icp_score}/5</td>
                              <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.included ? "var(--success-bright, #2e7d32)" : "var(--text-muted)", fontWeight: 700 }}>{r.included ? "✓ Include" : "Excluded"}</td>
                              <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "var(--text-muted)" }}>{r.expected ? expLabel : "—"}</td>
                              <td style={{ padding: "8px 12px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 700, color: m === "ok" ? "var(--success-bright, #2e7d32)" : m === "mismatch" ? "var(--danger-text)" : "var(--text-faint)" }}>{m === "ok" ? "✓" : m === "mismatch" ? "⚠" : "—"}</td>
                              <td style={{ padding: "8px 12px", color: "var(--text)", minWidth: 220 }}>{r.reason}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Proposed AI rewrite — shown as a diff so the change is obvious before it's applied. */}
                {icpDiff && (
                  <div style={{ marginTop: 14, border: "1px solid var(--accent)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ padding: "10px 16px", background: "var(--surface)", borderBottom: "1px solid var(--border-card)" }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>Proposed change — review before applying</p>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                        <span style={{ background: "var(--diff-add-bg, #e6f4ea)", padding: "0 4px", borderRadius: 2 }}>green = added</span>{" "}
                        <span style={{ background: "var(--diff-del-bg, #fce8e6)", padding: "0 4px", borderRadius: 2, textDecoration: "line-through" }}>red = removed</span>. Unchanged lines are shown for context.
                      </p>
                    </div>
                    <div style={{ maxHeight: 320, overflow: "auto", padding: "10px 0", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12.5, lineHeight: 1.55, background: "var(--white)" }}>
                      {icpDiff.segments.map((seg, k) => (
                        <div key={k} style={{
                          whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "0 16px",
                          background: seg.type === "add" ? "var(--diff-add-bg, #e6f4ea)" : seg.type === "remove" ? "var(--diff-del-bg, #fce8e6)" : "transparent",
                          color: seg.type === "remove" ? "var(--danger-text)" : seg.type === "add" ? "#1b5e20" : "var(--text-muted)",
                          textDecoration: seg.type === "remove" ? "line-through" : "none",
                        }}>
                          <span style={{ userSelect: "none", opacity: 0.6, marginRight: 8 }}>{seg.type === "add" ? "+" : seg.type === "remove" ? "−" : " "}</span>{seg.text || " "}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--border-card)", background: "var(--surface)" }}>
                      <button type="button" onClick={acceptIcpDiff} style={{ ...btnPrimary, padding: "8px 20px" }}>Use this version</button>
                      <button type="button" onClick={discardIcpDiff} style={{ ...btnSecondary, padding: "8px 20px" }}>Discard</button>
                    </div>
                  </div>
                )}

                {icpApplyNote && (
                  <div style={{ marginTop: 12, border: "1px solid var(--border-card)", borderLeft: "3px solid var(--success, #2e7d32)", borderRadius: 4, padding: "10px 14px", background: "var(--surface)" }}>
                    <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}>✓ {icpApplyNote}</p>
                  </div>
                )}

                {/* Advisory AI review — shown when the check found issues or couldn't run. Never blocks saving. */}
                {icpCheck && (
                  <div style={{ marginTop: 14, border: "1px solid var(--border-card)", borderRadius: 4, borderLeft: `3px solid ${icpCheck.issues.some(i => i.severity === "critical") ? "var(--danger-text)" : "var(--accent)"}`, padding: "14px 16px", background: "var(--surface)" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>
                      {icpCheck.ok === null ? "Couldn’t run the AI review" : icpCheck.issues.length === 0 ? "✓ AI review passed — no issues found" : icpCheck.issues.some(i => i.severity === "critical") ? "The AI review found some gaps" : "The AI review has a few suggestions"}
                    </p>
                    {icpCheck.error ? (
                      <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 10 }}>The review couldn’t run ({icpCheck.error}). This is only an advisory check — you can still save.</p>
                    ) : (
                      <>
                        {icpCheck.summary && <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, marginBottom: 8 }}>{icpCheck.summary}</p>}
                        {icpCheck.issues.length > 0 && (
                          <div style={{ margin: "0 0 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                            {icpCheck.issues.map((iss, idx) => (
                              <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                <span style={{ flex: 1, fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}>
                                  <strong style={{ color: iss.severity === "critical" ? "var(--danger-text)" : "var(--navy-mid)" }}>{iss.severity === "critical" ? "Critical: " : "Suggestion: "}</strong>{iss.text}
                                </span>
                                <button type="button" onClick={() => applyIcpFix(iss.text, idx)} disabled={icpApplying !== null || icpSaving || icpDiff !== null}
                                  style={{ ...btnSecondary, padding: "4px 12px", fontSize: 12, flexShrink: 0, opacity: (icpApplying !== null || icpSaving || icpDiff !== null) ? 0.6 : 1 }}>
                                  {icpApplying === idx ? "Applying…" : "Apply fix"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {icpApplyError && <p style={{ fontSize: 12, color: "var(--danger-text)", marginBottom: 8 }}>Couldn’t apply that suggestion ({icpApplyError}). You can edit the text manually or try again.</p>}
                        {icpCheck.issues.length > 0 ? (
                          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>“Apply fix” lets the AI rewrite the text for that one point — the update lands in the editor above for you to review, and nothing is saved until you press <strong>Save changes</strong>. This is advice, not a gate.</p>
                        ) : (
                          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>Nothing has been saved yet. Press <strong>Save changes</strong> to make this the live ICP, or keep editing.</p>
                        )}
                      </>
                    )}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button type="button" onClick={commitIcp} disabled={icpSaving}
                        style={{ ...btnPrimary, padding: "8px 20px", opacity: icpSaving ? 0.6 : 1 }}>{icpSaving ? "Saving…" : (icpCheck.ok === null || icpCheck.issues.length > 0) ? "Save anyway" : "Save changes"}</button>
                      <button type="button" onClick={() => setIcpCheck(null)} disabled={icpSaving}
                        style={{ ...btnSecondary, padding: "8px 20px" }}>Keep editing</button>
                    </div>
                  </div>
                )}
                {icpHistoryOpen && (
                  <div style={{ marginTop: 14, border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                    {icpVersions.length === 0 ? (
                      <p style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "12px 16px" }}>No saved versions yet — the first save you make will appear here.</p>
                    ) : icpVersions.map(v => (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border-card)" }}>
                        <span style={{ fontSize: 12.5, color: "var(--text)" }}>
                          {new Date(v.created_at).toLocaleString()}{v.saved_by ? ` · ${v.saved_by}` : ""}
                        </span>
                        <button type="button" onClick={() => { setIcpDraft(v.content); setIcpHistoryOpen(false); }}
                          style={{ ...btnSecondary, padding: "5px 14px", fontSize: 12 }}>Load into editor</button>
                      </div>
                    ))}
                    {icpVersions.length > 0 && (
                      <p style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "9px 16px" }}>“Load into editor” fills the box with that version — review it, then <strong>Save changes</strong> to make it current.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div style={{ padding: "32px 48px", maxWidth: 820, display: icpEditMode ? "none" : "block" }}>
              {!icpDocs ? (
                <p style={{ color: "var(--text-faint)", fontSize: 14 }}>Loading…</p>
              ) : (() => {
                const toLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                const stripBold = (s: string) => s.replace(/\*\*(.*?)\*\*/g, "$1");
                const isTableRow = (l: string) => l.trim().startsWith("|");
                const isSeparatorRow = (l: string) => /^\|[-| :]+\|$/.test(l.trim());

                const lines = (icpDocs[icpRegion] || "").split("\n");
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

        {/* ── TAB: How It Works ── */}
        {tab === "about" && (() => {
          const ps: React.CSSProperties = { marginBottom: 12 };
          const uls: React.CSSProperties = { margin: "0 0 12px", paddingLeft: 20 };
          const lis: React.CSSProperties = { marginBottom: 6 };
          const muted: React.CSSProperties = { marginBottom: 12, color: "var(--text-muted)", fontSize: 13 };
          const SECTIONS: { key: string; label: string; content: React.ReactNode }[] = [
            { key: "overview", label: "Overview", content: (
              <>
                <p style={ps}>Customer Finder helps you build a list of potential B2B customers for Lysoveta. It searches trade media, industry sites and other sources for supplement companies, researches each one, scores it against Lysoveta&apos;s Ideal Customer Profile (ICP), and lets you review and save the best matches.</p>
                <p style={ps}>There are four tabs:</p>
                <ul style={uls}>
                  <li style={lis}><strong>Company Database</strong> — the companies you&apos;ve saved.</li>
                  <li style={lis}><strong>Find New Companies</strong> — run a search for new prospects.</li>
                  <li style={lis}><strong>Lysoveta ICP Criteria</strong> — the profile companies are scored against.</li>
                  <li style={lis}><strong>How It Works</strong> — this guide.</li>
                </ul>
              </>
            ) },
            { key: "database", label: "Company Database", content: (
              <>
                <p style={ps}>Your saved companies live here. Use the filters at the top (geography, category, price range, ICP fit, priority tier), then <strong>Find Companies</strong> to apply them — or <strong>Show All Companies</strong>. Click a row to expand its description. Each row shows the <strong>date added</strong> and an editable <strong>Status</strong> (Not contacted / Contacted / In dialogue / Not relevant) for tracking outreach — it saves the moment you change it.</p>
                <ul style={uls}>
                  <li style={lis}><strong>+ Add Company</strong> — manually add a company (name required, plus website, geography, category, price, tier, ICP fit, and notes) without running a search. Saved straight to the database.</li>
                  <li style={lis}><strong>Select rows</strong> — tick companies (or the header box for all shown), then <strong>View only selected</strong> to show just those (<strong>Show all</strong> brings the rest back; ticks stay). Since the export takes what&apos;s shown, this is how to export just your picks. <strong>Clear selection</strong> unticks everything.</li>
                  <li style={lis}><strong>Export as Excel</strong> — downloads the companies currently shown (respects your filters, hidden rows, and any &quot;view only selected&quot;).</li>
                  <li style={lis}><strong>Clear Results</strong> — empties the shown table; doesn&apos;t delete anything.</li>
                  <li style={lis}><strong>Edit list</strong> — turns on edit mode. Each row gets a pencil (edit its fields) and an ✕ (choose <em>Remove from this view only</em> — hidden and restorable — or <em>Delete from the company database</em>).</li>
                  <li style={lis}><strong>Restore hidden</strong> — brings back rows you hid.</li>
                </ul>
              </>
            ) },
            { key: "finding", label: "Finding new companies", content: (
              <>
                <p style={ps}>On <strong>Find New Companies</strong>, pick up to 3 search terms and up to 4 sources (or leave them unticked to use the defaults), then click <strong>Search for New Companies</strong>. A search takes about <strong>15 minutes</strong> and stops automatically after 30. While it runs you&apos;ll see “Step X of 3”, a timer, and an expandable <strong>Search Log</strong> that mirrors exactly what the app is doing.</p>
                <p style={{ fontWeight: 700, color: "var(--navy)", margin: "16px 0 6px" }}>What happens behind the scenes — three steps</p>
                <ul style={uls}>
                  <li style={lis}><strong>1. Discovery</strong> — the AI runs web searches (and reads any single-page or YouTube sources you picked) using your terms, and extracts supplement company/brand names it hasn&apos;t seen before. Anything already in your database, rejected, or already waiting is filtered out. New names go into the waiting list.</li>
                  <li style={lis}><strong>2. Research</strong> — for the next few waiting companies (5 at a time), the AI does its own web searches to gather details: their website, what they sell, whether they do omega-3/krill, how they describe themselves, price level, which European markets, and sales channels. Each company is saved the moment its research finishes, so nothing is lost partway.</li>
                  <li style={lis}><strong>3. Scoring (ICP)</strong> — the AI reads everything gathered for the batch and scores each company against the Lysoveta ICP, giving a fit score, a priority tier (Early Mover / Follower / Enabler), and a short reason. Only companies that pass are shown for you to review and save.</li>
                </ul>
                <p style={ps}>Discovery only runs when the waiting list is below 5 — otherwise a run just researches what&apos;s already waiting (see <em>The waiting list</em>).</p>
                <p style={muted}>The first search after a quiet period can take ~30 seconds to start (the server “wakes up” after being idle). That&apos;s normal.</p>
              </>
            ) },
            { key: "config", label: "Search terms & sources", content: (
              <>
                <p style={ps}>Click <strong>Edit</strong> in the Search Configuration panel to add, change, or remove search terms and sources. Nothing is saved until you press <strong>Save changes</strong> (Cancel discards the draft).</p>
                <p style={ps}>There are three source types:</p>
                <ul style={uls}>
                  <li style={lis}><strong>Website</strong> — a whole site, searched repeatedly (e.g. a trade-news site).</li>
                  <li style={lis}><strong>Single page</strong> — one specific URL, read once (e.g. a “best supplements” list).</li>
                  <li style={lis}><strong>YouTube</strong> — searches YouTube for your terms and pulls brand names from the videos.</li>
                </ul>
                <p style={ps}>You can pick up to 3 terms and 4 sources per search. The limit isn&apos;t arbitrary: a search runs <em>terms × sources</em> web searches with a budget of 12, and 3 × 4 = 12 fills it exactly — picking more can&apos;t all run.</p>
                <p style={{ fontWeight: 700, color: "var(--navy)", margin: "16px 0 6px" }}>How well is each source doing?</p>
                <p style={ps}>Under every source you&apos;ll see a small line — for example <strong>“used 5 · queued 12 · saved 2”</strong> — so you can tell which sources actually pull their weight:</p>
                <ul style={uls}>
                  <li style={lis}><strong>used</strong> — how many searches this source has taken part in.</li>
                  <li style={lis}><strong>queued</strong> — how many new companies it has added to the waiting list over time.</li>
                  <li style={lis}><strong>saved</strong> — how many of its companies ended up approved in your database.</li>
                </ul>
                <p style={muted}>These numbers start from zero and build up as you search — a brand-new source shows “Not used yet”. Companies saved before this feature existed don&apos;t count toward <em>saved</em>.</p>
                <p style={{ fontWeight: 700, color: "var(--navy)", margin: "16px 0 6px" }}>Low-performing sources get a warning</p>
                <p style={ps}>Click <strong>Source performance</strong> (top of the Search Configuration panel) to open a table of every source with its <strong>hit rate</strong> — how many companies it finds per search (companies found ÷ times used). A source whose hit rate drops below a threshold (default <strong>1%</strong>), once it&apos;s been used a few times, is flagged with a <strong style={{ color: "var(--danger-text)" }}>⚠ Low hit rate</strong> warning — both in that table and under the source in the main list — suggesting you edit or remove it.</p>
                <p style={muted}>You can change the threshold (and how many uses a source needs before it can be flagged) right in that window — it&apos;s a shared setting, so it affects the warnings everyone sees.</p>
              </>
            ) },
            { key: "queue", label: "The waiting list", content: (
              <>
                <p style={ps}>Companies are researched in small batches — <strong>5 at a time</strong> — because researching each one is the slow, costly step. Newly found companies wait in a list until they&apos;re researched.</p>
                <p style={ps}>A search first works through this waiting list. It only looks for <em>new</em> companies (using your selected sources and terms) once the list drops <strong>below 5</strong>. If you click Search while the list is longer, a pop-up lets you either research the waiting list, or <strong>clear it and search your selections</strong> right away.</p>
              </>
            ) },
            { key: "scoring", label: "How scoring works (ICP)", content: (
              <>
                <p style={ps}>After a company is researched, the AI scores it against the <strong>Lysoveta ICP Criteria</strong> (see that tab). It assigns an ICP fit score and a priority tier (Early Mover, Follower, or Enabler).</p>
                {US_MARKET_ENABLED && <p style={ps}>There are separate profiles for <strong>Europe</strong> and the <strong>US</strong> (both on the ICP Criteria tab). Each company is scored against the profile that matches its primary market.</p>}
                <p style={ps}>Only companies that <strong>pass</strong> the ICP are shown for you to save. The rest are set aside — kept internally so they aren&apos;t re-discovered in future searches.</p>
                <p style={ps}>The ICP itself is <strong>editable</strong> — on the <strong>Lysoveta ICP Criteria</strong> tab, click <strong>✎ Edit Criteria</strong> to adjust the text for either market. Nothing saves automatically: you press <strong>Review changes with AI</strong>, which checks your text reads as clear scoring instructions and flags any gaps (advice only), then you press <strong>Save changes</strong> to make it live. Changes are shared, take effect on the next search, and every save is kept in <strong>Version history</strong> so you can roll back.</p>
              </>
            ) },
            { key: "exceptions", label: "When something goes wrong", content: (
              <>
                <p style={ps}>The app is built to fail safely. Here&apos;s what the different situations and messages mean:</p>
                <ul style={uls}>
                  <li style={lis}><strong>“No new companies found”</strong> — everything found was already in your database, rejected, or waiting. The sources may not have published anything new, or the terms keep hitting the same companies. Try again later, or adjust/add sources and terms.</li>
                  <li style={lis}><strong>“A previous search didn&apos;t finish”</strong> — if a company got stuck while being researched, the app stops the run and puts those companies back in the waiting list so nothing is lost. You can remove one that keeps hanging, or just search again to retry them.</li>
                  <li style={lis}><strong>A source can&apos;t be read</strong> — some pages block automated reading (paywalls, robots rules) or are JavaScript-only (e.g. many trade-show exhibitor lists). Those are simply skipped, and the run continues with the others.</li>
                  <li style={lis}><strong>A fixed list adds nothing new</strong> — single-page and “best of” sources give the same names each time, so after the first harvest they stop producing new companies. That&apos;s expected — deactivate or remove them once mined.</li>
                  <li style={lis}><strong>The 30-minute limit</strong> — if a run ever stalls, it&apos;s stopped automatically after 30 minutes so it can never hang forever. Anything already researched and saved is kept.</li>
                  <li style={lis}><strong>You closed or reloaded the page</strong> — research is saved company-by-company as it completes, so finished work is never lost; those companies are reused (for free) on the next search.</li>
                  <li style={lis}><strong>An error screen</strong> — if something fails (e.g. a service or configuration problem), you get a message explaining what you can do, usually with a <em>Try again</em> button.</li>
                </ul>
              </>
            ) },
            { key: "login", label: "Signing in", content: (
              <>
                <p style={ps}>The first time you open the app you&apos;ll be asked to <strong>log in</strong> or <strong>create an account</strong> with an email and a password you choose. After that you stay signed in on that device for about <strong>two weeks</strong>, then you&apos;ll be asked to log in again. There&apos;s a <strong>Log out</strong> button at the top-right.</p>
                <p style={{ ...ps, padding: "10px 14px", background: "var(--warn-bg, #fff8e6)", borderRadius: 4, border: "1px solid var(--border-card)" }}>
                  <strong>This is a simple pilot log-in, not real security.</strong> Please <strong>don&apos;t reuse a password</strong> you use elsewhere — pick something throwaway like <em>Lysoveta123</em>. Proper security is handled by IT after handover.
                </p>
              </>
            ) },
            { key: "tips", label: "Tips & good to know", content: (
              <>
                <ul style={uls}>
                  <li style={lis}>Best viewed on a <strong>laptop or desktop</strong> — the layout isn&apos;t designed for mobile.</li>
                  <li style={lis}>The log-in is a <strong>simple pilot gate</strong>, not real security (see <em>Signing in</em>) — please don&apos;t share the link more widely than intended.</li>
                  <li style={lis}>Your actions are <strong>live</strong>: saving or removing companies changes the real database.</li>
                </ul>
              </>
            ) },
          ];
          const active = SECTIONS.find(s => s.key === aboutSection) ?? SECTIONS[0];
          return (
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", maxWidth: 1000, width: "100%", margin: "0 auto" }}>
              <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {SECTIONS.map(s => (
                  <button key={s.key} type="button" onClick={() => setAboutSection(s.key)}
                    style={{ textAlign: "left", padding: "10px 14px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                      background: active.key === s.key ? "var(--accent)" : "transparent",
                      color: active.key === s.key ? "var(--white)" : "var(--text-slate)" }}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ background: "var(--header)", padding: "12px 20px" }}>
                  <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>{active.label}</p>
                </div>
                <div style={{ padding: "24px 28px", fontSize: 14, color: "var(--text)", lineHeight: 1.7 }}>
                  {active.content}
                </div>
              </div>
            </div>
          );
        })()}

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

      {/* Source-performance modal — opened by "Source performance" in the Search Configuration panel */}
      {perfModalOpen && (
        <div onClick={() => { if (!perfSaving) setPerfModalOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 960, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            <div style={{ background: "var(--header)", padding: "16px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--white)", fontSize: 19, fontWeight: 700 }}>Source performance</p>
              <button type="button" onClick={() => { if (!perfSaving) setPerfModalOpen(false); }}
                style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "26px 30px", overflowY: "auto" }}>
              {/* Threshold — read-only by default; editing revealed inline (no nested pop-up).
                  Left accent stripe + navy bold text so the active rule stands out from the grey notes. */}
              <div style={{ marginBottom: 18, borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
                {!perfEditThreshold ? (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
                    <span style={{ fontSize: 16.5, fontWeight: 600, color: "var(--navy)", lineHeight: 1.5 }}>Flag a source when its hit rate is below <strong>{warnThresholdPct}%</strong>, once it has been used at least <strong>{warnMinUses}</strong> times.</span>
                    <button type="button" onClick={() => { setPerfDraftPct(String(warnThresholdPct)); setPerfDraftMin(String(warnMinUses)); setPerfEditThreshold(true); }}
                      style={{ ...btnSecondary, padding: "5px 12px", fontSize: 12, marginLeft: "auto" }}>Edit threshold</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, color: "var(--navy)" }}>
                      <span>Warn when hit rate is below</span>
                      <input type="number" min={0} step={0.5} value={perfDraftPct} onChange={e => setPerfDraftPct(e.target.value)}
                        style={{ width: 76, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 15 }} />
                      <span>%, once the source has been used at least</span>
                      <input type="number" min={0} step={1} value={perfDraftMin} onChange={e => setPerfDraftMin(e.target.value)}
                        style={{ width: 66, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 15 }} />
                      <span>times.</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <button type="button" onClick={async () => { await saveSettings(); setPerfEditThreshold(false); }} disabled={perfSaving}
                        style={{ ...btnPrimary, padding: "8px 20px", opacity: perfSaving ? 0.6 : 1 }}>{perfSaving ? "Saving…" : "Save"}</button>
                      <button type="button" onClick={() => { setPerfDraftPct(String(warnThresholdPct)); setPerfDraftMin(String(warnMinUses)); setPerfEditThreshold(false); }} disabled={perfSaving}
                        style={{ ...btnSecondary, padding: "8px 20px" }}>Cancel</button>
                    </div>
                  </>
                )}
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>Shared setting — affects the warnings everyone sees. The minimum-uses guard stops brand-new sources from being flagged before they&apos;ve had a fair chance.</p>
              </div>

              <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 8 }}>
                <strong>Hit rate</strong> = companies found ÷ times used — how many new companies a source turns up per search (a source that never finds anything trends toward 0%). This is what the warning is based on.
              </p>
              <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 22 }}>
                <strong>Saved rate</strong> = approved companies ÷ times used — a quality signal shown for reference only, not used for the warning.
              </p>

              {/* Per-source table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-muted)", borderBottom: "1px solid var(--border-card)" }}>
                      <th style={{ padding: "9px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Source</th>
                      <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Used</th>
                      <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Queued</th>
                      <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Saved</th>
                      <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Hit rate</th>
                      <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Saved rate</th>
                      <th style={{ padding: "9px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const hrVal = (s: { times_used: number; companies_found: number }) => {
                        const hr = sourceHitRate(s.times_used, s.companies_found);
                        return hr === null ? Infinity : hr;
                      };
                      return [...sourceOptions].sort((a, b) => {
                        const la = sourceIsLow(a.times_used, a.companies_found) ? 0 : 1;
                        const lb = sourceIsLow(b.times_used, b.companies_found) ? 0 : 1;
                        if (la !== lb) return la - lb;
                        return hrVal(a) - hrVal(b);
                      }).map(s => {
                        const low = sourceIsLow(s.times_used, s.companies_found);
                        const unused = s.times_used === 0;
                        return (
                          <tr key={s.name} style={{ borderBottom: "1px solid var(--border-card)", background: low ? "var(--banner-warn-bg)" : "transparent" }}>
                            <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>{s.name}<MarketBadge market={s.market} /></td>
                            <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{s.times_used}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{s.companies_found}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{savedBySource.get(s.name) ?? 0}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtHitRate(s.times_used, s.companies_found)}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtSavedRate(s.times_used, savedBySource.get(s.name) ?? 0)}</td>
                            <td style={{ padding: "9px 12px", color: low ? "var(--danger-text)" : "var(--text-muted)", fontWeight: low ? 700 : 400, whiteSpace: "nowrap" }}>
                              {unused ? "Not used yet" : low ? "⚠ Low" : "OK"}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* "What does the AI review check?" — shows/edits the review instructions (the editable rubric). */}
      {reviewInfoOpen && (
        <div onClick={() => { if (!reviewSaving) setReviewInfoOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 720, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            <div style={{ background: "var(--header)", padding: "16px 26px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <p style={{ color: "var(--white)", fontSize: 17, fontWeight: 700 }}>What the AI review checks</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {!reviewEditing && (
                  <button type="button" onClick={editReviewInstructions}
                    style={{ background: "var(--accent)", border: "none", color: "var(--white)", padding: "5px 14px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>✎ Edit</button>
                )}
                <button type="button" onClick={() => { if (!reviewSaving) setReviewInfoOpen(false); }}
                  style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
            </div>
            <div style={{ padding: "20px 26px", overflowY: "auto" }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
                These are the exact instructions given to the AI when it reviews an ICP edit (before you save). Editing them changes what the review looks for — the surrounding structure (how your ICP text is fed in and how the result is returned) is fixed in code and can’t be broken here. Applies to both markets.
              </p>
              {!reviewEditing ? (
                <div style={{ border: "1px solid var(--border-card)", borderRadius: 4, background: "var(--surface)", padding: "14px 16px", whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.6, color: "var(--text)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>
                  {reviewInstructions}
                </div>
              ) : (
                <>
                  <textarea value={reviewDraft} onChange={e => setReviewDraft(e.target.value)} spellCheck={false}
                    style={{ width: "100%", minHeight: 300, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: 1.6, color: "var(--text)", resize: "vertical" }} />
                  {reviewInfoError && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 8 }}>{reviewInfoError}</p>}
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>Shared setting — changes what every ICP review checks for. Saved to the database and used by the next review.</p>
                  <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
                    <button type="button" onClick={saveReviewInstructions} disabled={reviewSaving}
                      style={{ ...btnPrimary, padding: "9px 22px", opacity: reviewSaving ? 0.6 : 1 }}>{reviewSaving ? "Saving…" : "Save"}</button>
                    <button type="button" onClick={() => { setReviewEditing(false); setReviewInfoError(""); }} disabled={reviewSaving}
                      style={{ ...btnSecondary, padding: "9px 20px" }}>Cancel</button>
                    <button type="button" onClick={() => setReviewDraft(DEFAULT_ICP_REVIEW_INSTRUCTIONS)} disabled={reviewSaving}
                      style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>Reset to default</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual "Add company" form — lets users enter a company they came across themselves. */}
      {addOpen && (
        <div onClick={() => { if (!addSaving) setAddOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 640, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            <div style={{ background: "var(--header)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--white)", fontSize: 17, fontWeight: 700 }}>Add company</p>
              <button type="button" onClick={() => { if (!addSaving) setAddOpen(false); }}
                style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", overflowY: "auto" }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
                Enter a company you came across and it&apos;ll be saved straight to the database. Only the name is required. Set the ICP fit yourself for now (an AI-suggested score may come later).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Company name <span style={{ color: "var(--danger-text)" }}>*</span></label>
                  <input type="text" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} style={inputStyle} placeholder="e.g. Doppelherz" />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Website</label>
                  <input type="text" value={addForm.website_url} onChange={e => setAddForm({ ...addForm, website_url: e.target.value })} style={inputStyle} placeholder="https://…" />
                </div>
                <div>
                  <label style={labelStyle}>Geography</label>
                  <select value={addForm.geography} onChange={e => setAddForm({ ...addForm, geography: e.target.value })} style={inputStyle}>
                    {GEO_OPTIONS.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Product category</label>
                  <select value={addForm.product_category} onChange={e => setAddForm({ ...addForm, product_category: e.target.value })} style={inputStyle}>
                    {CAT_OPTIONS.map(cat => <option key={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Max price</label>
                  <input type="number" value={addForm.max_price} onChange={e => setAddForm({ ...addForm, max_price: e.target.value })} style={inputStyle} placeholder="—" />
                </div>
                <div>
                  <label style={labelStyle}>Currency</label>
                  <select value={addForm.price_currency} onChange={e => setAddForm({ ...addForm, price_currency: e.target.value })} style={inputStyle}>
                    <option value="">—</option>
                    {["EUR", "GBP", "USD", "NOK", "SEK", "DKK", "CHF"].map(cur => <option key={cur}>{cur}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Priority tier</label>
                  <select value={addForm.priority_tier} onChange={e => setAddForm({ ...addForm, priority_tier: e.target.value })} style={inputStyle}>
                    <option value="">—</option>
                    <option value="early_mover">Early Mover</option>
                    <option value="follower">Follower</option>
                    <option value="enabler">Enabler</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>ICP fit</label>
                  <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} type="button" onClick={() => setAddForm({ ...addForm, icp_fit: star })}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, lineHeight: 1, padding: "0 2px", color: star <= addForm.icp_fit ? "var(--accent)" : "var(--border-grey)" }}>★</button>
                    ))}
                  </div>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Source <span style={{ color: "var(--text-faint)" }}>(optional)</span></label>
                  <input type="text" value={addForm.source_name} onChange={e => setAddForm({ ...addForm, source_name: e.target.value })} style={inputStyle} placeholder="Manually added" />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Description / notes</label>
                  <textarea value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} rows={3}
                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} placeholder="Why it's relevant, what they sell, etc." />
                </div>
              </div>
              {addFormError && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 12 }}>{addFormError}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button type="button" onClick={submitAddCompany} disabled={addSaving}
                  style={{ ...btnPrimary, padding: "10px 24px", opacity: addSaving ? 0.6 : 1 }}>{addSaving ? "Saving…" : "Add to database"}</button>
                <button type="button" onClick={() => setAddOpen(false)} disabled={addSaving}
                  style={{ ...btnSecondary, padding: "10px 22px" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage test example companies — the fixed, user-editable set used by "Test on example companies". */}
      {manageOpen && (
        <div onClick={() => { if (!manageSaving) setManageOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 640, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            <div style={{ background: "var(--header)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--white)", fontSize: 17, fontWeight: 700 }}>Test example companies</p>
              <button type="button" onClick={() => { if (!manageSaving) setManageOpen(false); }}
                style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", overflowY: "auto" }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 14 }}>
                These companies are scored against your ICP draft when you click <strong>Test on example companies</strong>. Set what you <strong>expect</strong> each to be, and the test flags any that the ICP scores differently. Pick a spread — a couple of clear early movers, a follower, an enabler, and a couple that should be rejected.
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                <button type="button" onClick={suggestStarterSet} style={{ ...btnSecondary, padding: "7px 16px", fontSize: 12.5 }}>Suggest a starter set</button>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Fills in 2 early movers · 1 follower · 1 enabler · 2 rejected from your database.</span>
              </div>

              {manageDraft.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)", padding: "10px 0" }}>No examples yet — use “Suggest a starter set”, or add companies below.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {manageDraft.map((e) => (
                    <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1, fontSize: 13, color: "var(--navy)", fontWeight: 600 }}>{e.name}</span>
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>expect:</span>
                      <select value={e.expected} onChange={(ev) => setExampleExpected(e.name, ev.target.value as ExpectedCategory)}
                        style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 12.5 }}>
                        {EXPECTED_LABELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                      <button type="button" title="Remove" onClick={() => removeExample(e.name)}
                        style={{ background: "transparent", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: 15, fontWeight: 700, lineHeight: 1, padding: "2px 6px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 11.5, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Add a company (from your database)</label>
                <select value="" onChange={(ev) => { addExample(ev.target.value); ev.target.value = ""; }} style={{ ...inputStyle }}>
                  <option value="">Select a company to add…</option>
                  {manageOptions.filter(o => !manageDraft.some(d => d.name === o.name)).map(o => (
                    <option key={o.name} value={o.name}>{o.name}{o.rejected ? " (rejected)" : o.priority_tier ? ` (${o.priority_tier.replace(/_/g, " ")})` : ""}</option>
                  ))}
                </select>
                <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>Only companies that have been researched (have enriched data) can be used as examples.</p>
              </div>

              {manageError && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 8 }}>{manageError}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="button" onClick={saveExamples} disabled={manageSaving}
                  style={{ ...btnPrimary, padding: "9px 22px", opacity: manageSaving ? 0.6 : 1 }}>{manageSaving ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setManageOpen(false)} disabled={manageSaving}
                  style={{ ...btnSecondary, padding: "9px 20px" }}>Cancel</button>
              </div>
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
              <div>
                <label style={labelStyle}>Market <span style={optStyle}>optional</span></label>
                <select value={newSource.market} onChange={e => setNewSource({ ...newSource, market: e.target.value })} style={inputStyle}>
                  <option value="">Unspecified</option>
                  <option value="EU">EU</option>
                  <option value="US">US</option>
                  <option value="Global">Global</option>
                </select>
                <p style={hintStyle}>Which market this source leans toward — shown as a tag in the list.</p>
              </div>
              {newSource.type === "web site" ? (
                <>
                  <div>
                    <label style={labelStyle}>Search prefix <span style={reqStyle}>*</span></label>
                    <input type="text" value={newSource.search_prefix} onChange={e => setNewSource({ ...newSource, search_prefix: e.target.value })}
                      placeholder="e.g. nutraingredients.com Europe" style={inputStyle} />
                    <p style={hintStyle}>A fixed text added in front of <em>every</em> search term to aim the search at this specific source. Unlike the search terms (which change from search to search), this stays the same each time the source is used — the query becomes <em>“&lt;prefix&gt; &lt;term&gt;”</em>. Usually the site&apos;s domain, optionally with a region, e.g. <em>nutraingredients.com Europe</em>.</p>
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
                  placeholder={'e.g. This site defaults to its US edition — always keep "Europe" in the query so results aren\'t US-only.'}
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
