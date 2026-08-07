"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { CAT_OPTIONS } from "@/lib/uiConstants";

type CategoryRecord = { id: number; name: string };
type DraftCategory = { key: string; id: number | null; name: string };

// Owns the editable product-category vocabulary (DB table `product_categories`).
// `categories` (active names) is read by the dropdowns across the app (filter, add, edit,
// post-search adjust); the draft-edit + saveCategories flow (edited in the ICP tab) mirrors the
// sources/search-terms config editor. Called ONCE in page.tsx and passed down.
// Falls back to the built-in CAT_OPTIONS if the table read fails or is empty (e.g. before
// migration 017 is applied), the app still works, just without in-app editing.
export function useCategories() {
  const [categories, setCategories] = useState<string[]>(CAT_OPTIONS);
  const [categoryRecords, setCategoryRecords] = useState<CategoryRecord[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [draftCats, setDraftCats] = useState<DraftCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(0);
  const nextKey = () => `k${keyRef.current++}`;

  // Load the active category names + full records. On any read error (incl. table not yet created)
  // keep the fallback defaults so the dropdowns still work.
  async function loadCategories() {
    const { data, error } = await supabase.from("product_categories").select("id, name").eq("active", true).order("sort_order").order("id");
    if (error || !data || data.length === 0) return; // keep CAT_OPTIONS fallback
    const recs = data.map((r: { id: number; name: string }) => ({ id: r.id, name: r.name }));
    setCategoryRecords(recs);
    setCategories(recs.map((r) => r.name));
  }

  useEffect(() => { loadCategories(); }, []);

  function openManage() {
    setDraftCats(categoryRecords.map((c) => ({ key: nextKey(), id: c.id, name: c.name })));
    setError("");
    setManageOpen(true);
  }
  function closeManage() { setManageOpen(false); setError(""); }
  const updateDraft = (key: string, name: string) => setDraftCats((prev) => prev.map((c) => c.key === key ? { ...c, name } : c));
  const addDraft = () => setDraftCats((prev) => [...prev, { key: nextKey(), id: null, name: "" }]);
  const removeDraft = (key: string) => setDraftCats((prev) => prev.filter((c) => c.key !== key));

  // Diff the draft against the loaded records and apply inserts / renames / deletes in one go.
  // Deletes first, so a rename that reuses a freed unique name can't collide.
  async function saveCategories() {
    if (busy) return;
    const cats = draftCats.map((c) => ({ ...c, name: c.name.trim() }));
    if (cats.some((c) => !c.name)) { setError("Category names can't be empty, remove the blank one or fill it in."); return; }
    if (new Set(cats.map((c) => c.name.toLowerCase())).size !== cats.length) { setError("Two categories have the same name."); return; }

    setBusy(true); setError("");
    try {
      const draftIds = new Set(cats.filter((c) => c.id != null).map((c) => c.id));
      const deletes = categoryRecords.filter((r) => !draftIds.has(r.id)).map((r) => r.id);
      const inserts = cats.filter((c) => c.id == null).map((c, i) => ({ name: c.name, sort_order: categoryRecords.length + i + 1 }));
      const updates = cats.filter((c) => c.id != null).filter((c) => { const o = categoryRecords.find((r) => r.id === c.id); return o && o.name !== c.name; });

      if (deletes.length) { const { error } = await supabase.from("product_categories").delete().in("id", deletes); if (error) throw error; }
      if (inserts.length) { const { error } = await supabase.from("product_categories").insert(inserts); if (error) throw error; }
      for (const c of updates) { const { error } = await supabase.from("product_categories").update({ name: c.name }).eq("id", c.id!); if (error) throw error; }

      await loadCategories();
      setManageOpen(false);
    } catch (e) {
      setError(`Could not save: ${(e as { message?: string })?.message ?? "unknown error"}`);
    }
    setBusy(false);
  }

  return {
    categories, categoryRecords,
    manageOpen, openManage, closeManage,
    draftCats, updateDraft, addDraft, removeDraft,
    busy, error, saveCategories,
  };
}

export type CategoriesApi = ReturnType<typeof useCategories>;
