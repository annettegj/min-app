import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { diffLines } from "@/lib/format";
import { DEFAULT_ICP_REVIEW_INSTRUCTIONS, ICP_REVIEW_INSTRUCTIONS_KEY } from "@/lib/icpReview";
import { ICP_TEST_COMPANIES_KEY, type IcpTestExample, type ExpectedCategory } from "@/lib/icpTest";
import type { DiffSeg, IcpTestRow } from "@/lib/uiTypes";

// Owns the entire ICP-editor domain: the editable ICP docs, the review/apply/diff/test flows, version
// history, the editable review rubric, and the example-companies set. Loads its own data on mount.
// `authEmail` is used to stamp who saved a version.
export function useIcpEditor(authEmail: string | null) {
  const [icpDocs, setIcpDocs] = useState<{ eu: string; us: string } | null>(null);
  const [icpRegion, setIcpRegion] = useState<"eu" | "us">("eu");
  const [icpEditMode, setIcpEditMode] = useState(false);
  const [icpDraft, setIcpDraft] = useState("");
  const [icpSaving, setIcpSaving] = useState(false);
  const [icpError, setIcpError] = useState("");
  const [icpHistoryOpen, setIcpHistoryOpen] = useState(false);
  const [icpVersions, setIcpVersions] = useState<{ id: number; content: string; saved_by: string | null; created_at: string }[]>([]);
  const [icpChecking, setIcpChecking] = useState(false);
  const [icpCheck, setIcpCheck] = useState<{ ok: boolean | null; summary: string; issues: { severity: string; text: string }[]; error?: string } | null>(null);
  const [icpApplying, setIcpApplying] = useState<number | null>(null);
  const [icpApplyNote, setIcpApplyNote] = useState("");
  const [icpApplyError, setIcpApplyError] = useState("");
  const [icpDiff, setIcpDiff] = useState<{ revised: string; segments: DiffSeg[]; issueIdx: number } | null>(null);
  const [icpTesting, setIcpTesting] = useState(false);
  const [icpTestResults, setIcpTestResults] = useState<IcpTestRow[] | null>(null);
  const [icpTestError, setIcpTestError] = useState("");
  const [icpTestEmpty, setIcpTestEmpty] = useState(false);
  const [icpTestSet, setIcpTestSet] = useState<IcpTestExample[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageDraft, setManageDraft] = useState<IcpTestExample[]>([]);
  const [manageOptions, setManageOptions] = useState<{ name: string; priority_tier: string | null; added: boolean; rejected: boolean }[]>([]);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState("");
  const [reviewInstructions, setReviewInstructions] = useState(DEFAULT_ICP_REVIEW_INSTRUCTIONS);
  const [reviewInfoOpen, setReviewInfoOpen] = useState(false);
  const [reviewEditing, setReviewEditing] = useState(false);
  const [reviewDraft, setReviewDraft] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewInfoError, setReviewInfoError] = useState("");

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

  // The editable review rubric + example set live in app_settings; load them once.
  async function loadIcpSettings() {
    const { data } = await supabase.from("app_settings").select("key, value").in("key", [ICP_REVIEW_INSTRUCTIONS_KEY, ICP_TEST_COMPANIES_KEY]);
    if (!data) return;
    const map = new Map(data.map((r: { key: string; value: string }) => [r.key, r.value]));
    const rev = map.get(ICP_REVIEW_INSTRUCTIONS_KEY) as string | undefined;
    if (rev && rev.trim()) setReviewInstructions(rev);
    const testSet = map.get(ICP_TEST_COMPANIES_KEY) as string | undefined;
    if (testSet) { try { const p = JSON.parse(testSet); if (Array.isArray(p)) setIcpTestSet(p.filter((e) => e && typeof e.name === "string")); } catch { /* ignore */ } }
  }

  useEffect(() => { loadIcp(); loadIcpSettings(); }, []);

  function enterIcpEdit() {
    setIcpDraft(icpDocs?.[icpRegion] ?? "");
    setIcpError(""); setIcpHistoryOpen(false); setIcpCheck(null); setIcpApplyNote(""); setIcpApplyError(""); setIcpDiff(null);
    setIcpTestResults(null); setIcpTestError(""); setIcpTestEmpty(false); setIcpEditMode(true);
  }
  function cancelIcpEdit() { setIcpEditMode(false); setIcpError(""); setIcpHistoryOpen(false); setIcpCheck(null); setIcpApplyNote(""); setIcpApplyError(""); setIcpDiff(null); setIcpTestResults(null); setIcpTestError(""); setIcpTestEmpty(false); }

  function icpNetworkMsg(err: unknown): string {
    const m = err instanceof Error ? err.message : String(err);
    if (/failed to fetch|networkerror|load failed|fetch failed/i.test(m)) {
      return "couldn’t reach the server, it may be waking up after being idle (this can take ~30 seconds). Wait a moment and try again.";
    }
    return m;
  }

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
    setIcpCheck(prev => {
      if (!prev) return prev;
      const remaining = prev.issues.filter((_, i) => i !== idx);
      return remaining.length ? { ...prev, issues: remaining } : null;
    });
    setIcpApplyNote("Applied, the change is now in the editor above. Review it (edit further if you like), then Save changes when you're ready.");
    setIcpDiff(null);
  }
  function discardIcpDiff() { setIcpDiff(null); }

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
      setIcpCheck({ ok: data.ok ?? null, summary: data.summary ?? "", issues, error: data.error });
    } catch (err) {
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

  async function openManageExamples() {
    setManageDraft(icpTestSet.map(e => ({ ...e })));
    setManageError(""); setManageOpen(true);
    const { data } = await supabase.from("companies").select("name, priority_tier, added, rejected").not("enriched_data", "is", null).order("enriched_at", { ascending: false });
    setManageOptions((data ?? []).map((r: { name: string; priority_tier: string | null; added: boolean; rejected: boolean }) => ({ name: r.name, priority_tier: r.priority_tier, added: r.added, rejected: r.rejected })));
  }
  function suggestStarterSet() {
    const pick = (n: number, fn: (o: typeof manageOptions[number]) => boolean, expected: ExpectedCategory) =>
      manageOptions.filter(fn).slice(0, n).map(o => ({ name: o.name, expected }));
    const draft: IcpTestExample[] = [
      ...pick(2, o => o.added && o.priority_tier === "early_mover", "early_mover"),
      ...pick(1, o => o.added && o.priority_tier === "follower", "follower"),
      ...pick(1, o => o.added && o.priority_tier === "enabler", "enabler"),
      ...pick(2, o => o.rejected, "reject"),
    ];
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

  return {
    icpDocs, icpRegion, setIcpRegion, icpEditMode, icpDraft, setIcpDraft, icpSaving, icpError,
    icpHistoryOpen, setIcpHistoryOpen, icpVersions, icpChecking, icpCheck, setIcpCheck, icpApplying, icpApplyNote, icpApplyError,
    icpDiff, icpTesting, icpTestResults, setIcpTestResults, icpTestError, icpTestEmpty, setIcpTestEmpty, icpTestSet,
    manageOpen, setManageOpen, manageDraft, manageOptions, manageSaving, manageError,
    reviewInstructions, reviewInfoOpen, setReviewInfoOpen, reviewEditing, setReviewEditing, reviewDraft, setReviewDraft, reviewSaving, reviewInfoError, setReviewInfoError,
    enterIcpEdit, cancelIcpEdit, applyIcpFix, acceptIcpDiff, discardIcpDiff, testIcp, reviewIcp, commitIcp, toggleIcpHistory,
    openManageExamples, suggestStarterSet, addExample, setExampleExpected, removeExample, saveExamples,
    openReviewInfo, editReviewInstructions, saveReviewInstructions,
  };
}
