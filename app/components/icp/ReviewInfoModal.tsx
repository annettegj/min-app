import { btnPrimary, btnSecondary } from "@/lib/styles";
import { DEFAULT_ICP_REVIEW_INSTRUCTIONS } from "@/lib/icpReview";

// "What does the AI review check?" — shows/edits the review instructions (the editable rubric).
export function ReviewInfoModal({ editing, instructions, draft, error, saving, setDraft, onEdit, onSave, onCancelEdit, onClose }: {
  editing: boolean;
  instructions: string;
  draft: string;
  error: string;
  saving: boolean;
  setDraft: (v: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onClose: () => void;
}) {
  return (
    <div onClick={() => { if (!saving) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 720, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
        <div style={{ background: "var(--header)", padding: "16px 26px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ color: "var(--white)", fontSize: 17, fontWeight: 700 }}>What the AI review checks</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!editing && (
              <button type="button" onClick={onEdit}
                style={{ background: "var(--accent)", border: "none", color: "var(--white)", padding: "5px 14px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>✎ Edit</button>
            )}
            <button type="button" onClick={() => { if (!saving) onClose(); }}
              style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ padding: "20px 26px", overflowY: "auto" }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
            These are the exact instructions given to the AI when it reviews an ICP edit (before you save). Editing them changes what the review looks for — the surrounding structure (how your ICP text is fed in and how the result is returned) is fixed in code and can’t be broken here. Applies to both markets.
          </p>
          {!editing ? (
            <div style={{ border: "1px solid var(--border-card)", borderRadius: 4, background: "var(--surface)", padding: "14px 16px", whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.6, color: "var(--text)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>
              {instructions}
            </div>
          ) : (
            <>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} spellCheck={false}
                style={{ width: "100%", minHeight: 300, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: 1.6, color: "var(--text)", resize: "vertical" }} />
              {error && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 8 }}>{error}</p>}
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>Shared setting — changes what every ICP review checks for. Saved to the database and used by the next review.</p>
              <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
                <button type="button" onClick={onSave} disabled={saving}
                  style={{ ...btnPrimary, padding: "9px 22px", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
                <button type="button" onClick={onCancelEdit} disabled={saving}
                  style={{ ...btnSecondary, padding: "9px 20px" }}>Cancel</button>
                <button type="button" onClick={() => setDraft(DEFAULT_ICP_REVIEW_INSTRUCTIONS)} disabled={saving}
                  style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>Reset to default</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
