import { btnPrimary } from "@/lib/styles";
import { ENRICH_BATCH_SIZE } from "@/lib/searchLimits";

// Explains the difference between the two search actions (new search vs. work the waiting list).
export function SearchModesInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 560, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
        <div style={{ background: "var(--header)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "var(--white)", fontSize: 17, fontWeight: 700 }}>The two ways to search</p>
          <button type="button" onClick={onClose}
            style={{ background: "transparent", color: "var(--white)", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto", fontSize: 14, color: "var(--text)", lineHeight: 1.7 }}>
          <p style={{ marginBottom: 14 }}>A search happens in three steps: <strong>find</strong> new company names, <strong>research</strong> each one, then <strong>score</strong> them against the ICP. The two buttons differ in whether the &quot;find&quot; step runs.</p>

          <p style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>Search for new companies</p>
          <p style={{ marginBottom: 14 }}>Uses your selected <strong>sources &amp; search terms</strong> to <strong>find</strong> companies the app hasn&apos;t seen before, then researches and scores the newest {ENRICH_BATCH_SIZE}. Use this to discover fresh prospects. If it finds more than {ENRICH_BATCH_SIZE}, the extras go into the waiting list for later.</p>

          <p style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>Research the waiting list</p>
          <p style={{ marginBottom: 14 }}>Skips the &quot;find&quot; step entirely. It researches and scores up to {ENRICH_BATCH_SIZE} companies that were <strong>already found but not yet researched</strong> — the ones you tick, or the {ENRICH_BATCH_SIZE} that have waited longest. It <strong>ignores the search configuration</strong>. Use this to work through the backlog.</p>

          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 0 }}>Either way, at most {ENRICH_BATCH_SIZE} companies are processed per run. A new search costs a little more (it does the web-search discovery); the waiting list is cheaper because it skips that step.</p>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button type="button" onClick={onClose} style={{ ...btnPrimary, padding: "9px 22px" }}>Got it</button>
          </div>
        </div>
      </div>
    </div>
  );
}
