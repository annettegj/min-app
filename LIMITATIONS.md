# Limitations

A complete, plain-language catalogue of what the Lysoveta Customer Finder **can't do, does only
partially, or where you might get surprised** — across the whole app, feature by feature, small and
large. It includes limits that have no fix and aren't tied to any particular decision; the point is a
full, honest picture.

This complements two other documents: [DECISIONS.md](DECISIONS.md) explains *why* we built things the
way we did, and [HANDOVER.md §11](HANDOVER.md) tracks the live to-do list. This file is just: *here is
everything to be aware of.*

**How to read each table:**
- **Limitation** — what the constraint is.
- **When it matters** — when or for whom it shows up.
- **Workaround** — is there a way around it today?
- **Fix outlook** — `Inherent` (can't really be fixed), `By design`, `Possible later`,
  `Planned` (on the roadmap), or `Config` (a setting/threshold can change it).

> **The single most important one:** a search is powered by AI reading the public web. It is a strong
> assistant, **not an exhaustive or guaranteed-correct database.** It can miss companies, occasionally
> mis-read a name, or get a detail wrong. Always treat results as a well-researched starting point to
> review, not a final truth.

_Last compiled: 2026-08-06._

---

## 1. Login & access

| Limitation | When it matters | Workaround | Fix outlook |
|---|---|---|---|
| The login is not real security (see [DECISIONS §11](DECISIONS.md)) | Anyone with the link could reach the data directly | Treat the live link as semi-private | Planned (handover to IT) |
| Anyone can create their own account from the login screen | No approval/invite step | Don't share the link widely | Possible later |
| You're logged out automatically after 2 weeks | You'll need to log in again periodically | Just log back in | By design |
| No "forgot password" / password reset | If someone forgets their password | Create a new account | Possible later |
| No roles — everyone can edit everything (companies, sources, the ICP) | A pilot user could change shared settings for all | Agree internally who edits what | Possible later |
| No record of who changed what (no audit log) | Can't trace an edit back to a person | — | Possible later |
| Login is per-browser | Logging in on your laptop doesn't carry to your phone; clearing browser data logs you out | Log in on each device | By design |

---

## 2. Company Database

| Limitation | When it matters | Workaround | Fix outlook |
|---|---|---|---|
| No free-text search by company name | You can't quickly jump to one named company | Use the filters (geography, category, source, tier, price, ICP) | Possible later |
| No sorting (by score, price, date…) | Rows show in the database's own order | Use filters to narrow instead | Possible later |
| Filtering happens in your browser over all loaded companies | If the database grew very large, the page could get slow | Fine at pilot volumes | Possible later (paging) |
| Excel export covers only the **currently shown** list | Export after filtering ≠ the whole database | Clear filters / "Show all" first, then export | By design |
| Excel export runs in the browser | A very large export could be slow | — | Inherent (minor) |
| Edits and deletes are one company at a time (no bulk actions) | Cleaning up many rows is tedious | — | Possible later |
| "Remove from this view only" comes back on reload | It's a temporary hide, not a delete | Use "delete from database" to remove for good | By design |
| No screen to review or restore **rejected** companies | A wrongly-rejected company is hard to get back | Re-add manually via "+ Add Company" | Planned |
| Outreach **Status** has no history or dates | You can't see when status changed or its past values | — | Possible later |
| Max price is a single number + currency, not converted between currencies | Prices in £/€/$ aren't directly comparable in the table | Read the currency column | By design |
| Row selection (checkboxes) is lost on reload | A refresh clears your selection | Re-select | By design |
| The ICP fit score shown is whatever was set (AI or by hand) — no "re-score" button here | An old score won't reflect a newer ICP | Run a new search to re-score | Possible later |
| A company added manually isn't de-duplicated except by exact name | The same company under a slightly different name becomes a duplicate | Check before adding | Possible later |
| Manual "+ Add Company" only requires a name (website format etc. not validated) | Typos can slip in | Fill fields carefully | Possible later |

---

## 3. Find New Companies (setup, run & results)

| Limitation | When it matters | Workaround | Fix outlook |
|---|---|---|---|
| Up to 3 terms × 4 sources per run | You can't search everything at once | Rotate the pool across runs | By design ([DECISIONS §2.5](DECISIONS.md)) |
| New sources/terms are ignored while 5+ companies are waiting | Your new picks won't run that time | Use the pop-up's "clear the waiting list" | By design ([DECISIONS §2.3](DECISIONS.md)) |
| A running search can't really be paused | "Cancel" resets your view; the background job keeps going | Let it finish, or clear the queue after | Inherent (background job) |
| Refreshing the page during a search loses the live progress/results view | You won't see that run's selectable results screen | The work is still saved — search again (fast, cached) to see & score them | Possible later (rejoin by job) |
| Only companies that **pass** scoring appear in results | Borderline/low-scored companies are auto-hidden | Loosen the ICP if too strict | By design |
| The results don't show **why** a company was rejected | Hard to learn from exclusions | Check the live log for hints | Possible later |
| ~10 new companies per run | Slow to build a big list | Run repeatedly, rotate sources | By design |
| Two people searching at the same time isn't safe | Counters/queue assume one search at a time | Coordinate so only one runs at a time | Inherent (pilot) |
| Live search is disabled in the hosted/offline demo mode | The button reads "Search Disabled" there | Run where the worker is on | Config |
| Target market is locked to Europe | US companies aren't specifically targeted | — | Planned (US expansion) |

---

## 4. The search engine under the hood (inherent AI / web limits)

These come from *how* AI-plus-web-search works. Most have **no fix** — they're the nature of the tool.

| Limitation | When it matters | Workaround | Fix outlook |
|---|---|---|---|
| The AI can miss companies or occasionally mis-read/mis-classify one | Every run — results aren't exhaustive or 100% accurate | Review results; run again with different terms/sources | Inherent |
| Web search only finds Google-indexed **text** | App-based or JavaScript-heavy sources (e.g. TikTok Shop) return little or nothing | Prefer text-based trade media / static pages | Inherent |
| Reading a single page can't run JavaScript and respects "no-robots" rules | Paywalled / bot-blocked / JS-rendered pages fail or return partial | Use pages that are static and open | Inherent |
| Paywalled sources expose only titles/snippets | Company names may be partial | Note it on the source; the AI extracts from snippets | Inherent |
| Researched details (price, markets, channels) are the AI's best guess from public info | They can be outdated, incomplete, or wrong — prices especially are often not found | Verify key facts before acting | Inherent |
| Search time is highly variable (a few minutes to 15+), run to run | You can't predict exactly how long | Leave it running; the screen updates itself | Inherent |
| Same company under two very different names could count as two; two firms sharing a short name could merge | Rare edge cases in de-duplication | Spot-check odd entries | Inherent (minor) |
| Scoring is only as good as the ICP text, and is slightly probabilistic | The same company might score a little differently between runs | Keep the ICP clear; treat scores as guidance | Inherent |
| A malformed AI response can make a step quietly return nothing | Rare; mitigated by tuned limits | Search again | Inherent (mitigated) |
| Depends on outside services (Anthropic, Google/YouTube, the source sites) | An outage anywhere breaks that run | Try again later | Inherent |
| Hard 30-minute cut-off | A very large run can be truncated | Anything done so far is saved | By design (safety) |
| Cost ~$3–5 per run, rising with companies found | Frequent searching adds up | Search deliberately, not constantly | Inherent |
| YouTube results are noisy, US/English-leaning, and need a server API key with a daily quota | If you rely on YouTube | Treat as a bonus source | Inherent |

---

## 5. The ICP tab (criteria, review, testing, categories)

| Limitation | When it matters | Workaround | Fix outlook |
|---|---|---|---|
| The AI review checks **clarity, not business correctness** | It won't tell you if your criteria are strategically wrong | Human judgment owns the strategy | By design ([DECISIONS §5.2](DECISIONS.md)) |
| The ICP is shared — saving affects everyone's future searches immediately | No personal drafts or staged rollout | Version history lets you revert | By design |
| Version history can revert, but has no side-by-side "compare any two versions" | Reviewing what changed between old versions is manual | Read versions individually | Possible later |
| "Apply fix" wording is AI-generated | It may propose imperfect phrasing | You review the diff before it's used; edit freely | Inherent |
| The US ICP is a placeholder / disabled | US scoring isn't active | — | Planned |
| "Test on example companies" only checks your small example set | It's a spot check, not full validation | Keep a good spread of examples | By design |
| Renaming/removing a product category doesn't relabel existing companies | Old companies keep the old tag text | Re-tag manually if needed | By design ([DECISIONS §5.5](DECISIONS.md)) |
| No "merge two categories" tool | Cleaning up the category list is manual | Rename/remove by hand | Possible later |
| Priority tiers (Early Mover/Follower/Enabler) can't be edited in the app | Changing them needs a developer | — | By design |
| A contradictory or vague ICP quietly weakens scoring | Only the advisory review guards this | Keep the ICP clear and consistent | Inherent |

---

## 6. Sources & performance

| Limitation | When it matters | Workaround | Fix outlook |
|---|---|---|---|
| "Recommended" sources are chosen by hand, not by performance | Early on, the curated list is a judgment call | Adjust flags as you learn | Possible later (auto-assist) |
| Performance counts/dates only build up from when tracking started | Older activity isn't reflected | — | Inherent (source dates were backfilled once) |
| "Saved" count ignores companies saved before source-tracking existed | Under-counts for old sources | — | Inherent |
| A new source isn't tested when you add it — you learn if it works only after a run | A dead/JS-heavy source silently finds nothing | Check results/log; see [SOURCES.md](SOURCES.md) | Possible later (test-a-source) |
| Single pages are one-shot | A page updated later won't re-run automatically | Use "Add back to source list" | By design ([DECISIONS §3.2](DECISIONS.md)) |
| Source stats assume one search at a time | Simultaneous searches can miscount | Coordinate searches | Inherent (pilot) |
| The low-hit-rate warning is rough while data is thin | Early flags may be premature | Adjust the thresholds | Config |

---

## 7. Data & storage

| Limitation | When it matters | Workaround | Fix outlook |
|---|---|---|---|
| Multiple geographies/categories are stored as plain comma text, not a proper structure | Heavy reporting/queries would be awkward | Fine for in-app use | Possible later ([DECISIONS §6.1](DECISIONS.md)) |
| A value that itself contains a comma would be split wrongly | Only if an odd custom value is entered | Avoid commas inside a single value | Inherent (edge case) |
| Renaming a source or category doesn't propagate to existing companies | Historical rows keep the old text | Re-tag manually | By design |
| Deletions are "soft" (hidden), with no trash/restore screen | Recovering something is manual | Re-add manually | Planned |
| No built-in backup/restore beyond the database platform's own | Disaster recovery relies on Supabase | Use Supabase backups | Possible later |

---

## 8. Performance, cost & operations

| Limitation | When it matters | Workaround | Fix outlook |
|---|---|---|---|
| A search is slow (~15 min) and costs ~$3–5 | Not suited to high-frequency or casual use | Search deliberately | Inherent |
| One shared database for testing and live — no "practice" copy | A local test writes to the same data stakeholders see | Test carefully before pushing | Possible later (staging DB) |
| If the worker is on a plan that sleeps when idle, the first search after a quiet spell is extra slow | After periods of no use | Wait it out, or keep it warm | Config (hosting plan) |
| No monitoring/alerting — failures show only in the log/console | You find problems by looking | Watch the live log | Possible later |
| No automated tests — changes are checked by build + manual testing | Regressions rely on careful testing | The test-before-push habit | Possible later |
| Editing server code locally needs a manual server restart | Developer-only quirk | Restart `next dev` | Inherent (dev only) |

---

## 9. Security & privacy

| Limitation | When it matters | Workaround | Fix outlook |
|---|---|---|---|
| No real authentication; the database is open to the app's public key | Anyone with the link/key could read or change data | Keep the link semi-private | Planned (top handover item) |
| The worker's search API can be called directly by anyone who knows the URL | In principle, outside the login gate | Restrict at handover | Planned |
| Data lives on third-party clouds (Supabase, Render, Vercel, Anthropic) | Data-residency isn't formally addressed | — | Possible later (handover) |
| No formal GDPR/consent handling | Data is B2B company info (not personal data), but worth confirming at handover | — | Possible later |

*(The Anthropic AI key is correctly kept server-side only — that part is fine.)*

---

## 10. Browser, device & other quirks

| Limitation | When it matters | Workaround | Fix outlook |
|---|---|---|---|
| Built for desktop; not optimised for mobile | Dense tables and side-by-side columns are cramped on a phone | Use a laptop/desktop | Possible later |
| The interface is English only | For non-English users | — | Possible later |
| Keyboard/screen-reader accessibility is basic | For users relying on assistive tech | — | Possible later |
| No offline support | Needs a live connection | — | Inherent |
| The live search log is plain text and can get long | During a long run | Collapse it (it closes itself after saving) | By design |
| No print-friendly layout | Printing a page directly | Use the Excel export instead | Possible later |
| Assumes a modern, up-to-date browser | Very old browsers may misbehave | Use a current browser | Inherent |

---

## In one sentence

Most limitations fall into three buckets: **inherent** (how AI + web search works — accept and
review), **pilot shortcuts** (security, one shared database, single-user assumptions — to harden at
handover), and **not-built-yet** (search by name, sorting, un-reject, US market — candidates for the
roadmap). See [DECISIONS.md](DECISIONS.md) for the reasoning and [HANDOVER.md §11](HANDOVER.md) for
what's next.
