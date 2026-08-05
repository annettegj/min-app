// Small EU / US / Global tag shown next to a source so the user knows which market it leans toward.
export function MarketBadge({ market }: { market?: string | null }) {
  if (!market) return null;
  const m = market.toUpperCase();
  const isEU = m === "EU", isUS = m === "US";
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", padding: "1px 5px", borderRadius: 3, marginLeft: 6, textTransform: "uppercase", whiteSpace: "nowrap",
      background: isEU ? "var(--badge-green-bg)" : isUS ? "var(--banner-info-bg)" : "var(--surface-hover)",
      color: isEU ? "var(--success)" : isUS ? "var(--banner-info-text)" : "var(--text-muted)" }}>{market}</span>
  );
}
