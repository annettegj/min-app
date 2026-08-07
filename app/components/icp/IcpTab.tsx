import { useState } from "react";
import { US_MARKET_ENABLED } from "@/lib/features";
import { btnPrimary, btnSecondary } from "@/lib/styles";
import { EXPECTED_LABELS, expectedMatch } from "@/lib/icpTest";
import { useIcpEditor } from "@/app/hooks/useIcpEditor";
import { ReviewInfoModal } from "@/app/components/icp/ReviewInfoModal";
import { ManageExamplesModal } from "@/app/components/icp/ManageExamplesModal";
import { ManageCategoriesModal } from "@/app/components/icp/ManageCategoriesModal";
import type { CategoriesApi } from "@/app/hooks/useCategories";

// The Lysoveta ICP Criteria tab: view/edit the ICP per market, with AI review, apply-fix diff,
// test-on-examples, and version history. All state/logic lives in useIcpEditor. The editable
// product-category vocabulary (categoriesApi) is also edited here, the single app-wide edit surface.
export function IcpTab({ authEmail, categoriesApi }: { authEmail: string | null; categoriesApi: CategoriesApi }) {
  const {
    icpDocs, icpRegion, setIcpRegion, icpEditMode, icpDraft, setIcpDraft, icpSaving, icpError,
    icpHistoryOpen, setIcpHistoryOpen, icpVersions, icpChecking, icpCheck, setIcpCheck, icpApplying, icpApplyNote, icpApplyError,
    icpDiff, icpTesting, icpTestResults, setIcpTestResults, icpTestError, icpTestEmpty, setIcpTestEmpty, icpTestSet,
    manageOpen, setManageOpen, manageDraft, manageOptions, manageSaving, manageError,
    reviewInstructions, reviewInfoOpen, setReviewInfoOpen, reviewEditing, setReviewEditing, reviewDraft, setReviewDraft, reviewSaving, reviewInfoError, setReviewInfoError,
    enterIcpEdit, cancelIcpEdit, applyIcpFix, acceptIcpDiff, discardIcpDiff, testIcp, reviewIcp, commitIcp, toggleIcpHistory,
    openManageExamples, suggestStarterSet, addExample, setExampleExpected, removeExample, saveExamples,
    openReviewInfo, editReviewInstructions, saveReviewInstructions,
  } = useIcpEditor(authEmail);

  // Which ICP sections (## headings) are expanded in the read view. Default: all collapsed, so the
  // criteria read as a tidy list of sections you open one at a time rather than one long wall of text.
  const [expandedIcp, setExpandedIcp] = useState<Record<string, boolean>>({});

  return (
    <>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", flex: "1 1 620px", minWidth: 0 }}>
        <div style={{ background: "var(--header)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Lysoveta ICP Criteria</p>
          {!icpEditMode && (
            <button type="button" onClick={enterIcpEdit}
              style={{ background: "transparent", border: "1px solid var(--border-on-dark)", color: "var(--white)", padding: "5px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              ✎ Edit Criteria
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, padding: "10px 20px", borderBottom: "1px solid var(--border-light)", background: "var(--surface-tint)" }}>
          {([{ key: "eu", label: "European ICP" }, { key: "us", label: "US ICP" }] as const).map(r => {
            const usLocked = r.key === "us" && !US_MARKET_ENABLED; // US off → shown but disabled (placeholder)
            const disabled = icpEditMode || usLocked;
            return (
              <button key={r.key} type="button" disabled={disabled} onClick={() => setIcpRegion(r.key)}
                title={usLocked ? "US market support is coming later" : undefined}
                style={{ padding: "7px 16px", borderRadius: 4, border: "none", cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
                  opacity: usLocked ? 0.45 : (icpEditMode && icpRegion !== r.key ? 0.4 : 1),
                  background: icpRegion === r.key ? "var(--accent)" : "transparent",
                  color: icpRegion === r.key ? "var(--white)" : "var(--text-slate)" }}>
                {r.label}{usLocked ? " · soon" : ""}
              </button>
            );
          })}
        </div>
        <div style={{ padding: "16px 40px", borderBottom: "1px solid var(--border-light)", background: "var(--surface-tint)" }}>
          <p style={{ color: "var(--text-body)", fontSize: 13, lineHeight: 1.6, fontStyle: "italic" }}>
            {icpRegion === "eu"
              ? "The Ideal Customer Profile (ICP) for Lysoveta in Europe. In Step 3 the AI scores each company whose primary market is European against these criteria, assigning a priority tier (Early Mover, Follower, or Enabler) and an ICP fit score."
              : "The US Ideal Customer Profile. Once it holds real criteria (not the placeholder), Step 3 automatically scores companies whose primary market is the United States against it instead of the European ICP."}
          </p>
        </div>
        {icpEditMode && (
          <div style={{ padding: "24px 40px" }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
              Editing the <strong>{icpRegion === "eu" ? "European" : "US"}</strong> ICP. This text is the exact criteria the AI uses to score companies in Step 3, write it as clear instructions (Markdown: <code>##</code> headings, <code>-</code> bullets, and <code>|</code> tables all render). Changes are shared and take effect on the next search. Every save is snapshotted so you can revert.
            </p>
            <textarea value={icpDraft} onChange={e => setIcpDraft(e.target.value)} spellCheck={false}
              style={{ width: "100%", minHeight: 460, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: 1.6, color: "var(--text)", resize: "vertical" }} />
            {icpError && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 8 }}>{icpError}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
              <button type="button" onClick={reviewIcp} disabled={icpSaving || icpChecking}
                style={{ ...btnPrimary, padding: "9px 24px", opacity: (icpSaving || icpChecking) ? 0.6 : 1 }}>{icpChecking ? "Reviewing…" : icpSaving ? "Saving…" : "Review changes with AI"}</button>
              <button type="button" onClick={cancelIcpEdit} disabled={icpSaving || icpChecking}
                style={{ ...btnSecondary, padding: "9px 22px" }}>Cancel</button>
              <button type="button" onClick={testIcp} disabled={icpTesting || icpSaving || icpChecking || !icpDraft.trim()}
                style={{ ...btnSecondary, padding: "9px 18px", opacity: (icpTesting || !icpDraft.trim()) ? 0.6 : 1 }}>
                {icpTesting ? "Testing…" : "Test on example companies"}
              </button>
              <button type="button" onClick={toggleIcpHistory} disabled={icpChecking}
                style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: 13, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>
                {icpHistoryOpen ? "Hide version history" : "Version history"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 18, alignItems: "center", paddingTop: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={openReviewInfo}
                style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left" }}>
                ⓘ What does the AI review check?
              </button>
              <button type="button" onClick={openManageExamples}
                style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left" }}>
                ⚙ Manage test example companies{icpTestSet.length > 0 ? ` (${icpTestSet.length})` : ""}
              </button>
            </div>

            {icpTestError && <p style={{ fontSize: 12.5, color: "var(--danger-text)", marginTop: 12 }}>Couldn’t run the test ({icpTestError}).</p>}
            {icpTestEmpty && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 12 }}>No example companies to test, click <strong>⚙ Manage test example companies</strong> to add some (or run a search first so there’s enriched company data).</p>}
            {icpTestResults && icpTestResults.length > 0 && (
              <div style={{ marginTop: 14, border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", background: "var(--surface)", borderBottom: "1px solid var(--border-card)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>Test results, how the current draft scores</p>
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>Scored against the text in the editor right now (not the saved ICP). A sample of real enriched companies, nothing is changed or saved.</p>
                  </div>
                  <button type="button" onClick={() => { setIcpTestResults(null); setIcpTestEmpty(false); }}
                    style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--text-muted)", borderBottom: "1px solid var(--border-card)" }}>
                        <th style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Company</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Geography</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Tier</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>Score</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Result</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>Expected</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>Match</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {icpTestResults.map((r, k) => {
                        const m = expectedMatch(r.expected, r.included, r.priority_tier);
                        const expLabel = EXPECTED_LABELS.find(e => e.value === r.expected)?.label ?? "-";
                        return (
                        <tr key={k} style={{ borderBottom: "1px solid var(--border-card)", background: m === "mismatch" ? "var(--banner-warn-bg)" : r.included ? "transparent" : "var(--surface)" }}>
                          <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--navy)", whiteSpace: "nowrap" }}>{r.name}</td>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.geography || "-"}</td>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.priority_tier && r.priority_tier !== "none" ? r.priority_tier.replace(/_/g, " ") : "-"}</td>
                          <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, whiteSpace: "nowrap" }}>{r.icp_score}/5</td>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.included ? "var(--success-bright, #2e7d32)" : "var(--text-muted)", fontWeight: 700 }}>{r.included ? "✓ Include" : "Excluded"}</td>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "var(--text-muted)" }}>{r.expected ? expLabel : "-"}</td>
                          <td style={{ padding: "8px 12px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 700, color: m === "ok" ? "var(--success-bright, #2e7d32)" : m === "mismatch" ? "var(--danger-text)" : "var(--text-faint)" }}>{m === "ok" ? "✓" : m === "mismatch" ? "⚠" : "-"}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text)", minWidth: 220 }}>{r.reason}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Proposed AI rewrite, shown as a diff so the change is obvious before it's applied. */}
            {icpDiff && (
              <div style={{ marginTop: 14, border: "1px solid var(--accent)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", background: "var(--surface)", borderBottom: "1px solid var(--border-card)" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>Proposed change, review before applying</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                    <span style={{ background: "var(--diff-add-bg, #e6f4ea)", padding: "0 4px", borderRadius: 2 }}>green = added</span>{" "}
                    <span style={{ background: "var(--diff-del-bg, #fce8e6)", padding: "0 4px", borderRadius: 2, textDecoration: "line-through" }}>red = removed</span>. Unchanged lines are shown for context.
                  </p>
                </div>
                <div style={{ maxHeight: 320, overflow: "auto", padding: "10px 0", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12.5, lineHeight: 1.55, background: "var(--white)" }}>
                  {icpDiff.segments.map((seg, k) => (
                    <div key={k} style={{
                      whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "0 16px",
                      background: seg.type === "add" ? "var(--diff-add-bg, #e6f4ea)" : seg.type === "remove" ? "var(--diff-del-bg, #fce8e6)" : "transparent",
                      color: seg.type === "remove" ? "var(--danger-text)" : seg.type === "add" ? "#1b5e20" : "var(--text-muted)",
                      textDecoration: seg.type === "remove" ? "line-through" : "none",
                    }}>
                      <span style={{ userSelect: "none", opacity: 0.6, marginRight: 8 }}>{seg.type === "add" ? "+" : seg.type === "remove" ? "−" : " "}</span>{seg.text || " "}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--border-card)", background: "var(--surface)" }}>
                  <button type="button" onClick={acceptIcpDiff} style={{ ...btnPrimary, padding: "8px 20px" }}>Use this version</button>
                  <button type="button" onClick={discardIcpDiff} style={{ ...btnSecondary, padding: "8px 20px" }}>Discard</button>
                </div>
              </div>
            )}

            {icpApplyNote && (
              <div style={{ marginTop: 12, border: "1px solid var(--border-card)", borderLeft: "3px solid var(--success, #2e7d32)", borderRadius: 4, padding: "10px 14px", background: "var(--surface)" }}>
                <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}>✓ {icpApplyNote}</p>
              </div>
            )}

            {/* Advisory AI review, shown when the check found issues or couldn't run. Never blocks saving. */}
            {icpCheck && (
              <div style={{ marginTop: 14, border: "1px solid var(--border-card)", borderRadius: 4, borderLeft: `3px solid ${icpCheck.issues.some(i => i.severity === "critical") ? "var(--danger-text)" : "var(--accent)"}`, padding: "14px 16px", background: "var(--surface)" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>
                  {icpCheck.ok === null ? "Couldn’t run the AI review" : icpCheck.issues.length === 0 ? "✓ AI review passed, no issues found" : icpCheck.issues.some(i => i.severity === "critical") ? "The AI review found some gaps" : "The AI review has a few suggestions"}
                </p>
                {icpCheck.error ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 10 }}>The review couldn’t run ({icpCheck.error}). This is only an advisory check, you can still save.</p>
                ) : (
                  <>
                    {icpCheck.summary && <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, marginBottom: 8 }}>{icpCheck.summary}</p>}
                    {icpCheck.issues.length > 0 && (
                      <div style={{ margin: "0 0 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                        {icpCheck.issues.map((iss, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <span style={{ flex: 1, fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}>
                              <strong style={{ color: iss.severity === "critical" ? "var(--danger-text)" : "var(--navy-mid)" }}>{iss.severity === "critical" ? "Critical: " : "Suggestion: "}</strong>{iss.text}
                            </span>
                            <button type="button" onClick={() => applyIcpFix(iss.text, idx)} disabled={icpApplying !== null || icpSaving || icpDiff !== null}
                              style={{ ...btnSecondary, padding: "4px 12px", fontSize: 12, flexShrink: 0, opacity: (icpApplying !== null || icpSaving || icpDiff !== null) ? 0.6 : 1 }}>
                              {icpApplying === idx ? "Applying…" : "Apply fix"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {icpApplyError && <p style={{ fontSize: 12, color: "var(--danger-text)", marginBottom: 8 }}>Couldn’t apply that suggestion ({icpApplyError}). You can edit the text manually or try again.</p>}
                    {icpCheck.issues.length > 0 ? (
                      <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>“Apply fix” lets the AI rewrite the text for that one point, the update lands in the editor above for you to review, and nothing is saved until you press <strong>Save changes</strong>. This is advice, not a gate.</p>
                    ) : (
                      <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>Nothing has been saved yet. Press <strong>Save changes</strong> to make this the live ICP, or keep editing.</p>
                    )}
                  </>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" onClick={commitIcp} disabled={icpSaving}
                    style={{ ...btnPrimary, padding: "8px 20px", opacity: icpSaving ? 0.6 : 1 }}>{icpSaving ? "Saving…" : (icpCheck.ok === null || icpCheck.issues.length > 0) ? "Save anyway" : "Save changes"}</button>
                  <button type="button" onClick={() => setIcpCheck(null)} disabled={icpSaving}
                    style={{ ...btnSecondary, padding: "8px 20px" }}>Keep editing</button>
                </div>
              </div>
            )}
            {icpHistoryOpen && (
              <div style={{ marginTop: 14, border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
                {icpVersions.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "12px 16px" }}>No saved versions yet, the first save you make will appear here.</p>
                ) : icpVersions.map(v => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border-card)" }}>
                    <span style={{ fontSize: 12.5, color: "var(--text)" }}>
                      {new Date(v.created_at).toLocaleString()}{v.saved_by ? ` · ${v.saved_by}` : ""}
                    </span>
                    <button type="button" onClick={() => { setIcpDraft(v.content); setIcpHistoryOpen(false); }}
                      style={{ ...btnSecondary, padding: "5px 14px", fontSize: 12 }}>Load into editor</button>
                  </div>
                ))}
                {icpVersions.length > 0 && (
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "9px 16px" }}>“Load into editor” fills the box with that version, review it, then <strong>Save changes</strong> to make it current.</p>
                )}
              </div>
            )}
          </div>
        )}
        <div style={{ padding: "32px 48px", maxWidth: 820, display: icpEditMode ? "none" : "block" }}>
          {!icpDocs ? (
            <p style={{ color: "var(--text-faint)", fontSize: 14 }}>Loading…</p>
          ) : (() => {
            const toLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            const stripBold = (s: string) => s.replace(/\*\*(.*?)\*\*/g, "$1");
            const isTableRow = (l: string) => l.trim().startsWith("|");
            const isSeparatorRow = (l: string) => /^\|[-| :]+\|$/.test(l.trim());

            const lines = (icpDocs[icpRegion] || "").split("\n");
            // Group into collapsible sections by "## " headings. Anything before the first "## "
            // (the title + intro) is the preamble and always shows.
            const preamble: React.ReactNode[] = [];
            const sections: { key: string; title: string; nodes: React.ReactNode[] }[] = [];
            const push = (node: React.ReactNode) => { (sections.length ? sections[sections.length - 1].nodes : preamble).push(node); };
            let i = 0;

            while (i < lines.length) {
              const line = lines[i];

              if (isTableRow(line)) {
                const tableLines: string[] = [];
                while (i < lines.length && isTableRow(lines[i])) {
                  tableLines.push(lines[i]);
                  i++;
                }
                const rows = tableLines.filter(l => !isSeparatorRow(l));
                const parseRow = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
                const [header, ...body] = rows;
                push(
                  <div key={`table-${i}`} style={{ overflowX: "auto", margin: "16px 0 24px 0" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ background: "var(--surface-tint2)" }}>
                          {parseRow(header).map((cell, ci) => (
                            <th key={ci} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: "var(--navy)", borderBottom: "2px solid var(--border-card)", whiteSpace: "nowrap" }}>{stripBold(cell)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {body.map((row, ri) => (
                          <tr key={ri} style={{ borderBottom: "1px solid var(--surface-tint3)", background: ri % 2 === 0 ? "var(--white)" : "var(--surface-tint)" }}>
                            {parseRow(row).map((cell, ci) => (
                              <td key={ci} style={{ padding: "9px 14px", color: ci === 0 && cell ? "var(--navy)" : "var(--text)", fontWeight: ci === 0 && cell ? 600 : 400 }}>{stripBold(cell)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
                continue;
              }

              if (line.startsWith("## ")) { sections.push({ key: `sec-${i}`, title: line.slice(3), nodes: [] }); i++; continue; }
              else if (line.startsWith("# ")) { push(<h1 key={i} style={{ fontSize: 24, fontWeight: 700, color: "var(--navy)", marginBottom: 4, marginTop: 0 }}>{line.slice(2)}</h1>); }
              else if (line.startsWith("### ")) { push(<h3 key={i} style={{ fontSize: 16, fontWeight: 700, color: "var(--navy-mid)", marginTop: 22, marginBottom: 4 }}>{toLabel(line.slice(4))}</h3>); }
              else if (line.startsWith("---")) { push(<div key={i} style={{ height: 4 }} />); }
              else if (line.startsWith("- ")) {
                push(
                  <p key={i} style={{ fontSize: 15, color: "var(--text)", margin: "4px 0", paddingLeft: 20, position: "relative", lineHeight: 1.7 }}>
                    <span style={{ position: "absolute", left: 0, color: "var(--navy-mid)", fontWeight: 700 }}>·</span>{stripBold(line.slice(2))}
                  </p>
                );
              }
              else if (line.startsWith("**") && line.endsWith("**")) { push(<p key={i} style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)", marginTop: 14, marginBottom: 2 }}>{line.slice(2, -2)}</p>); }
              else if (line === "") { push(<div key={i} style={{ height: 4 }} />); }
              else { push(<p key={i} style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.75, margin: "3px 0" }}>{stripBold(line)}</p>); }

              i++;
            }

            return (
              <>
                {preamble}
                {sections.length > 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "18px 0 4px" }}>Click a section to expand it.</p>
                )}
                {sections.map((sec) => {
                  const open = !!expandedIcp[sec.key];
                  return (
                    <div key={sec.key} style={{ borderTop: "1px solid var(--border-light)" }}>
                      <button type="button" onClick={() => setExpandedIcp(p => ({ ...p, [sec.key]: !p[sec.key] }))}
                        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "transparent", border: "none", cursor: "pointer", padding: "14px 0", textAlign: "left" }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{sec.title}</span>
                        <span style={{ fontSize: 13, color: "var(--text-muted)", flexShrink: 0 }}>{open ? "▾ Hide" : "▸ Show"}</span>
                      </button>
                      {open && <div style={{ paddingBottom: 16 }}>{sec.nodes}</div>}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      </div>

      {/* Company categories, the editable vocabulary used across the app (filter, add, edit, AI search). */}
      <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", flex: "0 1 340px", minWidth: 260 }}>
        <div style={{ background: "var(--header)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Company categories</p>
          <button type="button" onClick={categoriesApi.openManage}
            style={{ background: "transparent", border: "1px solid var(--border-on-dark)", color: "var(--white)", padding: "5px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            ✎ Manage
          </button>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <p style={{ color: "var(--text-body)", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
            The categories a company can be tagged with, used in the Company Database (filter, add, edit) and suggested by the AI after a search. Edit them here; changes apply everywhere.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {categoriesApi.categories.map((c) => (
              <span key={c} style={{ background: "var(--surface-input)", border: "1px solid var(--border-input)", color: "var(--text-body)", fontSize: 13, fontWeight: 600, padding: "5px 12px", borderRadius: 4 }}>{c}</span>
            ))}
          </div>
        </div>
      </div>
      </div>

      {categoriesApi.manageOpen && <ManageCategoriesModal api={categoriesApi} />}

      {reviewInfoOpen && (
        <ReviewInfoModal
          editing={reviewEditing}
          instructions={reviewInstructions}
          draft={reviewDraft}
          error={reviewInfoError}
          saving={reviewSaving}
          setDraft={setReviewDraft}
          onEdit={editReviewInstructions}
          onSave={saveReviewInstructions}
          onCancelEdit={() => { setReviewEditing(false); setReviewInfoError(""); }}
          onClose={() => setReviewInfoOpen(false)}
        />
      )}

      {manageOpen && (
        <ManageExamplesModal
          draft={manageDraft}
          options={manageOptions}
          saving={manageSaving}
          error={manageError}
          onSuggest={suggestStarterSet}
          onAdd={addExample}
          onSetExpected={setExampleExpected}
          onRemove={removeExample}
          onSave={saveExamples}
          onClose={() => setManageOpen(false)}
        />
      )}
    </>
  );
}
