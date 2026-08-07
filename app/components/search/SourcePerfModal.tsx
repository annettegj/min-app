import { useEffect, useState } from "react";
import { btnPrimary, btnSecondary } from "@/lib/styles";
import { MarketBadge } from "@/app/components/common/MarketBadge";

type Row = { name: string; market?: string; times_used: number; companies_found: number };

// "Source performance", per-source used/found/saved counts plus two normalised ratios (find rate and
// saved rate, both "per search"), with an editable low-find-rate rule. Everything is expressed as a
// ratio (companies per search) rather than a percentage, so a source that yields more than one company
// per search never reads as a confusing ">100%".
export function SourcePerfModal({
  warnThresholdPct, warnMinUses, editThreshold, draftPct, draftMin, saving,
  setDraftPct, setDraftMin, onEdit, onSave, onCancelEdit, onClose,
  sources, savedBySource, isLow,
}: {
  warnThresholdPct: number; warnMinUses: number;
  editThreshold: boolean; draftPct: string; draftMin: string; saving: boolean;
  setDraftPct: (v: string) => void; setDraftMin: (v: string) => void;
  onEdit: () => void; onSave: () => void; onCancelEdit: () => void; onClose: () => void;
  sources: Row[]; savedBySource: Map<string, number>;
  isLow: (t: number, f: number) => boolean;
}) {
  // The warning threshold is stored as a percentage of (found ÷ used), but shown/edited here as a
  // "per search" ratio to match the table. This local mirror holds the ratio text the user types so
  // decimals aren't mangled by the percent round-trip; setDraftPct keeps the parent's percentage in sync.
  const [ratioStr, setRatioStr] = useState(String(warnThresholdPct / 100));
  useEffect(() => { if (editThreshold) setRatioStr(String(warnThresholdPct / 100)); }, [editThreshold, warnThresholdPct]);
  const thresholdRatio = (warnThresholdPct / 100).toFixed(2);

  const fmtRatio = (used: number, count: number): string => (used > 0 ? (count / used).toFixed(1) : "-");

  return (
    <div onClick={() => { if (!saving) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 1200, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
        <div style={{ background: "var(--header)", padding: "16px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "var(--white)", fontSize: 19, fontWeight: 700 }}>Source performance</p>
          <button type="button" onClick={() => { if (!saving) onClose(); }}
            style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "26px 30px", overflowY: "auto" }}>
          <div style={{ marginBottom: 18, borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            {!editThreshold ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 16.5, fontWeight: 600, color: "var(--navy)", lineHeight: 1.5 }}>Flag a source when its find ratio is below <strong>{thresholdRatio}</strong> companies per search, once it has been used at least <strong>{warnMinUses}</strong> times.</span>
                <button type="button" onClick={onEdit}
                  style={{ ...btnSecondary, padding: "5px 12px", fontSize: 12, marginLeft: "auto" }}>Edit threshold</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, color: "var(--navy)" }}>
                  <span>Warn when find ratio is below</span>
                  <input type="number" min={0} step={0.05} value={ratioStr}
                    onChange={e => { setRatioStr(e.target.value); setDraftPct(e.target.value === "" ? "" : String(Number(e.target.value) * 100)); }}
                    style={{ width: 76, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 15 }} />
                  <span>companies per search, once the source has been used at least</span>
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
          </div>

          <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 8 }}>
            <strong>Find ratio</strong> = companies found per search (companies found ÷ searches run). A source that keeps coming up empty trends toward 0. This is what the warning is based on.
          </p>
          <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 22 }}>
            <strong>Saved ratio</strong> = companies saved per search (companies saved ÷ searches run). A rough quality signal, shown for reference only, not used for the warning.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", borderBottom: "1px solid var(--border-card)", verticalAlign: "bottom" }}>
                  <th style={{ padding: "9px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Source</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Used</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Found</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Saved</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Find ratio</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>Saved ratio</th>
                  <th style={{ padding: "9px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...sources].sort((a, b) => a.name.localeCompare(b.name)).map(s => {
                  const low = isLow(s.times_used, s.companies_found);
                  const unused = s.times_used === 0;
                  const saved = savedBySource.get(s.name) ?? 0;
                  return (
                    <tr key={s.name} style={{ borderBottom: "1px solid var(--border-card)", background: low ? "var(--banner-warn-bg)" : "transparent" }}>
                      <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>{s.name}<MarketBadge market={s.market} /></td>
                      <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{s.times_used}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{s.companies_found}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{saved}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtRatio(s.times_used, s.companies_found)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtRatio(s.times_used, saved)}</td>
                      <td style={{ padding: "9px 12px", color: low ? "var(--danger-text)" : "var(--text-muted)", fontWeight: low ? 700 : 400, whiteSpace: "nowrap" }}>
                        {unused ? "Not used yet" : low ? "⚠ Low" : "OK"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
