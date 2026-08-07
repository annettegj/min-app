"use client";

import { useState } from "react";
import { US_MARKET_ENABLED } from "@/lib/features";
import { MarketBadge } from "@/app/components/common/MarketBadge";
import { MultiSelect } from "@/app/components/common/MultiSelect";
import { SourcePerfModal } from "@/app/components/search/SourcePerfModal";
import { SourceModal } from "@/app/components/search/SourceModal";
import { SearchModesInfoModal } from "@/app/components/search/SearchModesInfoModal";
import { inputStyle, labelStyle, btnPrimary, btnSecondary, addBtnStyle } from "@/lib/styles";
import { safeHref, fmtDate } from "@/lib/format";
import { SEARCH_DISABLED, GEO_OPTIONS } from "@/lib/uiConstants";
import { ENRICH_BATCH_SIZE } from "@/lib/searchLimits";
import { useSearch } from "@/app/hooks/useSearch";

// The "Find New Companies" tab. Owns nothing itself — all state + handlers live in useSearch.
// savedBySource + reloadCompanies come from the Company Database hook (useCompanies); onGoToDatabase
// switches the parent's active tab (the "Go to Company Database →" button after a save).
export function FindCompaniesTab({ savedBySource, reloadCompanies, onGoToDatabase, categories }: {
  savedBySource: Map<string, number>;
  reloadCompanies: () => Promise<void> | void;
  onGoToDatabase: () => void;
  categories: string[];
}) {
  const {
    agentState, setAgentState, agentError, setAgentError, staleCompanies, setStaleCompanies,
    searchResults, setSearchResults, pendingCompanies, addingState, setAddingState,
    saveError, sourceNameMap,
    selectedTerms, setSelectedTerms, selectedSources, setSelectedSources,
    targetMarket, setTargetMarket, sourceOptions, termOptions,
    configEditMode, draftTerms, draftSources,
    newSource, setNewSource, editingSourceKey,
    sourceModalOpen, setSourceModalOpen, sourceInfoOpen, setSourceInfoOpen,
    termsExpanded, setTermsExpanded, expandedSourceGroups, toggleSourceGroup,
    termLastUsed, reactivatedPages, reactivateSource,
    configBusy, configError, setConfigError,
    searchProgress, activeSearchJobId, logLines, showLog, setShowLog,
    pendingQueueCount, queueItems, queueSelected, toggleQueueSelected, clearingQueue,
    warnThresholdPct, warnMinUses, perfModalOpen, setPerfModalOpen,
    perfDraftPct, setPerfDraftPct, perfDraftMin, setPerfDraftMin,
    perfSaving, perfEditThreshold, setPerfEditThreshold,
    currentStep, elapsedLabel, selectedCount,
    enterConfigEdit, cancelConfigEdit, updateDraftTerm, removeDraftTerm, addDraftTerm,
    removeDraftSource, toggleDraftSourceFeatured, openAddSource, openEditSource, applySource, saveConfig,
    clearQueue, saveSettings,
    sourceHitRate, sourceIsLow, fmtHitRate, fmtSavedRate,
    deleteFromQueue, resetProcessingToQueue, handleNewSearch, handleQueueSearch,
    toggleResult, handleAddSelected, updatePending, removePending, handleSave,
  } = useSearch(reloadCompanies);

  // "What's the difference?" help modal for the two search actions.
  const [modesInfoOpen, setModesInfoOpen] = useState(false);

  // The two searches are mutually exclusive: ticking waiting-list companies locks the new-search
  // controls (terms/sources/button), and picking terms/sources locks the waiting-list controls.
  const rightEngaged = queueSelected.size > 0;
  const leftEngaged = selectedTerms.length > 0 || selectedSources.length > 0;

  return (
    <>
      {/* Centered column for this tab — wide so the idle view can be a config + waiting-list split. */}
      <div style={{ maxWidth: 1460, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Live search log — mirrors the server log, so no need to open the Render dashboard */}
        {activeSearchJobId != null && logLines.length > 0 && (
          <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
            <div onClick={() => setShowLog(!showLog)}
              style={{ background: "var(--header)", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <p style={{ color: "var(--white)", fontSize: 13, fontWeight: 700 }}>Search Log</p>
              <span style={{ color: "var(--on-dark)", fontSize: 12 }}>{showLog ? "Hide ▴" : "Show ▾"} ({logLines.length})</span>
            </div>
            {showLog && (
              <pre style={{ margin: 0, padding: "14px 20px", fontSize: 12, fontFamily: "monospace", color: "var(--text)", background: "var(--surface-code)", maxHeight: 340, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {logLines.join("\n")}
              </pre>
            )}
          </div>
        )}

        {agentState === "idle" && addingState !== "saved" && (
          <>
          {/* Help link spanning above both boxes — explains the two ways to search. */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -8 }}>
            <button type="button" onClick={() => setModesInfoOpen(true)}
              style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, padding: 0 }}>
              ⓘ What&apos;s the difference between the two searches?
            </button>
          </div>
          <div style={{ display: "flex", gap: 48, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* Left (wider): the search configuration + the "new search" action. */}
            <div style={{ flex: "1 1 620px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Search configuration — read from the DB; editable in place (Edit toggle) */}
            <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ background: "var(--header)", padding: "0 20px", height: 56, boxSizing: "border-box", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Search Configuration</p>
                {!configEditMode && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button type="button" onClick={() => { setPerfDraftPct(String(warnThresholdPct)); setPerfDraftMin(String(warnMinUses)); setPerfEditThreshold(false); setPerfModalOpen(true); }}
                      style={{ background: "transparent", color: "var(--white)", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 4, padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer" }}>
                      Source performance
                    </button>
                    <button type="button" onClick={enterConfigEdit}
                      style={{ background: "var(--accent)", color: "var(--white)", border: "none", borderRadius: 4, padding: "6px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer" }}>
                      Edit
                    </button>
                  </div>
                )}
              </div>
              {configEditMode && (
                <div style={{ background: "var(--banner-warn-bg)", borderBottom: "1px solid var(--banner-warn-border)", padding: "10px 20px" }}>
                  <p style={{ fontSize: 12, color: "var(--banner-warn-text)" }}>
                    Editing the shared configuration. Click a term or source to change its fields; nothing is saved until you press <strong>Save changes</strong>. Saved changes affect every search, for everyone.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4" style={{ padding: "20px", gap: 32 }}>
                {/* Search terms */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={labelStyle}>{configEditMode ? "Search terms" : "Search terms (choose up to 3)"}</label>
                  {configEditMode ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4, maxHeight: 320, overflowY: "auto", paddingRight: 6 }}>
                        {draftTerms.map(t => (
                          <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button type="button" title="Remove term" onClick={() => removeDraftTerm(t.key)}
                              style={{ background: "transparent", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>✕</button>
                            <input type="text" value={t.term} onChange={e => updateDraftTerm(t.key, e.target.value)}
                              placeholder="Search term" style={{ ...inputStyle, flex: 1 }} />
                          </div>
                        ))}
                        {draftTerms.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>No search terms yet — add one below.</p>}
                      </div>
                      <div style={{ marginTop: "auto", paddingTop: 12 }}>
                        <button type="button" onClick={addDraftTerm} style={addBtnStyle}>+ Add new search term</button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Same maxHeight cap (320) as each source column's scroll area, so the four
                          columns line up — and the terms list never follows a source's "Show all". */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4, paddingRight: 6, maxHeight: termsExpanded ? "none" : 320, overflowY: termsExpanded ? "visible" : "auto" }}>
                        {termOptions.map(t => {
                          const checked = selectedTerms.includes(t);
                          const atMax = selectedTerms.length >= 3;
                          return (
                            <label key={t} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: (checked || !atMax) && !rightEngaged ? "var(--text)" : "var(--text-faint)", cursor: (checked || !atMax) && !rightEngaged ? "pointer" : "default" }}>
                              <input type="checkbox" checked={checked} disabled={rightEngaged || (!checked && atMax)}
                                onChange={() => setSelectedTerms(checked ? selectedTerms.filter(x => x !== t) : [...selectedTerms, t])}
                                style={{ accentColor: "var(--accent)", width: 15, height: 15, marginTop: 2, flexShrink: 0 }} />
                              <span>
                                {t}
                                <span style={{ display: "block", fontSize: 10, color: "var(--text-faint)", marginTop: 1 }}>
                                  {termLastUsed[t] ? `Last used ${fmtDate(termLastUsed[t])}` : "Not used yet"}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {termOptions.length > 8 && (
                        <button type="button" onClick={() => setTermsExpanded(v => !v)}
                          style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "6px 0", marginTop: 4, textAlign: "left" }}>
                          {termsExpanded ? "Show fewer ▴" : `Show all terms (${termOptions.length}) ▾`}
                        </button>
                      )}
                    </>
                  )}
                </div>
                {/* Sources — spans 3 of the 4 columns so the type groups sit side by side */}
                <div className="md:col-span-3" style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>{configEditMode ? "Sources" : "Sources (choose up to 4)"}</label>
                  </div>
                  {configEditMode ? (
                    <>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Tick <strong>Recommended</strong> to show a source in the short default list. Click a source name to edit its details.</p>
                      <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 20, marginTop: 4 }}>
                        {[
                          { heading: "Website", type: "web site" },
                          { heading: "Single page", type: "web page" },
                          { heading: "YouTube", type: "youtube" },
                        ].map(group => {
                          const items = draftSources.filter(s => (s.type ?? "web site") === group.type);
                          if (items.length === 0) return null;
                          return (
                            <div key={group.heading}>
                              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>{group.heading}</p>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
                                {items.map(s => {
                                  const tu = s.times_used ?? 0, cf = s.companies_found ?? 0;
                                  const saved = savedBySource.get(s.name) ?? 0;
                                  return (
                                    <div key={s.key} style={{ background: "var(--surface-input)", border: "1px solid var(--border-input)", borderRadius: 4, padding: "8px 10px" }}>
                                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                                        <button type="button" onClick={() => openEditSource(s)}
                                          style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--navy)" }}>
                                          <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name || "(unnamed source)"}</span>
                                          <MarketBadge market={s.market} />
                                          {s.type === "web page" && tu > 0 && (
                                            <span title="Read once — nothing new to find; hidden from selection" style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", background: "var(--surface-tint)", border: "1px solid var(--border-light)", borderRadius: 3, padding: "1px 5px" }}>completed</span>
                                          )}
                                          <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 11 }}> · Edit ✎</span>
                                        </button>
                                        <button type="button" title="Remove source" onClick={() => removeDraftSource(s.key)}
                                          style={{ background: "transparent", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}>✕</button>
                                      </div>
                                      <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>
                                        {tu > 0 || cf > 0 || saved > 0 ? `used ${tu} · queued ${cf} · saved ${saved}` : "Not used yet"}
                                      </span>
                                      {sourceIsLow(tu, cf) && (
                                        <span style={{ display: "block", fontSize: 10.5, color: "var(--danger-text)", fontWeight: 700, marginTop: 2 }}>
                                          ⚠ Low hit rate ({fmtHitRate(tu, cf)})
                                        </span>
                                      )}
                                      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, cursor: "pointer", fontSize: 11.5, color: "var(--text-slate)", fontWeight: 600 }}>
                                        <input type="checkbox" checked={s.featured} onChange={() => toggleDraftSourceFeatured(s.key)}
                                          style={{ accentColor: "var(--accent)", width: 14, height: 14, flexShrink: 0 }} />
                                        Recommended
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {draftSources.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>No sources yet — add one below.</p>}
                      <div style={{ marginTop: 14 }}>
                        <button type="button" onClick={openAddSource} style={addBtnStyle}>+ Add new source</button>
                      </div>
                    </>
                  ) : (() => {
                    const groups = [
                      { heading: "Website", showAllLabel: "websites", items: sourceOptions.filter(s => (s.type ?? "web site") === "web site") },
                      // Single pages are one-shot: once read (times_used > 0) they drop out of the
                      // selectable list into "Completed single pages" — unless the user re-added one.
                      { heading: "Single page", showAllLabel: "single pages", items: sourceOptions.filter(s => s.type === "web page" && (s.times_used === 0 || reactivatedPages.has(s.name))) },
                      { heading: "YouTube", showAllLabel: "YouTube sources", items: sourceOptions.filter(s => s.type === "youtube") },
                    ];
                    // One source row (checkbox + name + stats). Reused for the recommended box and the rest.
                    const renderRow = (s: (typeof sourceOptions)[number]) => {
                      const isPage = s.type === "web page";
                      const checked = selectedSources.includes(s.name);
                      const atMax = selectedSources.length >= 4;
                      return (
                        <label key={s.name} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: (checked || !atMax) && !rightEngaged ? "var(--text)" : "var(--text-faint)", cursor: (checked || !atMax) && !rightEngaged ? "pointer" : "default" }}>
                          <input type="checkbox" checked={checked} disabled={rightEngaged || (!checked && atMax)}
                            onChange={() => setSelectedSources(checked ? selectedSources.filter(x => x !== s.name) : [...selectedSources, s.name])}
                            style={{ accentColor: "var(--accent)", width: 15, height: 15, marginTop: 2, flexShrink: 0 }} />
                          <span>
                            {s.name}<MarketBadge market={s.market} />
                            {isPage && s.url && (
                              <a href={/^https?:\/\//.test(s.url) ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginTop: 1, wordBreak: "break-all", textDecoration: "underline" }}>
                                {s.url.replace(/^https?:\/\//, "")}
                              </a>
                            )}
                            <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>
                              {s.times_used > 0 || s.companies_found > 0 || (savedBySource.get(s.name) ?? 0) > 0
                                ? `used ${s.times_used} · queued ${s.companies_found} · saved ${savedBySource.get(s.name) ?? 0}`
                                : "Not used yet"}
                            </span>
                            {s.last_used_at && (
                              <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)" }}>last used {fmtDate(s.last_used_at)}</span>
                            )}
                            {sourceIsLow(s.times_used, s.companies_found) && (
                              <span style={{ display: "block", fontSize: 10.5, color: "var(--danger-text)", fontWeight: 700, marginTop: 2 }}>
                                ⚠ Low hit rate ({fmtHitRate(s.times_used, s.companies_found)}) — consider editing or removing
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    };
                    return (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 20, marginTop: 4 }}>
                      {groups.map(group => {
                        if (group.items.length === 0) return null;
                        const featured = group.items.filter(s => s.featured);
                        const others = group.items.filter(s => !s.featured);
                        const hasFeatured = featured.length > 0;
                        const expanded = !!expandedSourceGroups[group.heading];
                        const hasHidden = hasFeatured && others.length > 0; // non-recommended hidden here
                        return (
                          <div key={group.heading}>
                            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>{group.heading}</p>
                            {hasFeatured ? (
                              // One shared scroll container so the column never has two scrollbars.
                              <div style={{ maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
                                {/* Recommended set — visually boxed so it's clear this is a curated subset. */}
                                <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border-light)", borderRadius: 4, padding: "8px 10px" }}>
                                  <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>Recommended, high quality sources</p>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {featured.map(renderRow)}
                                  </div>
                                </div>
                                {expanded && others.length > 0 && (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                                    {others.map(renderRow)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
                                {group.items.map(renderRow)}
                              </div>
                            )}
                            {hasHidden && (
                              <button type="button" onClick={() => toggleSourceGroup(group.heading)}
                                style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: "8px 0 0", textAlign: "left" }}>
                                {expanded ? "Show fewer ▴" : `Show all ${group.showAllLabel} (${group.items.length}) ▾`}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    </>
                    );
                  })()}
                </div>
              </div>
              {/* Completed single pages — one-shot pages already read; kept for reference (bottom-right), not selectable. */}
              {!configEditMode && (() => {
                const completed = sourceOptions.filter(s => s.type === "web page" && s.times_used > 0 && !reactivatedPages.has(s.name));
                if (completed.length === 0) return null;
                const open = !!expandedSourceGroups["__completed_pages__"];
                return (
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 20px 24px" }}>
                    <div style={{ maxWidth: 380, width: "100%" }}>
                      <button type="button" onClick={() => toggleSourceGroup("__completed_pages__")}
                        style={{ background: "transparent", border: "none", color: "var(--navy-mid)", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0, textAlign: "right", width: "100%" }}>
                        Completed single pages ({completed.length}) {open ? "▴" : "▾"}
                      </button>
                      {open && (
                        <div style={{ marginTop: 10 }}>
                          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
                            Already read once, so there&apos;s nothing new to find. They&apos;re kept here for reference (not selectable).
                          </p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {completed.map(s => (
                              <div key={s.name} style={{ background: "var(--surface-input)", border: "1px solid var(--border-input)", borderRadius: 4, padding: "8px 10px" }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>{s.name}</span><MarketBadge market={s.market} />
                                {s.url && (
                                  <a href={/^https?:\/\//.test(s.url) ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer"
                                    style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginTop: 1, wordBreak: "break-all", textDecoration: "underline" }}>
                                    {s.url.replace(/^https?:\/\//, "")}
                                  </a>
                                )}
                                <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>
                                  used {s.times_used} · queued {s.companies_found} · saved {savedBySource.get(s.name) ?? 0}
                                </span>
                                {s.last_used_at && (
                                  <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)" }}>last read {fmtDate(s.last_used_at)}</span>
                                )}
                                <button type="button" onClick={() => reactivateSource(s.name)}
                                  style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "6px 0 0", textAlign: "left" }}>
                                  + Add back to source list
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {configError && <p style={{ padding: "0 20px 16px", fontSize: 12, color: "var(--danger-text)" }}>{configError}</p>}
              {configEditMode && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "0 20px 18px" }}>
                  <button type="button" onClick={cancelConfigEdit} disabled={configBusy} style={{ ...btnSecondary, padding: "9px 20px" }}>Cancel</button>
                  <button type="button" onClick={saveConfig} disabled={configBusy} style={{ ...btnPrimary, padding: "9px 24px", opacity: configBusy ? 0.6 : 1 }}>{configBusy ? "Saving…" : "Save changes"}</button>
                </div>
              )}
            </div>

              {/* ── Mode A: brand-new search (uses the search configuration above) ── */}
              <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", padding: "36px 28px 32px", textAlign: "center", display: "flex", flexDirection: "column" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>Search for new companies</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Finds new companies from your selected sources &amp; terms, then researches and scores the newest {ENRICH_BATCH_SIZE}.</p>

                {/* Target market — soft region steer for discovery */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 24 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" }}>Target market</span>
                  <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
                    {([
                      { value: "eu", label: "Europe" },
                      { value: "us", label: "US" },
                      { value: "both", label: "No preference" },
                    ] as const).map((opt) => {
                      const active = targetMarket === opt.value;
                      const locked = !US_MARKET_ENABLED; // US off → selector is a disabled placeholder
                      return (
                        <button key={opt.value} type="button" disabled={locked} onClick={() => setTargetMarket(opt.value)}
                          style={{ background: active ? "var(--accent)" : "var(--white)", color: active ? "var(--white)" : (locked ? "var(--text-faint)" : "var(--text-slate)"), border: "none", borderRadius: 0, padding: "7px 18px", fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", cursor: locked ? "not-allowed" : "pointer", opacity: locked && !active ? 0.5 : 1 }}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{US_MARKET_ENABLED
                    ? "Guides the search toward companies in this region. Any from other regions that turn up are still kept and scored against their own ICP."
                    : "The search focuses on European companies."}</span>
                </div>

                <div style={{ marginTop: "auto" }}>
                  {(() => { const off = SEARCH_DISABLED || rightEngaged; return (
                  <button onClick={() => { if (!off) handleNewSearch(); }} disabled={off}
                    style={{ background: off ? "var(--border-light)" : "var(--accent)", color: off ? "var(--text-dim)" : "var(--white)", border: off ? "1px solid var(--border-grey)" : "none", padding: "12px 32px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: off ? "not-allowed" : "pointer", borderRadius: 4 }}>
                    {SEARCH_DISABLED ? "Search Disabled (Demo)" : "Search for new companies →"}
                  </button>
                  ); })()}
                  {SEARCH_DISABLED && (
                    <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 14 }}>Live search runs offline during the pilot — the database below is kept up to date.</p>
                  )}
                  {!SEARCH_DISABLED && rightEngaged && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14 }}>You&apos;ve picked companies from the waiting list — clear that selection to run a new search instead.</p>
                  )}
                </div>
              </div>

            </div>
            {/* Right (narrower): the waiting list, a self-contained panel — nothing to do with the config.
                Sits at the top and is only as tall as its content (not stretched to the left column). */}
            <div style={{ flex: "0 0 380px" }}>
              {/* ── Mode B: work the waiting list (independent of the search configuration) ── */}
              <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ background: "var(--header)", padding: "0 20px", height: 56, boxSizing: "border-box", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Waiting list</p>
                  <span style={{ color: "var(--on-dark)", fontSize: 12 }}>{pendingQueueCount ?? 0} waiting</span>
                </div>
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", flex: 1 }}>
                  {(pendingQueueCount ?? 0) === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
                      The waiting list is empty. Run a new search to find companies — anything found beyond the {ENRICH_BATCH_SIZE} researched this run waits here for you to process later.
                    </p>
                  ) : (
                    <>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
                        These companies were found in earlier searches but haven&apos;t been researched yet. Pick up to {ENRICH_BATCH_SIZE} to research and score now. If you don&apos;t pick any, the {ENRICH_BATCH_SIZE} that have waited longest are used.
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto", paddingRight: 4, marginBottom: 12 }}>
                        {queueItems.map((it) => {
                          const checked = queueSelected.has(it.name);
                          const atMax = queueSelected.size >= ENRICH_BATCH_SIZE;
                          return (
                            <label key={it.name} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: (checked || !atMax) && !leftEngaged ? "var(--text)" : "var(--text-faint)", cursor: (checked || !atMax) && !leftEngaged ? "pointer" : "default" }}>
                              <input type="checkbox" checked={checked} disabled={leftEngaged || (!checked && atMax)}
                                onChange={() => toggleQueueSelected(it.name)}
                                style={{ accentColor: "var(--accent)", width: 15, height: 15, marginTop: 2, flexShrink: 0 }} />
                              <span>
                                {it.name}
                                <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)", marginTop: 1 }}>
                                  {it.source_name ? `from ${it.source_name}` : "source unknown"}{it.discovered_at ? ` · found ${fmtDate(it.discovered_at)}` : ""}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        {leftEngaged && (
                          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>Clear your search-term/source selection on the left to research the waiting list instead.</p>
                        )}
                        {(() => { const off = SEARCH_DISABLED || leftEngaged; return (
                        <button onClick={() => { if (!off) handleQueueSearch(); }} disabled={off}
                          style={{ ...btnPrimary, width: "100%", padding: "11px 20px", background: off ? "var(--border-light)" : "var(--accent)", color: off ? "var(--text-dim)" : "var(--white)", border: off ? "1px solid var(--border-grey)" : "none", opacity: 1, cursor: off ? "not-allowed" : "pointer" }}>
                          Research {queueSelected.size > 0 ? queueSelected.size : Math.min(ENRICH_BATCH_SIZE, pendingQueueCount ?? 0)} from the waiting list →
                        </button>
                        ); })()}
                        <button type="button" onClick={() => { if (!clearingQueue) clearQueue(); }} disabled={clearingQueue}
                          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: clearingQueue ? "default" : "pointer", fontSize: 11.5, fontWeight: 600, padding: "8px 0 0", textAlign: "center", width: "100%" }}>
                          {clearingQueue ? "Clearing…" : "Clear waiting list"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          </>
        )}

        {agentState === "stale_warning" && (
          <div style={{ background: "var(--white)", border: "1px solid var(--banner-warn-border)" }}>
            <div style={{ background: "var(--banner-warn-text)", padding: "12px 20px" }}>
              <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>A previous search didn’t finish</p>
            </div>
            <div style={{ padding: "24px" }}>
              <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6, marginBottom: 16 }}>
                {staleCompanies.length} {staleCompanies.length === 1 ? "company" : "companies"} got stuck in the previous search and have now been put back in the queue. The search was stopped automatically so you can investigate what went wrong.
              </p>
              <div style={{ border: "1px solid var(--border-light)", marginBottom: 20 }}>
                {staleCompanies.map((name) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: 13, color: "var(--text)" }}>{name}</span>
                    <button
                      onClick={() => deleteFromQueue(name)}
                      title="Remove from queue"
                      style={{ background: "transparent", border: "1px solid var(--border-light)", color: "var(--text-dim)", padding: "3px 10px", fontSize: 12, cursor: "pointer" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-danger)"; e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border-light)"; }}>
                      Remove from queue ✕
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ background: "var(--banner-warn-bg)", border: "1px solid var(--banner-warn-border)", padding: "12px 16px", marginBottom: 24 }}>
                <p style={{ fontSize: 13, color: "var(--banner-warn-text)" }}>
                  If a particular company repeatedly hangs, you can remove it from the queue. Otherwise it’s safe to start a new search — they will be retried.
                </p>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => { setAgentState("idle"); setStaleCompanies([]); }}
                  style={{ background: "var(--header)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                  Back to search options
                </button>
                <button onClick={() => { setStaleCompanies([]); setAgentState("searching"); handleNewSearch(); }}
                  style={{ background: "var(--accent)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                  Start new search →
                </button>
              </div>
            </div>
          </div>
        )}

        {agentState === "searching" && (
          <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", padding: "64px 32px", textAlign: "center" }}>
            <div style={{ display: "inline-block", width: 40, height: 40, border: "4px solid var(--border-light)", borderTop: "4px solid var(--accent)", borderRadius: "50%", animation: "spin 0.9s linear infinite", marginBottom: 20 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>
              Step {currentStep} of 3 — {currentStep === 1 ? "Finding companies" : currentStep === 2 ? "Enriching companies" : "Evaluating"}
            </p>
            {/* Step progress dots */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{ width: 36, height: 5, borderRadius: 3, background: s <= currentStep ? "var(--accent)" : "var(--border-light)" }} />
              ))}
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{searchProgress || "The AI agent is finding relevant companies. This may take a few minutes."}</p>
            <p style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>Elapsed: {elapsedLabel}</p>
            <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10 }}>You can leave this page open — the search runs on the server and this view updates automatically.</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {agentState === "error" && agentError && (
          <div style={{ background: "var(--white)", border: "1px solid var(--border-danger)" }}>
            <div style={{ background: "var(--danger-dark)", padding: "12px 20px" }}>
              <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>{agentError.title}</p>
            </div>
            <div style={{ padding: "24px 24px 20px" }}>
              <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6, marginBottom: 20 }}>{agentError.detail}</p>
              <div style={{ background: "var(--surface-danger)", border: "1px solid var(--border-danger)", padding: "12px 16px", marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--danger-strong)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>What you can do</p>
                {agentError.canRetry ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>Try the search again — companies that were mid-processing are reset automatically</li>
                    <li style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>Check that the API keys (ANTHROPIC_API_KEY, Supabase) are configured correctly</li>
                    <li style={{ fontSize: 13, color: "var(--text)" }}>See the console log (F12) for technical details about the error</li>
                  </ul>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>Wait a few days and try again</li>
                    <li style={{ fontSize: 13, color: "var(--text)" }}>Consider adding new sources or search terms via <strong>Edit</strong> in the Search Configuration panel</li>
                  </ul>
                )}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                {agentError.canRetry && (
                  <button onClick={() => handleNewSearch()}
                    style={{ background: "var(--accent)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                    Try again →
                  </button>
                )}
                <button onClick={() => { setAgentState("idle"); setAgentError(null); }}
                  style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-card)", padding: "10px 24px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {agentState === "done" && addingState === "idle" && (
          <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ background: "var(--header)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Search Results</p>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <p style={{ color: "var(--on-dark)", fontSize: 12 }}>{searchResults.length} companies found</p>
                <button onClick={() => { resetProcessingToQueue(); setAgentState("idle"); setSearchResults([]); }}
                  style={{ background: "var(--white)", color: "var(--navy)", border: "none", padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em" }}>
                  ✕ Cancel
                </button>
              </div>
            </div>
            <div>
              {searchResults.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "18px 20px", borderBottom: "1px solid var(--border-light)", background: r.selected ? "var(--surface-row-hover)" : i % 2 === 0 ? "var(--white)" : "var(--surface-input)" }}>
                  <input type="checkbox" checked={r.selected} onChange={() => toggleResult(i)}
                    style={{ marginTop: 3, accentColor: "var(--accent)", width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <p style={{ fontWeight: 600, color: "var(--navy)", fontSize: 14 }}>{r.name}</p>
                      {r.priority_tier === "early_mover" && (
                        <span style={{ background: "var(--badge-green-bg)", color: "var(--success)", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>Early Mover</span>
                      )}
                      {r.priority_tier === "follower" && (
                        <span style={{ background: "var(--badge-yellow-bg)", color: "var(--badge-yellow-text)", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>Follower</span>
                      )}
                      {r.priority_tier === "enabler" && (
                        <span style={{ background: "var(--badge-purple-bg)", color: "var(--badge-purple-text)", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>Enabler</span>
                      )}
                      {r.icp_score != null && (
                        <span style={{ fontSize: 13, color: r.icp_score >= 4 ? "var(--success)" : r.icp_score === 3 ? "var(--warning)" : "var(--danger)", letterSpacing: 1 }}>
                          {"★".repeat(r.icp_score)}{"☆".repeat(5 - r.icp_score)}
                        </span>
                      )}
                    </div>
                    <a href={safeHref(r.website_url)} target="_blank" rel="noopener noreferrer"
                      style={{ color: "var(--accent)", fontSize: 12, marginBottom: 6, display: "inline-block" }}>
                      {r.website_url}
                    </a>
                    <p style={{ fontSize: 13, color: "var(--text-body)" }}>{r.description}</p>
                    {sourceNameMap[r.name] && (
                      <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
                        Source: {sourceNameMap[r.name]}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      fetch("/api/reject", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ names: [r.name] }),
                      });
                      setSearchResults(prev => prev.filter((_, idx) => idx !== i));
                    }}
                    title="Reject company"
                    style={{ background: "transparent", border: "1px solid var(--border-light)", color: "var(--text-dim)", padding: "4px 10px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-danger)"; e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border-light)"; }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{selectedCount} {selectedCount === 1 ? "company" : "companies"} selected</p>
                <button
                  onClick={() => setSearchResults(prev => prev.map(r => ({ ...r, selected: selectedCount < searchResults.length })))}
                  style={{ background: "none", border: "1px solid var(--border-input)", color: "var(--navy-mid)", padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 4 }}>
                  {selectedCount === searchResults.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <button onClick={handleAddSelected} disabled={selectedCount === 0}
                style={{ background: selectedCount > 0 ? "var(--navy-mid)" : "var(--border-input)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: selectedCount > 0 ? "pointer" : "default" }}>
                Add to Database →
              </button>
            </div>
          </div>
        )}

        {(addingState === "form" || addingState === "saving") && (
          <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ background: "var(--header)", padding: "12px 20px" }}>
              <p style={{ color: "var(--white)", fontSize: 18, fontWeight: 700 }}>Fill in Details</p>
              <p style={{ color: "var(--on-dark)", fontSize: 14, marginTop: 2 }}>Complete the information before adding to the database.</p>
            </div>
            <div style={{ background: "var(--banner-info-bg)", borderBottom: "1px solid var(--banner-info-border)", padding: "12px 20px" }}>
              <p style={{ fontSize: 14, color: "var(--banner-info-text)" }}>All pre-filled fields are suggested by the AI agent based on search results — review and override if needed.</p>
            </div>
            {pendingCompanies.map((c, i) => (
              <div key={i} style={{ padding: "20px", borderBottom: "1px solid var(--border-light)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <p style={{ fontWeight: 700, color: "var(--navy)", fontSize: 14, marginBottom: 4 }}>{c.name}</p>
                  <button type="button" onClick={() => removePending(i)} title="Not relevant — remove from this list"
                    style={{ background: "transparent", border: "1px solid var(--border-light)", color: "var(--text-dim)", padding: "4px 10px", fontSize: 12, cursor: "pointer", flexShrink: 0, borderRadius: 4 }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-danger)"; e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border-light)"; }}>
                    Remove ✕
                  </button>
                </div>
                <a href={safeHref(c.website_url)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 12 }}>{c.website_url}</a>
                {c.description && (
                  <p style={{ fontSize: 13, color: "var(--text-body)", marginTop: 8, lineHeight: 1.6 }}>{c.description}</p>
                )}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginTop: 14 }}>
                  <div>
                    <label style={labelStyle}>Geography</label>
                    <MultiSelect options={GEO_OPTIONS} value={c.geography} onChange={next => updatePending(i, "geography", next)} placeholder="Select…" />
                  </div>
                  <div>
                    <label style={labelStyle}>Product Category</label>
                    <MultiSelect options={categories} value={c.product_category} onChange={next => updatePending(i, "product_category", next)} placeholder="Select…" />
                  </div>
                  <div>
                    <label style={labelStyle}>Max. Price</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="number" placeholder="Optional" value={c.max_price}
                        onChange={(e) => updatePending(i, "max_price", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      <select value={c.price_currency ?? ""} onChange={(e) => updatePending(i, "price_currency", e.target.value)} style={{ ...inputStyle, width: 84 }}>
                        <option value="">—</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <label style={labelStyle}>ICP Fit Score</label>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} onClick={() => updatePending(i, "icp_fit", star)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 1px", color: star <= c.icp_fit ? (c.icp_fit >= 4 ? "var(--success)" : c.icp_fit === 3 ? "var(--warning)" : "var(--danger)") : "var(--border-grey)" }}>
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Priority Tier</label>
                    <select value={c.priority_tier ?? ""} onChange={(e) => updatePending(i, "priority_tier", e.target.value)} style={{ ...inputStyle, width: 160 }}>
                      <option value="">Unknown</option>
                      <option value="early_mover">Early Mover</option>
                      <option value="follower">Follower</option>
                      <option value="enabler">Enabler</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
            {saveError && <p style={{ padding: "12px 20px", color: "var(--danger)", fontSize: 13 }}>{saveError}</p>}
            <div style={{ padding: "16px 20px", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button onClick={() => setAddingState("idle")} disabled={addingState === "saving"}
                style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-card)", padding: "10px 24px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={addingState === "saving"}
                style={{ background: addingState === "saving" ? "var(--text-faint)" : "var(--accent)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: addingState === "saving" ? "default" : "pointer" }}>
                {addingState === "saving" ? "Saving…" : "Confirm & Save →"}
              </button>
            </div>
          </div>
        )}

        {addingState === "saved" && (
          <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", padding: "48px 32px", textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--success-bright)", marginBottom: 8 }}>Companies added to database</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 28 }}>You can find them under the Company Database tab.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => { setAddingState("idle"); setAgentState("idle"); }}
                style={{ background: "transparent", color: "var(--navy-mid)", border: "1px solid var(--navy-mid)", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                Search Again
              </button>
              <button onClick={() => { setAddingState("idle"); setAgentState("idle"); onGoToDatabase(); }}
                style={{ background: "var(--header)", color: "var(--white)", border: "none", padding: "10px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                Go to Company Database →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Queue warning — pops up when the user clicks Search while >= 5 companies are still waiting */}
      {modesInfoOpen && <SearchModesInfoModal onClose={() => setModesInfoOpen(false)} />}

      {/* Source-performance modal — opened by "Source performance" in the Search Configuration panel */}
      {perfModalOpen && (
        <SourcePerfModal
          warnThresholdPct={warnThresholdPct}
          warnMinUses={warnMinUses}
          editThreshold={perfEditThreshold}
          draftPct={perfDraftPct}
          draftMin={perfDraftMin}
          saving={perfSaving}
          setDraftPct={setPerfDraftPct}
          setDraftMin={setPerfDraftMin}
          onEdit={() => { setPerfDraftPct(String(warnThresholdPct)); setPerfDraftMin(String(warnMinUses)); setPerfEditThreshold(true); }}
          onSave={async () => { await saveSettings(); setPerfEditThreshold(false); }}
          onCancelEdit={() => { setPerfDraftPct(String(warnThresholdPct)); setPerfDraftMin(String(warnMinUses)); setPerfEditThreshold(false); }}
          onClose={() => setPerfModalOpen(false)}
          sources={sourceOptions}
          savedBySource={savedBySource}
          hitRate={sourceHitRate}
          isLow={sourceIsLow}
          fmtHitRate={fmtHitRate}
          fmtSavedRate={fmtSavedRate}
        />
      )}

      {sourceModalOpen && (
        <SourceModal
          source={newSource}
          setSource={setNewSource}
          editing={editingSourceKey !== null}
          infoOpen={sourceInfoOpen}
          setInfoOpen={setSourceInfoOpen}
          error={configError}
          busy={configBusy}
          onApply={applySource}
          onClose={() => { setSourceModalOpen(false); setConfigError(""); }}
        />
      )}
    </>
  );
}
