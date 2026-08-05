import type { CSSProperties } from "react";

// Shared inline-style objects used across the UI. Spread and override per call site, e.g.
// style={{ ...btnPrimary, padding: "12px 36px" }}.

export const inputStyle: CSSProperties = {
  width: "100%", border: "1px solid var(--border-input)", padding: "8px 10px",
  fontSize: 13, color: "var(--navy)", background: "var(--surface-input)", outline: "none", borderRadius: 4,
};
export const labelStyle: CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--text-slate)", marginBottom: 6,
};

// Button hierarchy (one teal accent = primary; neutral = secondary; red = destructive).
export const btnBase: CSSProperties = {
  padding: "10px 24px", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", cursor: "pointer", borderRadius: 4,
};
export const btnPrimary: CSSProperties = { ...btnBase, background: "var(--accent)", color: "var(--white)", border: "none" };
export const btnSecondary: CSSProperties = { ...btnBase, background: "var(--white)", color: "var(--ink)", border: "1px solid var(--border)" };

// Full-width dashed "create" affordance for the config lists (add source / add search term).
export const addBtnStyle: CSSProperties = {
  background: "transparent", border: "1px dashed var(--border)", color: "var(--accent)",
  padding: "8px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
  textTransform: "uppercase", cursor: "pointer", borderRadius: 4, width: "100%",
};
export const hintStyle: CSSProperties = { fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 };
export const reqStyle: CSSProperties = { color: "var(--danger-text)", fontWeight: 700, marginLeft: 3 };
export const optStyle: CSSProperties = { fontSize: 10, fontWeight: 400, color: "var(--text-dim)", textTransform: "none", letterSpacing: 0, marginLeft: 6 };
