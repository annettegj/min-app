import { GEO_OPTIONS, CAT_OPTIONS } from "@/lib/uiConstants";
import { labelStyle, inputStyle, btnPrimary, btnSecondary } from "@/lib/styles";
import type { AddCompanyForm } from "@/lib/uiTypes";

// Manual "Add company" form — lets users enter a company they came across themselves.
export function AddCompanyModal({ form, setForm, saving, error, onSubmit, onClose }: {
  form: AddCompanyForm;
  setForm: (f: AddCompanyForm) => void;
  saving: boolean;
  error: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div onClick={() => { if (!saving) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 640, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
        <div style={{ background: "var(--header)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "var(--white)", fontSize: 17, fontWeight: 700 }}>Add company</p>
          <button type="button" onClick={() => { if (!saving) onClose(); }}
            style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto" }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
            Enter a company you came across and it&apos;ll be saved straight to the database. Only the name is required. Set the ICP fit yourself for now (an AI-suggested score may come later).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Company name <span style={{ color: "var(--danger-text)" }}>*</span></label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="e.g. Doppelherz" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Website</label>
              <input type="text" value={form.website_url} onChange={e => setForm({ ...form, website_url: e.target.value })} style={inputStyle} placeholder="https://…" />
            </div>
            <div>
              <label style={labelStyle}>Geography</label>
              <select value={form.geography} onChange={e => setForm({ ...form, geography: e.target.value })} style={inputStyle}>
                {GEO_OPTIONS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Product category</label>
              <select value={form.product_category} onChange={e => setForm({ ...form, product_category: e.target.value })} style={inputStyle}>
                {CAT_OPTIONS.map(cat => <option key={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Max price</label>
              <input type="number" value={form.max_price} onChange={e => setForm({ ...form, max_price: e.target.value })} style={inputStyle} placeholder="—" />
            </div>
            <div>
              <label style={labelStyle}>Currency</label>
              <select value={form.price_currency} onChange={e => setForm({ ...form, price_currency: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {["EUR", "GBP", "USD", "NOK", "SEK", "DKK", "CHF"].map(cur => <option key={cur}>{cur}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority tier</label>
              <select value={form.priority_tier} onChange={e => setForm({ ...form, priority_tier: e.target.value })} style={inputStyle}>
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
                  <button key={star} type="button" onClick={() => setForm({ ...form, icp_fit: star })}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, lineHeight: 1, padding: "0 2px", color: star <= form.icp_fit ? "var(--accent)" : "var(--border-grey)" }}>★</button>
                ))}
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Source <span style={{ color: "var(--text-faint)" }}>(optional)</span></label>
              <input type="text" value={form.source_name} onChange={e => setForm({ ...form, source_name: e.target.value })} style={inputStyle} placeholder="Manually added" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Description / notes</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} placeholder="Why it's relevant, what they sell, etc." />
            </div>
          </div>
          {error && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 12 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button type="button" onClick={onSubmit} disabled={saving}
              style={{ ...btnPrimary, padding: "10px 24px", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Add to database"}</button>
            <button type="button" onClick={onClose} disabled={saving}
              style={{ ...btnSecondary, padding: "10px 22px" }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
