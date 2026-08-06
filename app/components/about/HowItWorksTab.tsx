import { useState } from "react";
import { US_MARKET_ENABLED } from "@/lib/features";

// In-app help guide (left-hand section menu + plain-English content). Self-contained: its only state
// is which section is open.
export function HowItWorksTab() {
  const [aboutSection, setAboutSection] = useState("overview");
  const ps: React.CSSProperties = { marginBottom: 12 };
  const uls: React.CSSProperties = { margin: "0 0 12px", paddingLeft: 20 };
  const lis: React.CSSProperties = { marginBottom: 6 };
  const muted: React.CSSProperties = { marginBottom: 12, color: "var(--text-muted)", fontSize: 13 };
  const SECTIONS: { key: string; label: string; content: React.ReactNode }[] = [
    { key: "overview", label: "Overview", content: (
      <>
        <p style={ps}>Customer Finder helps you build a list of potential B2B customers for Lysoveta. It searches trade media, industry sites and other sources for supplement companies, researches each one, scores it against Lysoveta&apos;s Ideal Customer Profile (ICP), and lets you review and save the best matches.</p>
        <p style={ps}>There are four tabs:</p>
        <ul style={uls}>
          <li style={lis}><strong>Company Database</strong> — the companies you&apos;ve saved.</li>
          <li style={lis}><strong>Find New Companies</strong> — run a search for new prospects.</li>
          <li style={lis}><strong>Lysoveta ICP Criteria</strong> — the profile companies are scored against.</li>
          <li style={lis}><strong>How It Works</strong> — this guide.</li>
        </ul>
      </>
    ) },
    { key: "database", label: "Company Database", content: (
      <>
        <p style={ps}>Your saved companies live here. Use the filters at the top (geography, product category, <strong>source</strong>, price range, ICP fit, priority tier), then <strong>Find Companies</strong> to apply them — or <strong>Show All Companies</strong>. Geography, product category and priority tier are <strong>multi-select</strong> — tick as many as you like (empty means &quot;all&quot;). Click a row to expand its description. Each row shows the <strong>date added</strong> and an editable <strong>Status</strong> (Not contacted / Contacted / In dialogue / Not relevant) for tracking outreach — it saves the moment you change it.</p>
        <ul style={uls}>
          <li style={lis}><strong>+ Add Company</strong> — manually add a company (name required, plus website, geography, product category, price, tier, ICP fit, and notes) without running a search; geography and product category let you pick several. Saved straight to the database.</li>
          <li style={lis}><strong>Select rows</strong> — tick companies (or the header box for all shown), then <strong>View only selected</strong> to show just those (<strong>Show all</strong> brings the rest back; ticks stay). Since the export takes what&apos;s shown, this is how to export just your picks. <strong>Clear selection</strong> unticks everything.</li>
          <li style={lis}><strong>Export as Excel</strong> — downloads the companies currently shown (respects your filters, hidden rows, and any &quot;view only selected&quot;).</li>
          <li style={lis}><strong>Clear Results</strong> — empties the shown table; doesn&apos;t delete anything.</li>
          <li style={lis}><strong>Edit list</strong> — turns on edit mode. Each row gets a pencil (edit its fields) and an ✕ (choose <em>Remove from this view only</em> — hidden and restorable — or <em>Delete from the company database</em>).</li>
          <li style={lis}><strong>Restore hidden</strong> — brings back rows you hid.</li>
        </ul>
      </>
    ) },
    { key: "finding", label: "Finding new companies", content: (
      <>
        <p style={ps}>On <strong>Find New Companies</strong>, pick up to 3 search terms and up to 4 sources (or leave them unticked to use the defaults), then click <strong>Search for New Companies</strong>. A search takes about <strong>15 minutes</strong> and stops automatically after 30. While it runs you&apos;ll see “Step X of 3”, a timer, and an expandable <strong>Search Log</strong> that mirrors exactly what the app is doing.</p>
        <p style={{ fontWeight: 700, color: "var(--navy)", margin: "16px 0 6px" }}>What happens behind the scenes — three steps</p>
        <ul style={uls}>
          <li style={lis}><strong>1. Discovery</strong> — the AI runs web searches (and reads any single-page or YouTube sources you picked) using your terms, and extracts supplement company/brand names it hasn&apos;t seen before. Anything already in your database, rejected, or already waiting is filtered out. New names go into the waiting list.</li>
          <li style={lis}><strong>2. Research</strong> — for the next few waiting companies (5 at a time), the AI does its own web searches to gather details: their website, what they sell, whether they do omega-3/krill, how they describe themselves, price level, which European markets, and sales channels. Each company is saved the moment its research finishes, so nothing is lost partway.</li>
          <li style={lis}><strong>3. Scoring (ICP)</strong> — the AI reads everything gathered for the batch and scores each company against the Lysoveta ICP, giving a fit score, a priority tier (Early Mover / Follower / Enabler), and a short reason. Only companies that pass are shown for you to review and save.</li>
        </ul>
        <p style={ps}>Discovery only runs when the waiting list is below 5 — otherwise a run just researches what&apos;s already waiting (see <em>The waiting list</em>).</p>
        <p style={ps}>When it finishes, tick the companies you want and click <strong>Add to Database</strong>. That opens a <strong>Fill in Details</strong> step where you can review and adjust each company&apos;s fields before saving — and if one turns out not to fit on a closer look, its <strong>Remove ✕</strong> drops it. Then save the rest. (After a search, your term/source ticks reset for a clean next run.)</p>
        <p style={muted}>The first search after a quiet period can take ~30 seconds to start (the server “wakes up” after being idle). That&apos;s normal.</p>
      </>
    ) },
    { key: "config", label: "Search terms & sources", content: (
      <>
        <p style={ps}>Click <strong>Edit</strong> in the Search Configuration panel to add, change, or remove search terms and sources. Nothing is saved until you press <strong>Save changes</strong> (Cancel discards the draft).</p>
        <p style={ps}>There are three source types:</p>
        <ul style={uls}>
          <li style={lis}><strong>Website</strong> — a whole site, searched repeatedly (e.g. a trade-news site).</li>
          <li style={lis}><strong>Single page</strong> — one specific URL, read once (e.g. a “best supplements” list).</li>
          <li style={lis}><strong>YouTube</strong> — searches YouTube for your terms and pulls brand names from the videos.</li>
        </ul>
        <p style={ps}>Each source type has its own column. By default a column shows only the sources marked <strong>&quot;Recommended, high quality&quot;</strong> (in a shaded box), with a <strong>&quot;Show all …&quot;</strong> link to reveal the rest — so the list stays short. Tick <strong>&quot;Recommended, high quality source&quot;</strong> when editing a source to add it to that shortlist. Each source also shows a <strong>&quot;last used&quot;</strong> date.</p>
        <p style={ps}>A <strong>single page</strong> is read once, so after a search it moves into a <strong>&quot;Completed single pages&quot;</strong> list (bottom-right) and out of the selectable list — you can&apos;t waste a search on it. If you think a page has since been updated, open that list and click <strong>Add back to source list</strong>.</p>
        <p style={ps}>You can pick up to 3 terms and 4 sources per search. The limit isn&apos;t arbitrary: a search runs <em>terms × website-sources</em> web searches with a budget of 12, and 3 × 4 = 12 fills it exactly — picking more can&apos;t all run.</p>
        <p style={{ fontWeight: 700, color: "var(--navy)", margin: "16px 0 6px" }}>How well is each source doing?</p>
        <p style={ps}>Under every source you&apos;ll see a small line — for example <strong>“used 5 · queued 12 · saved 2”</strong> — so you can tell which sources actually pull their weight:</p>
        <ul style={uls}>
          <li style={lis}><strong>used</strong> — how many searches this source has taken part in.</li>
          <li style={lis}><strong>queued</strong> — how many new companies it has added to the waiting list over time.</li>
          <li style={lis}><strong>saved</strong> — how many of its companies ended up approved in your database.</li>
        </ul>
        <p style={muted}>These numbers start from zero and build up as you search — a brand-new source shows “Not used yet”, and used ones also show the date they were last used. Companies saved before this feature existed don&apos;t count toward <em>saved</em>.</p>
        <p style={{ fontWeight: 700, color: "var(--navy)", margin: "16px 0 6px" }}>Low-performing sources get a warning</p>
        <p style={ps}>Click <strong>Source performance</strong> (top of the Search Configuration panel) to open a table of every source with its <strong>hit rate</strong> — how many companies it finds per search (companies found ÷ times used). A source whose hit rate drops below a threshold (default <strong>1%</strong>), once it&apos;s been used a few times, is flagged with a <strong style={{ color: "var(--danger-text)" }}>⚠ Low hit rate</strong> warning — both in that table and under the source in the main list — suggesting you edit or remove it.</p>
        <p style={muted}>You can change the threshold (and how many uses a source needs before it can be flagged) right in that window — it&apos;s a shared setting, so it affects the warnings everyone sees.</p>
      </>
    ) },
    { key: "queue", label: "The waiting list", content: (
      <>
        <p style={ps}>Companies are researched in small batches — <strong>5 at a time</strong> — because researching each one is the slow, costly step. Newly found companies wait in a list until they&apos;re researched.</p>
        <p style={ps}>A search first works through this waiting list. It only looks for <em>new</em> companies (using your selected sources and terms) once the list drops <strong>below 5</strong>. If you click Search while the list is longer, a pop-up lets you either research the waiting list, or <strong>clear it and search your selections</strong> right away.</p>
      </>
    ) },
    { key: "scoring", label: "How scoring works (ICP)", content: (
      <>
        <p style={ps}>After a company is researched, the AI scores it against the <strong>Lysoveta ICP Criteria</strong> (see that tab). It assigns an ICP fit score and a priority tier (Early Mover, Follower, or Enabler).</p>
        {US_MARKET_ENABLED && <p style={ps}>There are separate profiles for <strong>Europe</strong> and the <strong>US</strong> (both on the ICP Criteria tab). Each company is scored against the profile that matches its primary market.</p>}
        <p style={ps}>Only companies that <strong>pass</strong> the ICP are shown for you to save. The rest are set aside — kept internally so they aren&apos;t re-discovered in future searches.</p>
        <p style={ps}>The ICP itself is <strong>editable</strong> — on the <strong>Lysoveta ICP Criteria</strong> tab, click <strong>✎ Edit Criteria</strong> to adjust the text for either market. Nothing saves automatically: you press <strong>Review changes with AI</strong>, which checks your text reads as clear scoring instructions and flags any gaps (advice only), then you press <strong>Save changes</strong> to make it live. Changes are shared, take effect on the next search, and every save is kept in <strong>Version history</strong> so you can roll back.</p>
        <p style={ps}>Next to the ICP is a <strong>Product categories</strong> card — the one place to manage the list of categories a company can be tagged with (used in the Company Database and suggested by the AI after a search). Click <strong>✎ Manage</strong> to add, rename, or remove them. The priority tiers (Early Mover / Follower / Enabler) are fixed and not edited here.</p>
      </>
    ) },
    { key: "exceptions", label: "When something goes wrong", content: (
      <>
        <p style={ps}>The app is built to fail safely. Here&apos;s what the different situations and messages mean:</p>
        <ul style={uls}>
          <li style={lis}><strong>“No new companies found”</strong> — everything found was already in your database, rejected, or waiting. The sources may not have published anything new, or the terms keep hitting the same companies. Try again later, or adjust/add sources and terms.</li>
          <li style={lis}><strong>“A previous search didn&apos;t finish”</strong> — if a company got stuck while being researched, the app stops the run and puts those companies back in the waiting list so nothing is lost. You can remove one that keeps hanging, or just search again to retry them.</li>
          <li style={lis}><strong>A source can&apos;t be read</strong> — some pages block automated reading (paywalls, robots rules) or are JavaScript-only (e.g. many trade-show exhibitor lists). Those are simply skipped, and the run continues with the others.</li>
          <li style={lis}><strong>A fixed list adds nothing new</strong> — single-page “best of” sources give the same names each time, so after the first read they stop producing new companies. That&apos;s expected: the app moves them into a <strong>“Completed single pages”</strong> list automatically, and you can <strong>Add back to source list</strong> if a page has been updated.</li>
          <li style={lis}><strong>The 30-minute limit</strong> — if a run ever stalls, it&apos;s stopped automatically after 30 minutes so it can never hang forever. Anything already researched and saved is kept.</li>
          <li style={lis}><strong>You closed or reloaded the page</strong> — research is saved company-by-company as it completes, so finished work is never lost; those companies are reused (for free) on the next search.</li>
          <li style={lis}><strong>An error screen</strong> — if something fails (e.g. a service or configuration problem), you get a message explaining what you can do, usually with a <em>Try again</em> button.</li>
        </ul>
      </>
    ) },
    { key: "login", label: "Signing in", content: (
      <>
        <p style={ps}>The first time you open the app you&apos;ll be asked to <strong>log in</strong> or <strong>create an account</strong> with an email and a password you choose. After that you stay signed in on that device for about <strong>two weeks</strong>, then you&apos;ll be asked to log in again. There&apos;s a <strong>Log out</strong> button at the top-right.</p>
        <p style={{ ...ps, padding: "10px 14px", background: "var(--warn-bg, #fff8e6)", borderRadius: 4, border: "1px solid var(--border-card)" }}>
          <strong>This is a simple pilot log-in, not real security.</strong> Please <strong>don&apos;t reuse a password</strong> you use elsewhere — pick something throwaway like <em>Lysoveta123</em>. Proper security is handled by IT after handover.
        </p>
      </>
    ) },
    { key: "tips", label: "Tips & good to know", content: (
      <>
        <ul style={uls}>
          <li style={lis}>Best viewed on a <strong>laptop or desktop</strong> — the layout isn&apos;t designed for mobile.</li>
          <li style={lis}>The log-in is a <strong>simple pilot gate</strong>, not real security (see <em>Signing in</em>) — please don&apos;t share the link more widely than intended.</li>
          <li style={lis}>Your actions are <strong>live</strong>: saving or removing companies changes the real database.</li>
        </ul>
      </>
    ) },
  ];
  const active = SECTIONS.find(s => s.key === aboutSection) ?? SECTIONS[0];
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", maxWidth: 1000, width: "100%", margin: "0 auto" }}>
      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {SECTIONS.map(s => (
          <button key={s.key} type="button" onClick={() => setAboutSection(s.key)}
            style={{ textAlign: "left", padding: "10px 14px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: active.key === s.key ? "var(--accent)" : "transparent",
              color: active.key === s.key ? "var(--white)" : "var(--text-slate)" }}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ background: "var(--header)", padding: "12px 20px" }}>
          <p style={{ color: "var(--white)", fontSize: 15, fontWeight: 700 }}>{active.label}</p>
        </div>
        <div style={{ padding: "24px 28px", fontSize: 14, color: "var(--text)", lineHeight: 1.7 }}>
          {active.content}
        </div>
      </div>
    </div>
  );
}
