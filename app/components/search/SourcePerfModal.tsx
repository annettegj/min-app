import { btnPrimary, btnSecondary } from "@/lib/styles";
import { MarketBadge } from "@/app/components/common/MarketBadge";

type Row = { name: string; market?: string; times_used: number; companies_found: number };

// "Source performance" — per-source used/queued/saved + hit rate, with an editable low-hit-rate rule.
export function SourcePerfModal({
  warnThresholdPct, warnMinUses, editThreshold, draftPct, draftMin, saving,
  setDraftPct, setDraftMin, onEdit, onSave, onCancelEdit, onClose,
  sources, savedBySource, hitRate, isLow, fmtHitRate, fmtSavedRate,
}: {
  warnThresholdPct: number; warnMinUses: number;
  editThreshold: boolean; draftPct: string; draftMin: string; saving: boolean;
  setDraftPct: (v: string) => void; setDraftMin: (v: string) => void;
  onEdit: () => void; onSave: () => void; onCancelEdit: () => void; onClose: () => void;
  sources: Row[]; savedBySource: Map<string, number>;
  hitRate: (t: number, f: number) => number | null;
  isLow: (t: number, f: number) => boolean;
  fmtHitRate: (t: number, f: number) => string;
  fmtSavedRate: (t: number, saved: number) => string;
}) {
  return (
    <div onClick={() => { if (!saving) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 960, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
        <div style={{ background: "var(--header)", padding: "16px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "var(--white)", fontSize: 19, fontWeight: 700 }}>Source performance</p>
          <button type="button" onClick={() => { if (!saving) onClose(); }}
            style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "26px 30px", overflowY: "auto" }}>
          <div style={{ marginBottom: 18, borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            {!editThreshold ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 16.5, fontWeight: 600, color: "var(--navy)", lineHeight: 1.5 }}>Flag a source when its hit rate is below <strong>{warnThresholdPct}%</strong>, once it has been used at least <strong>{warnMinUses}</strong> times.</span>
                <button type="button" onClick={onEdit}
                  style={{ ...btnSecondary, padding: "5px 12px", fontSize: 12, marginLeft: "auto" }}>Edit threshold</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, color: "var(--navy)" }}>
                  <span>Warn when hit rate is below</span>
                  <input type="number" min={0} step={0.5} value={draftPct} onChange={e => setDraftPct(e.target.value)}
                    style={{ width: 76, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 15 }} />
                  <span>%, once the source has been used at least</span>
                  <input type="number" min={0} step={1} value={draftMin} onChange={e => setDraftMin(e.target.value)}
                    style={{ width: 66, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 15 }} />
                  <span>times.</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button type="button" onClick={onSave} disabled={saving}
                    style={{ ...btnPrimary, padding: "8px 20px", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
                  <button type="button" onClick={onCancelEdit} disabled={saving}
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

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", borderBottom: "1px solid var(--border-card)" }}>
                  <th style={{ padding: "9px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Source</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Used</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Found</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Saved</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Hit rate</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Saved rate</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const hrVal = (s: Row) => { const hr = hitRate(s.times_used, s.companies_found); return hr === null ? Infinity : hr; };
                  return [...sources].sort((a, b) => {
                    const la = isLow(a.times_used, a.companies_found) ? 0 : 1;
                    const lb = isLow(b.times_used, b.companies_found) ? 0 : 1;
                    if (la !== lb) return la - lb;
                    return hrVal(a) - hrVal(b);
                  }).map(s => {
                    const low = isLow(s.times_used, s.companies_found);
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
  );
}
