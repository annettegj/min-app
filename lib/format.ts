import type { Company, DiffSeg } from "@/lib/uiTypes";

// Small pure formatting/display helpers shared across the UI.

// A simple line-level diff (LCS) for showing what the AI changed in an ICP draft before it's applied.
export function diffLines(oldText: string, newText: string): DiffSeg[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffSeg[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "equal", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "remove", text: a[i] }); i++; }
    else { out.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: "remove", text: a[i] }); i++; }
  while (j < m) { out.push({ type: "add", text: b[j] }); j++; }
  return out;
}

// Star colour by ICP fit score (1–5).
export const icpColor = (score: number) =>
  score >= 4 ? "var(--success-bright)" : score === 3 ? "var(--warning-bright)" : "var(--danger)";

// Hostname shown for a company website link.
export function displayHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Ensures a URL has a protocol so it works as an external href (not treated as a relative link).
export function safeHref(url: string): string {
  if (!url) return "#";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// "Date added" to the database — falls back to enriched_at for rows saved before added_at existed.
export function fmtAddedDate(c: Company): string {
  const iso = c.added_at ?? c.enriched_at;
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
