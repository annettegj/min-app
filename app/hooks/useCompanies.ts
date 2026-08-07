import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { EMPTY_ADD_FORM, STATUS_OPTIONS } from "@/lib/uiConstants";
import { fmtAddedDate, parseMulti, joinMulti } from "@/lib/format";
import type { Company, EditDraft, AddCompanyForm } from "@/lib/uiTypes";

// geography + category are multi-value: empty list = no constraint (all); otherwise a company
// matches if ANY of its values overlaps ANY selected value. `source` filters on the single
// `source_name` per company (empty = all).
type SearchParams = null | { geography: string[]; category: string[]; source: string[]; priceMin: string; priceMax: string; icpMin: number; tier: string[] };

// Priority-tier filter labels → the stored priority_tier values.
const TIER_VALUE_BY_LABEL: Record<string, string> = { "Early Mover": "early_mover", "Follower": "follower", "Enabler": "enabler" };

// Owns the entire Company Database domain: the saved companies, the filter panel + results, inline
// edit / soft-delete, row selection + view-only, the manual "Add company" form, Excel export, and the
// unsaved-edit guard. Called ONCE in page.tsx (its `savedBySource` + `loadCompanies` are also used by
// the search flow / source-performance modal), and the result is passed to <CompanyDatabaseTab>.
export function useCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [geography, setGeography] = useState<string[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const [source, setSource] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [icpMin, setIcpMin] = useState(1);
  const [tier, setTier] = useState<string[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "done">("idle");
  const [searchParams, setSearchParams] = useState<SearchParams>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editOriginal, setEditOriginal] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [expandedCompanyId, setExpandedCompanyId] = useState<number | null>(null);
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [pendingExport, setPendingExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddCompanyForm>(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addFormError, setAddFormError] = useState("");

  const savedBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of companies) {
      if (!c.source_name) continue;
      m.set(c.source_name, (m.get(c.source_name) ?? 0) + 1);
    }
    return m;
  }, [companies]);

  // Distinct source names present in the loaded companies (for the Source filter dropdown).
  const sourceNames = useMemo(
    () => Array.from(new Set(companies.map(c => c.source_name).filter((n): n is string => !!n))).sort((a, b) => a.localeCompare(b)),
    [companies]
  );

  async function loadCompanies() {
    const { data } = await supabase.from("companies").select("*");
    if (data) setCompanies(data.filter((c: Company) => c.added && !c.rejected) as Company[]);
  }

  // Load the company database on mount (previously done in page.tsx's mount effect).
  useEffect(() => { loadCompanies(); }, []);

  function openAddCompany() { setAddForm(EMPTY_ADD_FORM); setAddFormError(""); setAddOpen(true); }
  async function submitAddCompany() {
    const name = addForm.name.trim();
    if (!name) { setAddFormError("Company name is required."); return; }
    setAddSaving(true); setAddFormError("");
    const { error } = await supabase.from("companies").upsert({
      name,
      website_url: addForm.website_url.trim() || null,
      geography: joinMulti(addForm.geography),
      product_category: joinMulti(addForm.product_category),
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
    setSearchParams({ geography: [], category: [], source: [], priceMin: "", priceMax: "", icpMin: 1, tier: [] });
    setSearchState("done");
  }

  async function updateCompanyStatus(id: number, status: string) {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    const { error } = await supabase.from("companies").update({ status }).eq("id", id);
    if (error) { console.error("[status] update failed:", error.message); loadCompanies(); }
  }

  const results = useMemo(() => {
    if (!searchParams) return [];
    return companies.filter((c) => {
      if (searchParams.geography.length && !parseMulti(c.geography).some((g) => searchParams.geography.includes(g))) return false;
      if (searchParams.category.length && !parseMulti(c.product_category).some((pc) => searchParams.category.includes(pc))) return false;
      if (searchParams.source.length && !searchParams.source.includes(c.source_name ?? "")) return false;
      if (searchParams.priceMin && (c.max_price ?? 0) < Number(searchParams.priceMin)) return false;
      if (searchParams.priceMax && (c.max_price ?? 0) > Number(searchParams.priceMax)) return false;
      if (c.icp_fit < searchParams.icpMin) return false;
      if (searchParams.tier.length && !searchParams.tier.map((l) => TIER_VALUE_BY_LABEL[l]).includes(c.priority_tier ?? "")) return false;
      return true;
    });
  }, [searchParams, companies]);

  // Sort the shown table (via the "Sort by" control). Default: newest-added first.
  const [sortKey, setSortKey] = useState<string>("added");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const sortVal = (c: Company, key: string): string | number => {
    switch (key) {
      case "name": return (c.name ?? "").toLowerCase();
      case "geography": return parseMulti(c.geography).join(", ").toLowerCase();
      case "product_category": return parseMulti(c.product_category).join(", ").toLowerCase();
      case "max_price": return c.max_price ?? -Infinity;
      case "priority_tier": return c.priority_tier ?? "";
      case "icp_fit": return c.icp_fit ?? 0;
      case "added": return new Date(c.added_at ?? c.enriched_at ?? 0).getTime();
      case "status": return c.status ?? "not_contacted";
      case "source_name": return (c.source_name ?? "").toLowerCase();
      default: return 0;
    }
  };

  const visibleResults = useMemo(() => {
    const filtered = results.filter((c) => !hiddenIds.has(c.id) && (!showOnlySelected || selectedIds.has(c.id)));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortVal(a, sortKey), bv = sortVal(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [results, hiddenIds, showOnlySelected, selectedIds, sortKey, sortDir]);

  function toggleSelected(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setShowOnlySelected(false);
      return next;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); setShowOnlySelected(false); }
  const removeTarget = confirmRemoveId != null ? companies.find((c) => c.id === confirmRemoveId) ?? null : null;

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
        { header: "Company category", key: "product_category", width: 26 },
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
          geography: parseMulti(c.geography).join("; "),
          product_category: parseMulti(c.product_category).join("; "),
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
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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

  function startEdit(c: Company) {
    setExpandedCompanyId(c.id);
    setEditingCompanyId(c.id);
    setConfirmRemoveId(null);
    setEditError("");
    const draft: EditDraft = {
      geography: parseMulti(c.geography),
      product_category: parseMulti(c.product_category),
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
        geography: joinMulti(editDraft.geography),
        product_category: joinMulti(editDraft.product_category),
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
      cancelEdit();
      setConfirmRemoveId(null);
    }
    setEditMode((v) => !v);
  }
  function hideFromView(id: number) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (expandedCompanyId === id) setExpandedCompanyId(null);
  }
  function restoreHidden() { setHiddenIds(new Set()); }
  function clearResults() {
    setSearchState("idle");
    setSearchParams(null);
    setExpandedCompanyId(null);
    setEditMode(false);
    cancelEdit();
    setConfirmRemoveId(null);
    setHiddenIds(new Set());
  }
  function hasUnsavedEdit() {
    return editingCompanyId != null && editDraft != null && editOriginal != null
      && JSON.stringify(editDraft) !== JSON.stringify(editOriginal);
  }
  function guardUnsavedEdit(proceed: () => void) {
    if (hasUnsavedEdit()) setPendingNav(() => proceed);
    else proceed();
  }
  function handleSearch() {
    setSearchState("loading");
    setSearchParams(null);
    setTimeout(() => {
      setSearchParams({ geography, category, source, priceMin, priceMax, icpMin, tier });
      setSearchState("done");
    }, 500);
  }

  return {
    companies, loadCompanies, savedBySource, sourceNames,
    geography, setGeography, category, setCategory, source, setSource, priceMin, setPriceMin, priceMax, setPriceMax, icpMin, setIcpMin, tier, setTier,
    searchState, setSearchState, searchParams, setSearchParams, results, visibleResults,
    sortKey, setSortKey, sortDir, setSortDir,
    editingCompanyId, editDraft, setEditDraft, savingEdit, editError, confirmRemoveId, setConfirmRemoveId, setEditError, removing, removeTarget,
    editMode, hiddenIds, selectedIds, setSelectedIds, showOnlySelected, setShowOnlySelected, expandedCompanyId, setExpandedCompanyId,
    pendingNav, setPendingNav, pendingExport, setPendingExport, exporting,
    addOpen, setAddOpen, addForm, setAddForm, addSaving, addFormError,
    openAddCompany, submitAddCompany, updateCompanyStatus, toggleSelected, clearSelection, handleExportExcel,
    startEdit, cancelEdit, saveEdit, removeCompany, toggleEditMode, hideFromView, restoreHidden, clearResults, hasUnsavedEdit, guardUnsavedEdit, handleSearch,
  };
}

export type CompaniesApi = ReturnType<typeof useCompanies>;
