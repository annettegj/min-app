// Shown when the user clicks Search while >= 5 companies are still waiting to be researched.
export function QueueModal({ pendingQueueCount, clearingQueue, onResearch, onClearAndSearch, onClose }: {
  pendingQueueCount: number | null;
  clearingQueue: boolean;
  onResearch: () => void;
  onClearAndSearch: () => void;
  onClose: () => void;
}) {
  return (
    <div onClick={() => { if (!clearingQueue) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 520, width: "100%", padding: "26px 28px", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
        <p style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>{pendingQueueCount} companies are still waiting to be researched</p>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
          If you search now, the app will only research this waiting list — your selected sources and terms will <strong>not</strong> be searched, because it looks for new companies only once the list is below 5. Choose what to do:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" disabled={clearingQueue} onClick={onResearch}
            style={{ textAlign: "left", background: "var(--white)", color: "var(--navy)", border: "1px solid var(--border)", borderRadius: 4, padding: "14px 16px", cursor: clearingQueue ? "default" : "pointer" }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Research the waiting list</span>
            <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>Runs the search on the {pendingQueueCount} waiting companies. Your selected sources/terms are searched on a later run.</span>
          </button>
          <button type="button" disabled={clearingQueue} onClick={onClearAndSearch}
            style={{ textAlign: "left", background: "var(--white)", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "14px 16px", cursor: clearingQueue ? "default" : "pointer" }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{clearingQueue ? "Clearing…" : "Clear the list & search my selections"}</span>
            <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>Removes the waiting companies (not yet researched; may be found again later), then searches your selected sources and terms.</span>
          </button>
        </div>
        <div style={{ marginTop: 16 }}>
          <button type="button" disabled={clearingQueue} onClick={onClose}
            style={{ background: "var(--surface)", color: "var(--text-slate)", border: "1px solid var(--border)", padding: "9px 22px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: clearingQueue ? "default" : "pointer", borderRadius: 4 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
