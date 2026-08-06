import { inputStyle, btnPrimary, btnSecondary, addBtnStyle } from "@/lib/styles";
import type { CategoriesApi } from "@/app/hooks/useCategories";

// Manage the editable product-category vocabulary (add / rename / remove). Edits a local draft;
// nothing is written until Save, which diffs the draft against the DB and applies inserts/renames/
// deletes. Rendered from the ICP tab — the single place categories are edited app-wide.
export function ManageCategoriesModal({ api }: { api: CategoriesApi }) {
  const { draftCats, updateDraft, addDraft, removeDraft, busy, error, saveCategories, closeManage } = api;
  return (
    <div onClick={() => { if (!busy) closeManage(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 560, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
        <div style={{ background: "var(--header)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "var(--white)", fontSize: 17, fontWeight: 700 }}>Product categories</p>
          <button type="button" onClick={() => { if (!busy) closeManage(); }}
            style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto" }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 14 }}>
            These are the categories a company can be tagged with. They&apos;re used in the Company Database (filter, add, edit) and suggested by the AI after a search. Changes here apply everywhere and affect every future search. Renaming or removing a category does <strong>not</strong> change companies already tagged with the old value.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {draftCats.map((c) => (
              <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" title="Remove category" onClick={() => removeDraft(c.key)}
                  style={{ background: "transparent", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>✕</button>
                <input type="text" value={c.name} onChange={(e) => updateDraft(c.key, e.target.value)}
                  placeholder="Category name" style={{ ...inputStyle, flex: 1 }} />
              </div>
            ))}
            {draftCats.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>No categories yet — add one below.</p>}
          </div>

          <button type="button" onClick={addDraft} style={addBtnStyle}>+ Add new category</button>

          {error && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 12 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button type="button" onClick={saveCategories} disabled={busy}
              style={{ ...btnPrimary, padding: "9px 22px", opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save changes"}</button>
            <button type="button" onClick={closeManage} disabled={busy}
              style={{ ...btnSecondary, padding: "9px 20px" }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
