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
import { ENRICH_BATCH_SIZE, STUCK_WARN_TIMES } from "@/lib/searchLimits";
import type { SearchApi } from "@/app/hooks/useSearch";

// The "Find New Companies" tab. Owns nothing itself, all state + handlers live in useSearch, which
// is instantiated in page.tsx and passed in as `api` (so a running search survives tab switches).
// savedBySource comes from the Company Database hook (useCompanies); onGoToDatabase switches the
// parent's active tab (the "Go to Company Database →" button after a save).
export function FindCompaniesTab({ api, savedBySource, onGoToDatabase, categories }: {
  api: SearchApi;
  savedBySource: Map<string, number>;
  onGoToDatabase: () => void;
  categories: string[];
}) {
  const {
    agentState, setAgentState, agentError, setAgentError,
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
    searchProgress, searchMode, activeSearchJobId, logLines, showLog, setShowLog,
    pendingQueueCount, queueItems, queueSelected, toggleQueueSelected, clearingQueue,
    warnThresholdPct, warnMinUses, perfModalOpen, setPerfModalOpen,
    perfDraftPct, setPerfDraftPct, perfDraftMin, setPerfDraftMin,
    perfSaving, perfEditThreshold, setPerfEditThreshold,
    currentStep, elapsedLabel, selectedCount,
    enterConfigEdit, cancelConfigEdit, updateDraftTerm, removeDraftTerm, addDraftTerm,
    removeDraftSource, toggleDraftSourceFeatured, openAddSource, openEditSource, applySource, saveConfig,
    clearQueue, saveSettings,
    sourceIsLow, fmtHitRate,
    deleteFromQueue, resetProcessingToQueue, handleNewSearch, handleQueueSearch,
    toggleResult, handleAddSelected, updatePending, removePending, handleSave,
  } = api;

  // "What's the difference?" help modal for the two search actions.
  const [modesInfoOpen, setModesInfoOpen] = useState(false);
  // Clearing the waiting list is destructive (discards not-yet-researched discoveries), so it asks
  // for confirmation with a red "are you sure?" prompt before running.
  const [confirmClearQueue, setConfirmClearQueue] = useState(false);

  // The two searches are mutually exclusive: ticking waiting-list companies locks the new-search
  // controls (terms/sources/button), and picking terms/sources locks the waiting-list controls.
  const rightEngaged = queueSelected.size > 0;
  const leftEngaged = selectedTerms.length > 0 || selectedSources.length > 0;

  return (
    <>
      {/* Centered column for this tab, wide so the idle view can be a config + waiting-list split. */}
      <div style={{ maxWidth: 1460, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Live search log, mirrors the server log, so no need to open the Render dashboard */}
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
          {/* Help link spanning above both boxes, explains the two ways to search. */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -8 }}>
            <button type="button" onClick={() => setModesInfoOpen(true)}
              style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, padding: 0 }}>
              ⓘ What&apos;s the difference between the two searches?
            </button>
          </div>
          <div style={{ display: "flex", gap: 48, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* Left (wider): the search configuration + the "new search" action. */}
            <div style={{ flex: "1 1 620px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Search configuration, read from the DB; editable in place (Edit toggle) */}
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
                      style={{ background: "transparent", color: "var(--white)", border: "1px solid var(--border-on-dark)", borderRadius: 4, padding: "6px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer" }}>
                      ✎ Edit
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
                        {draftTerms.map(t => {
                          // A newly added (not-yet-saved) term is highlighted and autofocused so it's
                          // obvious which box to fill in, otherwise the empty input blends in with the rest.
                          const isNew = t.id == null;
                          return (
                          <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button type="button" title="Remove term" onClick={() => removeDraftTerm(t.key)}
                              style={{ background: "transparent", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>✕</button>
                            <input type="text" value={t.term} onChange={e => updateDraftTerm(t.key, e.target.value)} autoFocus={isNew}
                              placeholder={isNew ? "Type the new search term…" : "Search term"}
                              style={{ ...inputStyle, flex: 1, ...(isNew ? { border: "2px solid var(--accent)", background: "var(--surface-tint)", fontWeight: 600, boxShadow: "0 0 0 3px rgba(8,145,178,0.18)" } : {}) }} />
                            {isNew && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)", flexShrink: 0 }}>New</span>}
                          </div>
                          );
                        })}
                        {draftTerms.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>No search terms yet, add one below.</p>}
                      </div>
                      <div style={{ marginTop: "auto", paddingTop: 12 }}>
                        <button type="button" onClick={addDraftTerm} style={addBtnStyle}>+ Add new search term</button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Same maxHeight cap (320) as each source column's scroll area, so the four
                          columns line up, and the terms list never follows a source's "Show all". */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4, paddingRight: 6, maxHeight: termsExpanded ? "none" : 320, overflowY: termsExpanded ? "visible" : "auto" }}>
                        {[...termOptions].sort((a, b) => a.localeCompare(b)).map(t => {
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
                {/* Sources, spans 3 of the 4 columns so the type groups sit side by side */}
                <div className="md:col-span-3" style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>{configEditMode ? "Sources" : "Sources (choose up to 4)"}</label>
                  </div>
                  {configEditMode ? (
                    <>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Tick <strong>Recommended</strong> to show a source in the short default list. Click a source name to edit its details.</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 4 }}>
                        {[
                          { heading: "Website", type: "web site" },
                          { heading: "Single page", type: "web page" },
                          { heading: "YouTube", type: "youtube" },
                        ].map(group => {
                          const items = draftSources.filter(s => (s.type ?? "web site") === group.type).sort((a, b) => a.name.localeCompare(b.name));
                          if (items.length === 0) return null;
                          return (
                            <div key={group.heading} style={{ flex: "1 1 220px", minWidth: 0 }}>
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
                                            <span title="Read once, nothing new to find; hidden from selection" style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", background: "var(--surface-tint)", border: "1px solid var(--border-light)", borderRadius: 3, padding: "1px 5px" }}>completed</span>
                                          )}
                                          <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 11 }}> · Edit ✎</span>
                                        </button>
                                        <button type="button" title="Remove source" onClick={() => removeDraftSource(s.key)}
                                          style={{ background: "transparent", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}>✕</button>
                                      </div>
                                      <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>
                                        {tu > 0 || cf > 0 || saved > 0 ? `used ${tu} · found ${cf} · saved ${saved}` : "Not used yet"}
                                      </span>
                                      {sourceIsLow(tu, cf) && (
                                        <span style={{ display: "block", fontSize: 10.5, color: "var(--danger-text)", fontWeight: 700, marginTop: 2 }}>
                                          ⚠ Low find rate ({fmtHitRate(tu, cf)})
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
                      {draftSources.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>No sources yet, add one below.</p>}
                      <div style={{ marginTop: 14 }}>
                        <button type="button" onClick={openAddSource} style={addBtnStyle}>+ Add new source</button>
                      </div>
                    </>
                  ) : (() => {
                    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
                    const groups = [
                      { heading: "Website", showAllLabel: "websites", items: sourceOptions.filter(s => (s.type ?? "web site") === "web site").sort(byName) },
                      // Single pages are one-shot: once read (times_used > 0) they drop out of the
                      // selectable list into "Completed single pages" unless the user re-added one.
                      { heading: "Single page", showAllLabel: "single pages", items: sourceOptions.filter(s => s.type === "web page" && (s.times_used === 0 || reactivatedPages.has(s.name))).sort(byName) },
                      { heading: "YouTube", showAllLabel: "YouTube sources", items: sourceOptions.filter(s => s.type === "youtube").sort(byName) },
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
                                ? `used ${s.times_used} · found ${s.companies_found} · saved ${savedBySource.get(s.name) ?? 0}`
                                : "Not used yet"}
                            </span>
                            {s.last_used_at && (
                              <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)" }}>last used {fmtDate(s.last_used_at)}</span>
                            )}
                            {sourceIsLow(s.times_used, s.companies_found) && (
                              <span style={{ display: "block", fontSize: 10.5, color: "var(--danger-text)", fontWeight: 700, marginTop: 2 }}>
                                ⚠ Low find rate ({fmtHitRate(s.times_used, s.companies_found)}), consider editing or removing
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    };
                    return (
                    <>
                    {/* Flex (not a fixed 3-col grid) so the visible type groups always fill the full
                        width, instead of leaving an empty column when a group (e.g. Single page) is empty. */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 4 }}>
                      {groups.map(group => {
                        if (group.items.length === 0) return null;
                        const featured = group.items.filter(s => s.featured);
                        const others = group.items.filter(s => !s.featured);
                        const hasFeatured = featured.length > 0;
                        const expanded = !!expandedSourceGroups[group.heading];
                        const hasHidden = hasFeatured && others.length > 0; // non-recommended hidden here
                        return (
                          <div key={group.heading} style={{ flex: "1 1 220px", minWidth: 0 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>{group.heading}</p>
                            {hasFeatured ? (
                              // One shared scroll container so the column never has two scrollbars.
                              // When expanded, lift the height cap so the extra sources are actually
                              // visible (otherwise "Show all" reveals them below a 320px fold and looks like nothing happened).
                              <div style={{ maxHeight: expanded ? "none" : 320, overflowY: expanded ? "visible" : "auto", paddingRight: 4 }}>
                                {/* Recommended set, visually boxed so it's clear this is a curated subset. */}
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
              {/* Completed single pages, one-shot pages already read; kept for reference (bottom-right), not selectable. */}
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
                                  used {s.times_used} · found {s.companies_found} · saved {savedBySource.get(s.name) ?? 0}
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

                {/* Target market, soft region steer for discovery */}
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
                    <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 14 }}>Live search runs offline during the pilot, the database below is kept up to date.</p>
                  )}
                  {!SEARCH_DISABLED && rightEngaged && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14 }}>You&apos;ve picked companies from the waiting list, clear that selection to run a new search instead.</p>
                  )}
                </div>
              </div>

            </div>
            {/* Right (narrower): the waiting list, a self-contained panel, nothing to do with the config.
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
                      The waiting list is empty. Run a new search to find companies, anything found beyond the {ENRICH_BATCH_SIZE} researched this run waits here for you to process later.
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
                          // Flag a company that has repeatedly been left stuck (auto-recovered) so the
                          // user can consider removing it. One-off stalls (cancelled searches) don't count.
                          const stuck = (it.stuck_count ?? 0) >= STUCK_WARN_TIMES;
                          return (
                            <div key={it.name} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, fontSize: 13, color: (checked || !atMax) && !leftEngaged ? "var(--text)" : "var(--text-faint)", cursor: (checked || !atMax) && !leftEngaged ? "pointer" : "default" }}>
                                <input type="checkbox" checked={checked} disabled={leftEngaged || (!checked && atMax)}
                                  onChange={() => toggleQueueSelected(it.name)}
                                  style={{ accentColor: "var(--accent)", width: 15, height: 15, marginTop: 2, flexShrink: 0 }} />
                                <span>
                                  {it.name}
                                  {stuck && (
                                    <span title={`Got stuck ${it.stuck_count} times in earlier searches, it may not enrich cleanly. Consider removing it.`}
                                      style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--danger-text)", background: "var(--surface-danger)", border: "1px solid var(--border-danger)", borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>
                                      ⚠ stuck {it.stuck_count}×
                                    </span>
                                  )}
                                  <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)", marginTop: 1 }}>
                                    {it.source_name ? `from ${it.source_name}` : "source unknown"}{it.discovered_at ? ` · found ${fmtDate(it.discovered_at)}` : ""}
                                  </span>
                                </span>
                              </label>
                              {stuck && (
                                <button type="button" onClick={() => deleteFromQueue(it.name)} title="Remove from waiting list"
                                  style={{ background: "transparent", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1, padding: "2px 4px", flexShrink: 0 }}>✕</button>
                              )}
                            </div>
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
                        {!confirmClearQueue ? (
                          <button type="button" onClick={() => setConfirmClearQueue(true)} disabled={clearingQueue || (pendingQueueCount ?? 0) === 0}
                            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: clearingQueue || (pendingQueueCount ?? 0) === 0 ? "default" : "pointer", fontSize: 11.5, fontWeight: 600, padding: "8px 0 0", textAlign: "center", width: "100%", opacity: (pendingQueueCount ?? 0) === 0 ? 0.5 : 1 }}>
                            {clearingQueue ? "Clearing…" : "Clear waiting list"}
                          </button>
                        ) : (
                          <div style={{ marginTop: 10, border: "1px solid var(--border-danger)", borderRadius: 4, background: "var(--surface-danger)", padding: "12px 14px" }}>
                            <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--danger-text)", marginBottom: 4 }}>Clear the whole waiting list?</p>
                            <p style={{ fontSize: 11.5, color: "var(--text)", lineHeight: 1.5, marginBottom: 10 }}>
                              This discards all {pendingQueueCount ?? 0} companies waiting to be researched. They may be found again in a future search, but any already-cached research stays unused. This can&apos;t be undone.
                            </p>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button type="button" onClick={async () => { await clearQueue(); setConfirmClearQueue(false); }} disabled={clearingQueue}
                                style={{ background: "var(--danger-text)", border: "none", color: "var(--white)", cursor: clearingQueue ? "default" : "pointer", fontSize: 11.5, fontWeight: 700, padding: "7px 14px", borderRadius: 4 }}>
                                {clearingQueue ? "Clearing…" : "Yes, clear it"}
                              </button>
                              <button type="button" onClick={() => setConfirmClearQueue(false)} disabled={clearingQueue}
                                style={{ background: "transparent", border: "1px solid var(--border-grey)", color: "var(--text)", cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: "7px 14px", borderRadius: 4 }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          </>
        )}

        {agentState === "searching" && (
          <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", padding: "64px 32px", textAlign: "center" }}>
            <div style={{ display: "inline-block", width: 40, height: 40, border: "4px solid var(--border-light)", borderTop: "4px solid var(--accent)", borderRadius: "50%", animation: "spin 0.9s linear infinite", marginBottom: 20 }} />
            {/* Queue searches have no discovery step, so they show a 2-step flow starting at enrichment. */}
            {(() => {
              const isQueue = searchMode === "queue";
              const totalSteps = isQueue ? 2 : 3;
              const shownStep = isQueue ? currentStep - 1 : currentStep;
              const label = currentStep === 1 ? "Finding companies" : currentStep === 2 ? "Enriching companies" : "Evaluating";
              return (
                <>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)", marginBottom: 10 }}>
                    Step {shownStep} of {totalSteps}: {label}
                  </p>
                  {/* Step progress dots */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                    {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
                      <div key={s} style={{ width: 36, height: 5, borderRadius: 3, background: s <= shownStep ? "var(--accent)" : "var(--border-light)" }} />
                    ))}
                  </div>
                </>
              );
            })()}
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{searchProgress || (searchMode === "queue" ? "The AI agent is researching the companies from your waiting list. This may take a few minutes." : "The AI agent is finding relevant companies. This may take a few minutes.")}</p>
            <p style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>Elapsed: {elapsedLabel}</p>
            <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10 }}>The search runs on the server, so it keeps going even if you switch to another tab. Come back here any time to see live progress. Closing or reloading the browser is fine too, but then this progress view won&apos;t reappear.</p>
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
                    <li style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>Try the search again, companies that were mid-processing are reset automatically</li>
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
              <p style={{ fontSize: 14, color: "var(--banner-info-text)" }}>All pre-filled fields are suggested by the AI agent based on search results, review and override if needed.</p>
            </div>
            {pendingCompanies.map((c, i) => (
              <div key={i} style={{ padding: "20px", borderBottom: "1px solid var(--border-light)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <p style={{ fontWeight: 700, color: "var(--navy)", fontSize: 14, marginBottom: 4 }}>{c.name}</p>
                  <button type="button" onClick={() => removePending(i)} title="Not relevant, remove from this list"
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
                    <label style={labelStyle}>Company category</label>
                    <MultiSelect options={categories} value={c.product_category} onChange={next => updatePending(i, "product_category", next)} placeholder="Select…" />
                  </div>
                  <div>
                    <label style={labelStyle}>Max. Price</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="number" placeholder="Optional" value={c.max_price}
                        onChange={(e) => updatePending(i, "max_price", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      <select value={c.price_currency ?? ""} onChange={(e) => updatePending(i, "price_currency", e.target.value)} style={{ ...inputStyle, width: 84 }}>
                        <option value="">-</option>
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

      {/* Queue warning, pops up when the user clicks Search while >= 5 companies are still waiting */}
      {modesInfoOpen && <SearchModesInfoModal onClose={() => setModesInfoOpen(false)} />}

      {/* Source-performance modal, opened by "Source performance" in the Search Configuration panel */}
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
          isLow={sourceIsLow}
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
