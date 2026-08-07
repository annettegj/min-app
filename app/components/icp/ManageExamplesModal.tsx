import { inputStyle, btnPrimary, btnSecondary } from "@/lib/styles";
import { EXPECTED_LABELS, type IcpTestExample, type ExpectedCategory } from "@/lib/icpTest";

// Manage the fixed, user-editable set of example companies used by "Test on example companies".
export function ManageExamplesModal({ draft, options, saving, error, onSuggest, onAdd, onSetExpected, onRemove, onSave, onClose }: {
  draft: IcpTestExample[];
  options: { name: string; priority_tier: string | null; added: boolean; rejected: boolean }[];
  saving: boolean;
  error: string;
  onSuggest: () => void;
  onAdd: (name: string) => void;
  onSetExpected: (name: string, expected: ExpectedCategory) => void;
  onRemove: (name: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div onClick={() => { if (!saving) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 640, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
        <div style={{ background: "var(--header)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "var(--white)", fontSize: 17, fontWeight: 700 }}>Test example companies</p>
          <button type="button" onClick={() => { if (!saving) onClose(); }}
            style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto" }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 14 }}>
            These companies are scored against your ICP draft when you click <strong>Test on example companies</strong>. Set what you <strong>expect</strong> each to be, and the test flags any that the ICP scores differently. Pick a spread, a couple of clear early movers, a follower, an enabler, and a couple that should be rejected.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <button type="button" onClick={onSuggest} style={{ ...btnSecondary, padding: "7px 16px", fontSize: 12.5 }}>Suggest a starter set</button>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Fills in 2 early movers · 1 follower · 1 enabler · 2 rejected from your database.</span>
          </div>

          {draft.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", padding: "10px 0" }}>No examples yet, use “Suggest a starter set”, or add companies below.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {draft.map((e) => (
                <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--navy)", fontWeight: 600 }}>{e.name}</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>expect:</span>
                  <select value={e.expected} onChange={(ev) => onSetExpected(e.name, ev.target.value as ExpectedCategory)}
                    style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 12.5 }}>
                    {EXPECTED_LABELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                  <button type="button" title="Remove" onClick={() => onRemove(e.name)}
                    style={{ background: "transparent", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: 15, fontWeight: 700, lineHeight: 1, padding: "2px 6px" }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 11.5, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Add a company (from your database)</label>
            <select value="" onChange={(ev) => { onAdd(ev.target.value); ev.target.value = ""; }} style={{ ...inputStyle }}>
              <option value="">Select a company to add…</option>
              {options.filter(o => !draft.some(d => d.name === o.name)).map(o => (
                <option key={o.name} value={o.name}>{o.name}{o.rejected ? " (rejected)" : o.priority_tier ? ` (${o.priority_tier.replace(/_/g, " ")})` : ""}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>Only companies that have been researched (have enriched data) can be used as examples.</p>
          </div>

          {error && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 8 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button type="button" onClick={onSave} disabled={saving}
              style={{ ...btnPrimary, padding: "9px 22px", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" onClick={onClose} disabled={saving}
              style={{ ...btnSecondary, padding: "9px 20px" }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
