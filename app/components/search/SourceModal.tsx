import { labelStyle, inputStyle, reqStyle, optStyle, hintStyle, btnPrimary, btnSecondary } from "@/lib/styles";
import type { SourceFields } from "@/lib/uiTypes";

// Add / edit one source (writes into the draft; nothing is saved until "Save changes" in the panel).
export function SourceModal({ source, setSource, editing, infoOpen, setInfoOpen, error, busy, onApply, onClose }: {
  source: SourceFields;
  setSource: (s: SourceFields) => void;
  editing: boolean;
  infoOpen: boolean;
  setInfoOpen: (v: boolean) => void;
  error: string;
  busy: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div onClick={() => { if (!busy) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(12,28,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 520, width: "100%", padding: "26px 28px", boxShadow: "0 12px 40px rgba(12,28,46,0.25)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>{editing ? "Edit source" : "Add a source"}</p>
          <button type="button" title="What do these fields mean?" aria-label="Help" onClick={() => setInfoOpen(!infoOpen)}
            style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", border: "1px solid var(--border)", background: infoOpen ? "var(--accent)" : "var(--white)", color: infoOpen ? "var(--white)" : "var(--text-muted)", fontSize: 13, fontWeight: 700, fontStyle: "italic", cursor: "pointer", lineHeight: 1, fontFamily: "Georgia, serif" }}>i</button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Applied to the draft — nothing is saved until you press <strong>Save changes</strong> in the panel. <span style={reqStyle}>*</span>
          <span style={{ marginLeft: 4 }}>marks a required field.</span>
        </p>
        {infoOpen && (
          <div style={{ background: "var(--banner-info-bg)", border: "1px solid var(--banner-info-border)", borderRadius: 4, padding: "12px 14px", marginBottom: 18, fontSize: 12.5, color: "var(--banner-info-text)", lineHeight: 1.6 }}>
            <p style={{ marginBottom: 8 }}><strong>Which type should I choose?</strong></p>
            <p style={{ marginBottom: 8 }}><strong>Website</strong> — the AI runs a web search across the whole site, once per search term, looking for companies mentioned anywhere on it. Choose this for an ongoing publication that keeps posting new articles (e.g. a trade-news site). It needs a <strong>search prefix</strong> — usually the domain (like <em>nutraingredients.com</em>) — which is put in front of each term to keep the search on that site.</p>
            <p style={{ marginBottom: 8 }}><strong>Single page</strong> — the AI reads one specific URL, once, and pulls the companies from it. Choose this when you want it to go through a single fixed page, e.g. a <em>“Top 10 supplement brands for 2026”</em> list. Best for a fixed list — re-running finds nothing new after the first read.</p>
            <p style={{ margin: 0 }}><strong>Note to the AI</strong> is a free-text instruction for this source — e.g. a paywall tip or a region to focus on.</p>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Name <span style={reqStyle}>*</span></label>
            <input type="text" autoFocus value={source.name} onChange={e => setSource({ ...source, name: e.target.value })}
              placeholder="e.g. Nutrition Insight" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Type <span style={reqStyle}>*</span></label>
            <select value={source.type} onChange={e => setSource({ ...source, type: e.target.value as "web site" | "web page" | "youtube" })} style={inputStyle}>
              <option value="web site">Website</option>
              <option value="web page">Single page</option>
              <option value="youtube">YouTube search</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Market <span style={optStyle}>optional</span></label>
            <select value={source.market} onChange={e => setSource({ ...source, market: e.target.value })} style={inputStyle}>
              <option value="">Unspecified</option>
              <option value="EU">EU</option>
              <option value="US">US</option>
              <option value="Global">Global</option>
            </select>
            <p style={hintStyle}>Which market this source leans toward — shown as a tag in the list.</p>
          </div>
          {source.type === "web site" ? (
            <>
              <div>
                <label style={labelStyle}>Search prefix <span style={reqStyle}>*</span></label>
                <input type="text" value={source.search_prefix} onChange={e => setSource({ ...source, search_prefix: e.target.value })}
                  placeholder="e.g. nutraingredients.com Europe" style={inputStyle} />
                <p style={hintStyle}>A fixed text added in front of <em>every</em> search term to aim the search at this specific source. Unlike the search terms (which change from search to search), this stays the same each time the source is used — the query becomes <em>“&lt;prefix&gt; &lt;term&gt;”</em>. Usually the site&apos;s domain, optionally with a region, e.g. <em>nutraingredients.com Europe</em>.</p>
              </div>
              <div>
                <label style={labelStyle}>Homepage URL <span style={optStyle}>optional</span></label>
                <input type="text" value={source.url} onChange={e => setSource({ ...source, url: e.target.value })}
                  placeholder="https://www.nutraingredients.com" style={inputStyle} />
              </div>
            </>
          ) : source.type === "youtube" ? (
            <div>
              <label style={labelStyle}>Query bias <span style={optStyle}>optional</span></label>
              <input type="text" value={source.search_prefix} onChange={e => setSource({ ...source, search_prefix: e.target.value })}
                placeholder="e.g. supplement review" style={inputStyle} />
              <p style={hintStyle}>Optional words added in front of each term when searching YouTube, e.g. <em>supplement review longevity</em>. Leave blank to search the term alone. (Requires the server’s YouTube API key.)</p>
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Page URL <span style={reqStyle}>*</span></label>
              <input type="text" value={source.url} onChange={e => setSource({ ...source, url: e.target.value })}
                placeholder="https://www.healthline.com/nutrition/best-vitamin-brands" style={inputStyle} />
              <p style={hintStyle}>The exact page to read. Fetched once — best for a fixed list of brands.</p>
            </div>
          )}
          <div>
            <label style={labelStyle}>Note to the AI <span style={optStyle}>optional</span></label>
            <textarea value={source.note} onChange={e => setSource({ ...source, note: e.target.value })} rows={3}
              placeholder={'e.g. This site defaults to its US edition — always keep "Europe" in the query so results aren\'t US-only.'}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
            <p style={hintStyle}>Passed to the AI as an instruction for this source (paywall tips, region focus, etc.).</p>
          </div>
          <div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={source.featured} onChange={e => setSource({ ...source, featured: e.target.checked })}
                style={{ accentColor: "var(--accent)", width: 16, height: 16, marginTop: 2, flexShrink: 0 }} />
              <span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>Recommended high quality source</span>
                <span style={{ ...hintStyle, marginTop: 2 }}>Shown in the short default list in the search tab. Leave off to keep it in the full list behind “Show all sources”.</span>
              </span>
            </label>
          </div>
        </div>
        {error && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 14 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button type="button" onClick={onApply} disabled={!source.name.trim()}
            style={{ ...btnPrimary, opacity: !source.name.trim() ? 0.6 : 1 }}>
            {editing ? "Update source" : "Add source"}
          </button>
          <button type="button" onClick={onClose} style={{ ...btnSecondary }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
