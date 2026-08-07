import { Fragment, useState } from "react";
import { inputStyle, labelStyle, btnPrimary, btnSecondary } from "@/lib/styles";
import { TIERS, GEO_OPTIONS, STATUS_OPTIONS, CATEGORY_DESCRIPTIONS, TIER_DESCRIPTIONS, ICP_STAR_POINTS } from "@/lib/uiConstants";
import { icpColor, displayHostname, safeHref, fmtAddedDate, parseMulti } from "@/lib/format";
import { AddCompanyModal } from "@/app/components/database/AddCompanyModal";
import { MultiSelect } from "@/app/components/common/MultiSelect";
import type { CompaniesApi } from "@/app/hooks/useCompanies";

// The Company Database tab: filter panel, results table (inline edit / soft-delete / status /
// selection / export), plus the Add-company and remove/unsaved-edit dialogs. All state lives in
// useCompanies (called once in page.tsx and passed in as `api`).
export function CompanyDatabaseTab({ api, categories }: { api: CompaniesApi; categories: string[] }) {
  const {
    companies, guardUnsavedEdit, openAddCompany, showAllCompanies,
    nameQuery, setNameQuery,
    geography, setGeography, category, setCategory, source, setSource, sourceNames, sourceDescriptions, icpMin, setIcpMin, tier, setTier, priceMin, setPriceMin,
    searchState, clearResults, handleSearch, visibleResults, liveMatchCount, sortKey, setSortKey, sortDir, setSortDir, hiddenIds, selectedIds, showOnlySelected, setShowOnlySelected,
    clearSelection, restoreHidden, results, editMode, toggleEditMode, setSelectedIds, expandedCompanyId, setExpandedCompanyId,
    startEdit, confirmRemoveId, setConfirmRemoveId, setEditError, toggleSelected, updateCompanyStatus,
    editingCompanyId, editDraft, setEditDraft, editError, savingEdit, saveEdit, cancelEdit, hasUnsavedEdit,
    setPendingExport, exporting, handleExportExcel, addForm, setAddForm, addSaving, addFormError, submitAddCompany, setAddOpen, addOpen,
    removeTarget, removing, hideFromView, removeCompany, pendingNav, setPendingNav, pendingExport,
  } = api;

  // Second-step confirmation before a permanent delete.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Which ICP star is hovered (for the styled tooltip in the filter).
  const [hoverStar, setHoverStar] = useState<number | null>(null);
  const closeRemove = () => { if (!removing) { setConfirmRemoveId(null); setConfirmDelete(false); } };

  return (
    <>
      <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ background: "var(--header)", padding: "12px 20px" }}>
          <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Filter Companies</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: "var(--banner-info-bg)", borderBottom: "1px solid var(--banner-info-border)" }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>💡</span>
          <p style={{ fontSize: 13, color: "var(--banner-info-text)", lineHeight: 1.5 }}>
            <strong>Every filter is optional.</strong> Set only the ones you want to narrow by; anything you leave alone includes everything. Results update as you change filters.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">

          <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
            <label style={labelStyle}>Geography</label>
            <MultiSelect options={GEO_OPTIONS} value={geography} onChange={setGeography} placeholder="All geographies" />
          </div>

          <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
            <label style={labelStyle}>Company category</label>
            <MultiSelect options={categories} value={category} onChange={setCategory} placeholder="All categories" descriptions={CATEGORY_DESCRIPTIONS} />
          </div>

          <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
            <label style={labelStyle}>Source</label>
            <MultiSelect options={sourceNames} value={source} onChange={setSource} placeholder="All sources" searchable descriptions={sourceDescriptions} />
          </div>

          <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
            <label style={labelStyle}>Priority Tier</label>
            <MultiSelect options={TIERS.slice(1)} value={tier} onChange={setTier} placeholder="All tiers" descriptions={TIER_DESCRIPTIONS} />
          </div>

          <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
            <label style={labelStyle}>Minimum product price</label>
            <div style={{ position: "relative", marginTop: 22 }}>
              {priceMin && (
                <span style={{ position: "absolute", top: -20, left: `calc(${(Number(priceMin) / 200) * 100}% )`, transform: "translateX(-50%)", background: "var(--navy)", color: "var(--white)", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none" }}>
                  {priceMin}
                </span>
              )}
              <input type="range" min={0} max={200} step={5} value={priceMin ? Number(priceMin) : 0}
                onChange={(e) => setPriceMin(e.target.value === "0" ? "" : e.target.value)}
                style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }} />
            </div>
          </div>

          <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border-light)" }}>
            <label style={labelStyle}>Min. ICP Fit Score</label>
            <div style={{ position: "relative", marginTop: 4 }}>
              {hoverStar && (
                <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, maxWidth: 240, zIndex: 30, background: "var(--navy)", color: "var(--white)", fontSize: 12, lineHeight: 1.5, padding: "8px 10px", borderRadius: 4, boxShadow: "0 8px 24px rgba(12,28,46,0.28)", pointerEvents: "none" }}>
                  Show companies rated {hoverStar}★ or higher ({ICP_STAR_POINTS[hoverStar]} on the ICP scale).
                </div>
              )}
              <div style={{ display: "flex", gap: 2 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => setIcpMin(icpMin === star ? 1 : star)}
                    onMouseEnter={() => setHoverStar(star)} onMouseLeave={() => setHoverStar(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, lineHeight: 1, padding: "0 2px", color: star <= icpMin ? (icpMin >= 4 ? "var(--success)" : icpMin === 3 ? "var(--warning)" : "var(--danger)") : "var(--border-grey)" }}>
                    ★
                  </button>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Showing {icpMin}★ and above</p>
          </div>
        </div>

        {companies.length > 0 && liveMatchCount === 0 && (
          <p style={{ padding: "12px 20px", fontSize: 12.5, color: "var(--danger-text)", background: "var(--surface-danger)", borderTop: "1px solid var(--border-light)" }}>
            ⚠ No companies match these filters.{" "}
            {tier.includes("Early Mover") && category.includes("Distributor/enabler")
              ? "By definition a distributor/enabler isn't an early mover. Try Follower, or clear the category."
              : "None have been registered with this combination. Try removing a filter."}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border-light)", background: "var(--white)" }}>
          {searchState === "done" && (
            <button onClick={() => guardUnsavedEdit(clearResults)}
              style={{ ...btnSecondary, padding: "10px 24px", fontSize: 13, letterSpacing: "0.06em" }}>
              Clear Results
            </button>
          )}
          <button onClick={() => guardUnsavedEdit(handleSearch)}
            style={{ ...btnPrimary, padding: "10px 28px", fontSize: 13, letterSpacing: "0.06em" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--accent)")}>
            {searchState === "done" ? "Update results" : "Find Companies →"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <button onClick={() => guardUnsavedEdit(showAllCompanies)}
          style={{ ...btnSecondary, padding: "12px 32px", fontSize: 13, letterSpacing: "0.08em" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--white)")}>
          Show All Companies →
        </button>
        <button onClick={openAddCompany}
          style={{ ...btnPrimary, padding: "12px 28px", fontSize: 13, letterSpacing: "0.08em" }}>
          + Add Company
        </button>
      </div>

      {searchState === "loading" && <p style={{ color: "var(--text-slate)", fontSize: 13 }}>Fetching companies…</p>}

      {searchState === "done" && (
        <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ background: "var(--header)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>Results</p>
              <input type="text" value={nameQuery} onChange={e => setNameQuery(e.target.value)} placeholder="Search by company name…"
                style={{ width: 220, fontSize: 12, padding: "6px 10px", borderRadius: 4, border: "none", background: "var(--white)", color: "var(--navy)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {results.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--on-dark)", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Sort by</span>
                  <select value={sortKey} onChange={e => setSortKey(e.target.value)}
                    style={{ fontSize: 12, padding: "5px 8px", borderRadius: 4, border: "none", background: "var(--white)", color: "var(--navy)", cursor: "pointer" }}>
                    <option value="added">Added</option>
                    <option value="name">Company name</option>
                    <option value="geography">Geography</option>
                    <option value="product_category">Company category</option>
                    <option value="max_price">Max price</option>
                    <option value="priority_tier">Priority</option>
                    <option value="icp_fit">ICP fit</option>
                    <option value="status">Status</option>
                    <option value="source_name">Source</option>
                  </select>
                  <button type="button" onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} title="Toggle sort direction"
                    style={{ background: "transparent", color: "var(--on-dark)", border: "1px solid var(--border-on-dark)", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 4, whiteSpace: "nowrap" }}>
                    {sortDir === "asc" ? "▲ Asc" : "▼ Desc"}
                  </button>
                </div>
              )}
              <p style={{ color: "var(--white)", fontSize: 12 }}>
                {visibleResults.length} {visibleResults.length !== 1 ? "companies" : "company"}{hiddenIds.size > 0 ? ` · ${hiddenIds.size} hidden` : ""}{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
              </p>
              {selectedIds.size > 0 && (
                <>
                  <button type="button" onClick={() => setShowOnlySelected(v => !v)}
                    style={{ background: showOnlySelected ? "var(--white)" : "transparent", color: showOnlySelected ? "var(--header)" : "var(--on-dark)", border: "1px solid var(--border-on-dark)", padding: "5px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", borderRadius: 4 }}>
                    {showOnlySelected ? "Show all" : "View only selected"}
                  </button>
                  <button type="button" onClick={clearSelection}
                    style={{ background: "transparent", color: "var(--on-dark)", border: "1px solid var(--border-on-dark)", padding: "5px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", borderRadius: 4 }}>
                    Clear selection
                  </button>
                </>
              )}
              {hiddenIds.size > 0 && (
                <button type="button" onClick={restoreHidden}
                  style={{ background: "transparent", color: "var(--on-dark)", border: "1px solid var(--border-on-dark)", padding: "5px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", borderRadius: 4 }}>
                  Restore hidden
                </button>
              )}
              {results.length > 0 && (
                <button type="button" onClick={toggleEditMode}
                  style={{ background: editMode ? "var(--white)" : "transparent", color: editMode ? "var(--header)" : "var(--white)", border: editMode ? "none" : "1px solid var(--border-on-dark)", padding: "6px 18px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", borderRadius: 4 }}>
                  {editMode ? "Done editing" : "✎ Edit list"}
                </button>
              )}
            </div>
          </div>
          {results.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
              No companies match the selected filters.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "var(--surface-table-head)", borderBottom: "1px solid var(--border-card)" }}>
                  <th style={{ padding: "10px 8px 10px 14px", width: 1 }}>
                    <input type="checkbox" aria-label="Select all shown"
                      checked={visibleResults.length > 0 && visibleResults.every(c => selectedIds.has(c.id))}
                      onChange={e => {
                        const check = e.target.checked;
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (check) visibleResults.forEach(c => next.add(c.id));
                          else { visibleResults.forEach(c => next.delete(c.id)); if (next.size === 0) setShowOnlySelected(false); }
                          return next;
                        });
                      }}
                      style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
                  </th>
                  {["Company", "Website", "Source", "Geography", "Company category", "Max. Price", "Priority", "ICP Fit", "Added", "Status"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-slate)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleResults.map((c, i) => (
                  <Fragment key={c.id}>
                    <tr onClick={() => setExpandedCompanyId(expandedCompanyId === c.id ? null : c.id)}
                      style={{ borderBottom: expandedCompanyId === c.id ? "none" : "1px solid var(--border-light)", background: i % 2 === 0 ? "var(--white)" : "var(--surface-input)", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-row-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "var(--white)" : "var(--surface-input)")}>
                      <td style={{ padding: "12px 8px 12px 14px", width: 1 }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${c.name}`} checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelected(c.id)}
                          style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
                      </td>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: "var(--navy)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{expandedCompanyId === c.id ? "▾" : "▸"}</span>
                          {editMode && (
                            <span style={{ display: "flex", gap: 10 }}>
                              <button type="button" title="Edit"
                                onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                style={{ background: "transparent", border: "none", borderRadius: 4, color: "var(--ink)", cursor: "pointer", padding: "4px 6px", display: "inline-flex", alignItems: "center", lineHeight: 0 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                </svg>
                              </button>
                              <button type="button" title="Remove…"
                                onClick={(e) => { e.stopPropagation(); setConfirmRemoveId(confirmRemoveId === c.id ? null : c.id); setEditError(""); }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-danger-hover)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                style={{ background: "transparent", border: "none", borderRadius: 4, color: "var(--danger-text)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "4px 7px" }}>✕</button>
                            </span>
                          )}
                          {c.name}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", wordBreak: "break-word" }}>
                        {c.website_url ? (
                          <a href={safeHref(c.website_url)} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ color: "var(--accent)", fontSize: 12, textDecoration: "none" }}
                            onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                            onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}>
                            {displayHostname(c.website_url)}
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", color: "var(--text-body)", fontSize: 12 }}>
                        {c.source_name ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 14px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{parseMulti(c.geography).join(", ") || <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
                      <td style={{ padding: "12px 14px", color: "var(--text-body)" }}>{parseMulti(c.product_category).join(", ") || <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
                      <td style={{ padding: "12px 14px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{c.max_price != null ? `${c.price_currency === "GBP" ? "£" : c.price_currency === "USD" ? "$" : c.price_currency === "EUR" ? "€" : ""}${c.max_price.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {c.priority_tier === "early_mover" && (
                          <span style={{ background: "var(--badge-green-bg)", color: "var(--success)", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em" }}>Early Mover</span>
                        )}
                        {c.priority_tier === "follower" && (
                          <span style={{ background: "var(--badge-yellow-bg)", color: "var(--badge-yellow-text)", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em" }}>Follower</span>
                        )}
                        {c.priority_tier === "enabler" && (
                          <span style={{ background: "var(--badge-purple-bg)", color: "var(--badge-purple-text)", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.04em" }}>Enabler</span>
                        )}
                        {!c.priority_tier && <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 13, letterSpacing: 1, color: icpColor(c.icp_fit), whiteSpace: "nowrap" }}>{"★".repeat(c.icp_fit)}{"☆".repeat(5 - c.icp_fit)}</td>
                      <td style={{ padding: "12px 14px", color: "var(--text-body)", fontSize: 12.5, whiteSpace: "nowrap" }}>{fmtAddedDate(c)}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                        <select value={c.status ?? "not_contacted"} onChange={e => updateCompanyStatus(c.id, e.target.value)}
                          style={{ fontSize: 12, padding: "5px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--white)", cursor: "pointer", fontWeight: 600, color: (() => { const st = c.status ?? "not_contacted"; return st === "contacted" ? "var(--success-bright)" : st === "in_dialogue" ? "var(--warning-bright)" : st === "not_interested" ? "var(--danger)" : st === "not_relevant" ? "var(--text-faint)" : "var(--text)"; })() }}>
                          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                    </tr>
                    {expandedCompanyId === c.id && (
                      <tr style={{ borderBottom: "1px solid var(--border-light)", background: i % 2 === 0 ? "var(--white)" : "var(--surface-input)" }}>
                        <td colSpan={11} style={{ padding: "0 20px 20px 48px" }}>
                          {editingCompanyId === c.id && editDraft ? (
                            <div style={{ maxWidth: 900 }}>
                              <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16, marginBottom: 16 }}>
                                <div>
                                  <label style={labelStyle}>Geography</label>
                                  <MultiSelect options={GEO_OPTIONS} value={editDraft.geography} onChange={next => setEditDraft({ ...editDraft, geography: next })} placeholder="Select…" />
                                </div>
                                <div>
                                  <label style={labelStyle}>Company category</label>
                                  <MultiSelect options={categories} value={editDraft.product_category} onChange={next => setEditDraft({ ...editDraft, product_category: next })} placeholder="Select…" />
                                </div>
                                <div>
                                  <label style={labelStyle}>Max price</label>
                                  <input type="number" value={editDraft.max_price} onChange={e => setEditDraft({ ...editDraft, max_price: e.target.value })} style={inputStyle} />
                                </div>
                                <div>
                                  <label style={labelStyle}>Currency</label>
                                  <select value={editDraft.price_currency} onChange={e => setEditDraft({ ...editDraft, price_currency: e.target.value })} style={inputStyle}>
                                    <option value="">—</option>
                                    {["EUR", "GBP", "USD", "NOK", "SEK", "DKK", "CHF"].map(cur => <option key={cur}>{cur}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={labelStyle}>ICP fit</label>
                                  <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                                    {[1, 2, 3, 4, 5].map(star => (
                                      <button key={star} type="button" onClick={() => setEditDraft({ ...editDraft, icp_fit: star })}
                                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, lineHeight: 1, padding: "0 2px", color: star <= editDraft.icp_fit ? "var(--accent)" : "var(--border-grey)" }}>★</button>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <label style={labelStyle}>Priority tier</label>
                                  <select value={editDraft.priority_tier} onChange={e => setEditDraft({ ...editDraft, priority_tier: e.target.value })} style={inputStyle}>
                                    <option value="">—</option>
                                    <option value="early_mover">Early Mover</option>
                                    <option value="follower">Follower</option>
                                  </select>
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <label style={labelStyle}>Website</label>
                                  <input type="text" value={editDraft.website_url} onChange={e => setEditDraft({ ...editDraft, website_url: e.target.value })} style={inputStyle} />
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <label style={labelStyle}>Description</label>
                                  <textarea value={editDraft.description} onChange={e => setEditDraft({ ...editDraft, description: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                                </div>
                              </div>
                              {editError && <p style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{editError}</p>}
                              <div style={{ display: "flex", gap: 10 }}>
                                <button type="button" onClick={() => saveEdit(c)} disabled={savingEdit}
                                  style={{ ...btnPrimary, padding: "9px 22px", background: savingEdit ? "var(--accent-disabled)" : "var(--accent)", cursor: savingEdit ? "default" : "pointer" }}>
                                  {savingEdit ? "Saving…" : "Save"}
                                </button>
                                <button type="button" onClick={cancelEdit} disabled={savingEdit}
                                  style={{ ...btnSecondary, padding: "9px 22px" }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ maxWidth: 900 }}>
                              <p style={{ fontSize: 14, color: "var(--text-body)", lineHeight: 1.7, maxWidth: 860, marginBottom: 16 }}>
                                {c.description ?? <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>No description available.</span>}
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
      {searchState === "done" && results.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={() => { if (hasUnsavedEdit()) setPendingExport(true); else handleExportExcel(); }}
            disabled={exporting}
            style={{ ...btnSecondary, padding: "9px 20px", borderRadius: 4, opacity: exporting ? 0.6 : 1, cursor: exporting ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            {exporting ? "Exporting…" : "↓ Export as Excel"}
          </button>
        </div>
      )}

      {addOpen && (
        <AddCompanyModal
          form={addForm}
          setForm={setAddForm}
          categoryOptions={categories}
          saving={addSaving}
          error={addFormError}
          onSubmit={submitAddCompany}
          onClose={() => setAddOpen(false)}
        />
      )}

      {removeTarget && (
        <div
          onClick={closeRemove}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: confirmDelete ? "1px solid var(--border-danger)" : "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 660, width: "100%", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            {confirmDelete ? (
              <>
                <div style={{ background: "var(--danger)", padding: "14px 28px" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "var(--white)" }}>Delete {removeTarget.name} permanently?</p>
                </div>
                <div style={{ padding: "22px 28px" }}>
                  <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6, marginBottom: 20 }}>
                    Are you sure you want to delete this company from the database? This removes it from the system, and the only way to get it back is to add it again manually.
                  </p>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button type="button" onClick={() => removeCompany(removeTarget)} disabled={removing}
                      style={{ background: "var(--danger)", color: "var(--white)", border: "none", padding: "10px 22px", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", cursor: removing ? "default" : "pointer", borderRadius: 4 }}>
                      {removing ? "Deleting…" : "Yes, delete permanently"}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} disabled={removing}
                      style={{ background: "var(--surface)", color: "var(--text-slate)", border: "1px solid var(--border)", padding: "10px 22px", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", cursor: removing ? "default" : "pointer", borderRadius: 4 }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: "26px 28px" }}>
                <p style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>Remove {removeTarget.name}?</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Choose how you want to remove this company.</p>
                <div style={{ display: "flex", gap: 14 }}>
                  <button type="button" onClick={() => { hideFromView(removeTarget.id); closeRemove(); }} disabled={removing}
                    style={{ flex: 1, textAlign: "left", background: "var(--white)", color: "var(--navy)", border: "1px solid var(--border)", padding: "16px", cursor: removing ? "default" : "pointer" }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Remove from this view only</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>Hides it from the current list and the Excel export. Not deleted; use “Restore hidden” to bring it back.</span>
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(true)} disabled={removing}
                    style={{ flex: 1, textAlign: "left", background: "var(--white)", color: "var(--danger-text)", border: "1px solid var(--border-danger)", padding: "16px", cursor: removing ? "default" : "pointer" }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Delete from the company database</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--danger-muted)", lineHeight: 1.5 }}>Removes it from the database. Kept internally as rejected, so it won’t be re-discovered.</span>
                  </button>
                </div>
                <div style={{ marginTop: 20 }}>
                  <button type="button" onClick={closeRemove} disabled={removing}
                    style={{ background: "var(--surface)", color: "var(--text-slate)", border: "1px solid var(--border)", padding: "9px 22px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: removing ? "default" : "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unsaved-edit guard — shown only when a row edit has actually been changed */}
      {pendingNav && (
        <div onClick={() => setPendingNav(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 460, width: "100%", padding: "24px 26px", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>You have unsaved changes</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Discard your edits to this company and continue?</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => { const go = pendingNav; cancelEdit(); setPendingNav(null); if (go) go(); }}
                style={{ ...btnSecondary, color: "var(--danger-text)", border: "1px solid var(--border-danger)" }}>
                Discard changes
              </button>
              <button type="button" onClick={() => setPendingNav(null)} style={{ ...btnPrimary }}>
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export guard — unsaved edits aren't in the saved data the export reads */}
      {pendingExport && (
        <div onClick={() => setPendingExport(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 460, width: "100%", padding: "24px 26px", boxShadow: "0 12px 40px rgba(12,28,46,0.25)" }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>You have unsaved changes</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Your unsaved edits won’t be included in the Excel export. Export anyway?</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => { setPendingExport(false); handleExportExcel(); }}
                style={{ ...btnSecondary }}>
                Export anyway
              </button>
              <button type="button" onClick={() => setPendingExport(false)} style={{ ...btnPrimary }}>
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
