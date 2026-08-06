# Decisions, Rationale & Limitations

This document explains **the choices we made building the Lysoveta Customer Finder, the thinking
behind them, the other options we weighed, what each choice can't do, and how it could be taken
further later.** It's written to be readable without a technical background, and to serve as the main
reference for the project's reasoning — including for the final report.

For the nuts-and-bolts detail there are three companion documents: [HANDOVER.md](HANDOVER.md) (the
overall system), [SEARCH_PIPELINE.md](SEARCH_PIPELINE.md) (how a search works, step by step) and
[SOURCES.md](SOURCES.md) (every source we tried and why). This file is about the *why*.

**How to read each entry:**
- **What we decided** — the choice, in one line.
- **The situation** — the problem we were solving and the constraints.
- **Options we weighed** — the alternatives, with their pros and cons.
- **Why we chose this** — the reasoning.
- **What to be aware of** — the limitations and trade-offs we knowingly accepted.
- **Other ways to take it later** — how it could evolve.
- **Status** — permanent design choice, a pilot shortcut to revisit at handover, or deferred.

A quick glossary of a few words that recur: **the worker** = the always-on server (Render) that runs
the long search; **the database** = Supabase, where all data lives; **enrichment** = the step where
the AI researches a company; **the ICP** = the Ideal Customer Profile, the written criteria the AI
scores companies against; **a migration** = a one-time change to the database's structure.

_Last compiled: 2026-08-06._

---

## 1. How the app is built and hosted

### 1.1 The app runs across three services (website, worker, database)

**What we decided.** The user interface is hosted on Vercel, the long-running search runs on a
separate always-on server (Render), and all data lives in a shared database (Supabase).

**The situation.** A real search takes around 15 minutes. The website host (Vercel) is "serverless",
which means it shuts a task down the moment the page has loaded — so a 15-minute job simply can't run
there.

**Options we weighed.**
- *Everything on the website host (Vercel).* Simplest to operate, but the long search would be killed
  mid-run. Not viable.
- *Everything on one always-on server.* Works, but we'd lose Vercel's fast, free, easy hosting for the
  interface.
- *Split it: website on Vercel, search on an always-on worker, shared database.* More moving parts,
  but each piece does what it's best at.

**Why we chose this.** The split lets the interface stay fast and simple while the heavy search runs
somewhere that won't be cut off.

**What to be aware of.** Two hosting platforms to keep running, and the interface has to know the
worker's address. (When running on a developer's own machine, both are the same place, so this is
invisible there.)

**Other ways to take it later.** If searches were ever made much shorter, everything could collapse
onto one platform. Not worth it now.

**Status.** Permanent, given how long a search takes.

### 1.2 The search runs in the background, and the screen checks on it

**What we decided.** When you click Search, the app immediately creates a "job" and starts the search
in the background, then hands you back control. The screen quietly checks the job's progress every few
seconds and shows "Step X of 3", a timer, and a live log.

**The situation.** A 15-minute task can't make you sit and wait on a frozen screen.

**Options we weighed.** A live push connection (more complex to build and host) versus simple periodic
checking.

**Why we chose this.** Periodic checking is simple, robust, and good enough — you get live progress
without any fragile always-connected machinery.

**What to be aware of.** Progress updates land every few seconds rather than instantly.

**Status.** Permanent.

### 1.3 One shared database for both testing and the live app

**What we decided.** The developer's local copy and the live app use the same database.

**The situation.** A pilot with a small team — one place for data is simplest, and database changes
take effect everywhere at once.

**What to be aware of.** There's no separate "practice" data — a local test writes to the same data
the stakeholders see on the live link. (This is exactly why we test carefully before pushing changes.)

**Other ways to take it later.** Set up a separate staging database once the app is handed over.

**Status.** Pilot shortcut; a handover consideration.

---

## 2. How the search works (the core engine choices)

The full step-by-step is in [SEARCH_PIPELINE.md](SEARCH_PIPELINE.md).

### 2.1 The search is three separate steps: Find → Research → Score

**What we decided.** Discovery (find company *names*), then Enrichment (research each one), then ICP
matching (score them against the criteria) — as three decoupled stages connected by a waiting list.

**The situation.** The steps cost wildly different amounts. Finding names is one cheap batch of web
searches that returns many companies at once. Researching a company is a *separate* expensive web
search *per company*.

**Options we weighed.**
- *Do everything in one big AI request.* Simpler to picture, but it mixes cheap and expensive work,
  is hard to control, and one stuck company would sink the whole thing.
- *Three separate steps with a waiting list in between.* More structure, but each step can run at its
  own pace and be tuned independently.

**Why we chose this.** Separating cheap discovery from expensive research is what makes the cost and
run-time controllable.

**Status.** Permanent — this is the backbone of the app.

### 2.2 Research only 5 companies per run

**What we decided.** Each search researches at most 5 of the waiting companies (5 at the same time).

**The situation.** Every company researched is a paid AI web search. Do too many and the run gets slow
and expensive and risks hitting the 30-minute ceiling and the AI provider's rate limits.

**Options we weighed.** Research everything found in one go (fast to fill the database, but expensive
and prone to timing out and rate-limit errors) versus a small fixed batch each run.

**Why we chose 5.** It keeps each run affordable and comfortably inside the time budget, while staying
within safe limits. The leftover companies simply wait for the next run.

**What to be aware of.** A big backlog takes several runs to work through.

**Other ways to take it later.** The "5" is a single tuned number that could be raised if the provider
limits and budget allow — easy to change.

**Status.** Permanent; the number is a tuned setting.

### 2.3 Stop finding new companies when 5 are already waiting

**What we decided.** The "find names" step only runs when fewer than 5 companies are waiting to be
researched.

**The situation.** Finding names is cheap, but every name found eventually costs money to research. If
we kept finding more while a backlog was piling up, the waiting list would grow forever with names
we've paid to find but never processed.

**Why we chose this.** It keeps the waiting list from ballooning — we finish researching what we have
before finding more.

**What to be aware of (this one has a real user-facing consequence).** If you pick new sources or
search terms while 5+ companies are already waiting, that run will only research the backlog — your
new picks aren't searched until the list drops below 5. The app warns you about this with a pop-up and
offers to clear the waiting list so your new picks are used right away.

**Status.** Permanent, softened by the warning pop-up.

### 2.4 A hard 30-minute limit, and auto-recovery of stuck companies

**What we decided.** The whole job is cut off after 30 minutes, and any company stuck "in progress"
for more than 10 minutes is put back on the waiting list.

**The situation.** Occasionally a company makes the AI's web search hang more or less forever.

**Why we chose this.** A safety net so one bad company can never freeze a run for good. Anything
already researched along the way is saved and kept, even if the run is cut off.

**What to be aware of.** A genuinely slow-but-valid run could be cut short — but nothing done so far is
lost.

**Status.** Permanent safety net.

### 2.5 Limit a single search to 3 terms × 4 sources

**What we decided.** For one search you can pick up to 3 search terms and up to 4 sources.

**The situation.** The AI's web search is given a fixed budget of 12 searches per run. The number of
searches it does equals *terms × website-sources*. 3 × 4 = 12 fills that budget exactly. Also, each
run only aims to find about 10 new companies.

**Options we weighed.** Let people pick as many as they like (feels generous) versus a deliberate cap.

**Why we chose the cap.** Going wider doesn't actually search wider — the tool still stops at 12, so
some of your extra combinations would simply never run, unpredictably. And everything found costs
money to research afterwards. So a bigger grid mostly means wasted budget, not more companies.

**What to be aware of.** The way to keep finding *new* companies over time is not to search wider in
one run, but to **change the pool** — rotate the search terms, add new sources, retire exhausted ones.
The cap is a sensible-defaults guardrail, not a hard technical wall.

**Other ways to take it later.** The cap lives in the interface, so it could be adjusted — but the
"even coverage within budget" guarantee only holds at 3 × 4.

**Status.** Permanent (a tuned sweet spot; a run costs roughly $3–5).

### 2.6 Careful limits on how much the AI can write per step

**What we decided.** Each step has a tuned ceiling on how much the AI can output.

**The situation.** The AI's web search adds up its output across several rounds. If the ceiling is too
low, the final answer gets cut off halfway and the app reads back *nothing* — silently. This was a real
bug we hit and fixed.

**Why we chose these values.** They're tuned to leave headroom so answers are never truncated.

**What to be aware of.** These numbers shouldn't be lowered casually — it's a known footgun,
documented in the code.

**Status.** Permanent, tuned.

---

## 3. Finding companies (discovery specifics)

### 3.1 Three kinds of source: whole website, single page, YouTube

**What we decided.** A source is one of: a **website** (searched repeatedly), a **single page** (read
once), or **YouTube** (brands pulled from video titles/descriptions).

**The situation.** Different sources need different handling. A trade-news site keeps publishing, so
it's worth searching again and again. A fixed "best brands 2026" list is worth reading once. YouTube
needs its own approach entirely.

**Why we chose this.** Matching the retrieval method to the source shape gets the most out of each.

**Status.** Permanent.

### 3.2 A single page is used up after one read

**What we decided.** A single page is read once; on later searches it's skipped (its companies are
already known). In the interface it moves into a "Completed single pages" list, with an "Add back to
source list" button to run it again on purpose.

**The situation.** Reading a fixed page again finds the same names — so re-running it just wastes a
search and money.

**Options we weighed.** Leave it selectable (risk wasted searches) versus hide it automatically versus
delete it. We chose to auto-hide but keep it, because some pages *do* change (an annually updated
list), so you should be able to bring it back deliberately.

**What to be aware of.** "Used up" is a soft state — the "Add back" button exists precisely because a
page might have been updated.

**Status.** Permanent (auto-hide + manual re-add).

### 3.3 The AI adapts to each source's language on its own

**What we decided.** Searches start in English, but the AI notices when a source is in another
language and searches it again in that language.

**The situation.** Many good European sources aren't in English; an English-only search misses their
companies.

**Options we weighed.** We actually first built a manual "this source is in French" setting — then
**removed it**, because guessing a source's language up front was brittle. Letting the AI adapt as it
reads works with zero configuration.

**What to be aware of.** It relies on the AI's judgment rather than a fixed rule (which has worked
well in practice).

**Status.** Permanent (the manual setting was reverted).

### 3.4 "Target market" is a gentle nudge, not a filter

**What we decided.** The Europe / US / No-preference selector nudges the search toward a region but
never excludes companies from other regions — the scoring step handles relevance afterwards.

**The situation.** A hard geographic filter would throw away companies that are actually relevant.

**Why we chose a soft nudge.** Casting a little wider costs slightly more research but never hurts
coverage; the ICP scoring filters to the right companies later anyway.

**What to be aware of.** While the US market is switched off (see 8.1), this selector is locked to
Europe.

**Status.** Permanent as a design principle.

### 3.5 YouTube keeps finding new videos; companies are never double-counted

**What we decided.** The app remembers where it left off on YouTube (so each run looks at new videos,
not the same top ones) and remembers every video already read. When two sources return the same
company, only the first one gets the credit.

**Why we chose this.** Without it, YouTube would surface the same handful of videos every time.

**What to be aware of.** YouTube is experimental and noisier than trade media, and leans US/English —
treat it as a bonus source. It needs a YouTube key on the server or it's simply skipped.

**Status.** Permanent; complementary source.

---

## 4. Researching & storing companies

### 4.1 Never research the same company twice; save as you go

**What we decided.** A company already researched is reused for free; each company is saved the moment
its research finishes; a company that fails is put back on the waiting list to retry.

**Why we chose this.** It avoids paying twice for the same research, means one stuck company can't
destroy the others' work, and makes a failed run cheap to resume (the finished ones are cached).

**Status.** Permanent.

### 4.2 "Removing" a company hides it rather than erasing it

**What we decided.** Companies have simple states: shown, researched-but-not-yet-reviewed, or
rejected. "Remove" marks a company rejected rather than deleting it.

**Why we chose this.** It keeps the research we paid for as a cache, and keeps rejected companies out
of future results — without destroying data.

**What to be aware of.** There's no "un-reject / review rejected companies" screen yet.

**Other ways to take it later.** Add a way to review and restore rejected companies (on the roadmap).

**Status.** Permanent model; the review screen is deferred.

---

## 5. The ICP and scoring

### 5.1 The ICP is editable inside the app, with version history

**What we decided.** The scoring criteria (the ICP) can be edited in the app, every save is snapshotted
so you can go back, and the original file version is the fallback.

**The situation.** The criteria will change as AKBM learns more; they shouldn't need a developer to
update them.

**Why we chose this.** It puts the business criteria in the business's hands, safely (nothing is lost —
you can always revert).

**Status.** Permanent.

### 5.2 The AI's review of an edited ICP only advises — it never blocks or overwrites

**What we decided.** When you save an edited ICP, an AI review checks whether the text works as *clear
instructions for the AI* (does it name the market, the tiers, a scoring method, exclusions?) — not
whether the business criteria are "right". It lists suggestions, but you can always save anyway. Its
"apply this fix" option shows you the change and only uses it if you accept.

**The situation.** We wanted help writing clear criteria, without the AI ever quietly rewriting the
humans' business judgment.

**Why we chose this.** The people own the strategy; the AI only guards clarity. Nothing is ever changed
behind your back.

**Status.** Permanent.

### 5.3 Scoring always runs automatically

**What we decided.** After finding and researching companies, scoring always runs automatically. An
earlier manual "paste and score" mode was removed.

**Why we chose this.** One simple path; scoring is the cheap step, so there's no reason to make it
optional.

**Status.** Permanent.

### 5.4 Two ICPs (Europe / US), switched on automatically

**What we decided.** There's a European ICP and a US ICP. When the US one holds real criteria, each
company is scored against the ICP for its market; until then everything uses the European ICP.

**Why we chose this.** It avoids scoring US companies against an empty placeholder, and the US path
turns on by itself the moment real US criteria are entered.

**Status.** Dormant while the US market is switched off (see 8.1).

### 5.5 Priority tiers are fixed; product categories are editable

**What we decided.** The three priority tiers (Early Mover / Follower / Enabler) are fixed in the app.
The list of product categories, by contrast, can be added to / renamed / removed — edited in one place
(the ICP tab) and used everywhere.

**The situation.** The tiers aren't just labels — they carry scoring weights, colours and filtering
logic, so changing them is really a change to how the app works. Categories are descriptive tags that
will naturally evolve.

**Options we weighed.** Make both editable (risky for the tiers, which are wired into scoring) versus
make only the categories editable. We also chose *manual* category editing over trying to derive
categories automatically from the ICP text, which would have been fragile.

**Why we chose this split.** It gives freedom where it's safe (categories) and stability where it
matters (tiers), with a single source of truth for the category list instead of it being hardcoded in
three places.

**What to be aware of.** Renaming or removing a category doesn't relabel companies already tagged with
the old value (same as renaming a source).

**Other ways to take it later.** If the tiers ever need to change, that's a deliberate developer
change to scoring, colours and filters together.

**Status.** Permanent.

### 5.6 A "test on example companies" tool

**What we decided.** An optional tool scores a small, editable set of known companies against the ICP
you're editing and shows expected-versus-actual, without saving anything.

**Why we chose this.** It lets you sanity-check a change to the criteria against companies you already
have an opinion on, before committing.

**Status.** Permanent, optional.

---

## 6. How data is stored

### 6.1 Multiple geographies / categories stored as a simple comma-separated list

**What we decided.** A company can have several geographies and several categories; we store them as a
comma-separated list in the existing single text field.

**The situation.** The fields used to hold one value each. Making them hold several touches storage,
filtering, scoring, Excel export and four different screens.

**Options we weighed.**

| Option | Pros | Cons |
|---|---|---|
| **Comma-separated list** in the existing field | No database change; old single values still work; the app already filters in its own code | Not a "textbook" database design; awkward for heavy database queries (which we don't do) |
| **A proper multi-value column** | More correct data type | Needs a database change and rewriting every read/write/export; more risk |
| **A separate linking table** | Fully "correct", scales to extra info per tag | Clear overkill for a pilot; much more code |

**Why we chose the comma-separated list.** Lowest risk, no database change, and since the app already
does its filtering in its own code we never needed fancy database features. The right level for a
pilot.

**What to be aware of.** It's not a "proper" relational design; if the data model is ever formalised
this would be converted.

**Other ways to take it later.** Move to a proper multi-value column if reporting needs grow, or to a
linking table if tags ever need their own extra information (which source suggested it, a confidence
level, a date). Both are additive changes later.

**Status.** Pilot-pragmatic; revisit if the data model is formalised at handover.

### 6.2 The search settings live in the database, not in a code file

**What we decided.** Sources, search terms and categories live in the database and are edited in the
app; a code file is kept only as a fallback if the database can't be read.

**Why we chose this.** End users must be able to add, edit and remove sources and terms without a
developer or a redeploy.

**Status.** Permanent.

### 6.3 Every company remembers which source found it; counts build up over time

**What we decided.** Each company records the source that found it. Per-source counts ("used /
queued / saved") and "last used" dates build up from each search onward; the "saved" count is worked
out live so it can never drift.

**What to be aware of.** These counts only start from when we began tracking — companies saved earlier
don't count toward "saved", and search terms have no date before we added it (we did a one-time fill of
source dates from each source's most recent saved company).

**Status.** Permanent; forward-looking by nature.

---

## 7. Sources & quality

The source-by-source reasoning is in [SOURCES.md](SOURCES.md).

### 7.1 A curated "recommended" default list, chosen by hand

**What we decided.** Sources can be marked "recommended high quality"; each column shows only the
recommended ones by default, with a "Show all…" link for the rest.

**The situation.** The source list had grown long and unwieldy.

**Options we weighed.** Automatically show the top performers (by hit rate) versus a hand-picked
"recommended" flag. We chose hand-picked, because performance data is still thin and hit rate is
unreliable for sources used only a few times — an automatic list would look arbitrary right now.

**Other ways to take it later.** Once there's enough usage data, the app could *suggest* which
low-performers to un-recommend, or retire dead sources automatically.

**Status.** Permanent; an automatic assist is a possible future step.

### 7.2 A gentle "low hit rate" warning with adjustable thresholds

**What we decided.** A source is flagged with a ⚠ warning when it's been used enough times *and* its
hit rate is below a threshold. Both the threshold and the "used enough times" number are adjustable in
the app.

**Why we chose this.** It surfaces dead weight without unfairly flagging brand-new sources that
haven't had a fair chance yet.

**Status.** Permanent.

---

## 8. What we chose to leave out or postpone

### 8.1 The US market is switched off for now (but fully built behind a switch)

**What we decided.** A single switch turns off the US ICP tab, locks the market selector to Europe, and
sends everything to the European scoring. Nothing is deleted — flipping the switch brings it all back.

**Why.** The pilot focuses on Europe, and real US criteria aren't defined yet.

**Status.** Deferred (on the roadmap).

### 8.2 Company Prospectus — postponed

**What we decided.** Shown as a disabled "Soon" tab.

**Status.** Deferred.

### 8.3 Statistics per search term (beyond a date) — postponed

**What we decided.** Search terms show a "last used" date but no per-term hit counts.

**Why.** Terms have no counting machinery yet and the payoff (pruning weak terms) is small; a date was
cheap to add, counts weren't.

**Status.** Deferred until there's a clear need.

### 8.4 Things we deliberately did *not* build, to avoid clutter

- **Turning a good single page into a whole-site search.** Considered, dropped — most single pages
  only suit being read directly, and searching their whole website would mostly return noise.
- **A direct link from a completed page to its companies.** Dropped in favour of the general **Source**
  filter in the Company Database, to avoid extra cross-screen complexity.

---

## 9. Smaller design choices (still deliberate)

- **Dropdown menus that never get cut off.** The multi-select menus are drawn "on top of" the page so
  they can't be clipped by a scrolling panel — chosen over fiddly per-panel fixes.
- **Plain comma-separated text in the table, not coloured "chips".** The chips looked crowded; plain
  text is calmer and easier to read.
- **Your source/term picks reset after a finished search** so the next one starts clean — but a failed
  search keeps them, so "Try again" still works.
- **The live search log closes itself once companies are saved**, to keep the "done" screen tidy.
- **A "Remove" button on the final review step**, so you can drop a company that turns out not to fit
  once you look closer.
- **The big rebuild of the main screen.** The app's main file had grown to ~3000 lines in one piece;
  we split it into smaller, self-contained parts. This changed nothing for the user — it's purely to
  keep the app maintainable and easy to hand over.

---

## 10. Which AI model, and what it costs

**What we decided.** Every AI call uses one model (Claude Sonnet), set in a single place so it's easy
to change.

**Why we chose it.** The find/research steps rely on the AI's built-in web search and web-page reading,
which the cheaper "Haiku" model doesn't support. The top "Opus" model would cost several times more for
no real quality gain on these fairly mechanical extract-and-score tasks. Sonnet is the sweet spot of
capability, speed and cost — and using one model everywhere keeps behaviour and cost predictable.

**What to be aware of.** A real search costs roughly **$3–5** (the find/research steps rack up large
web-search context; scoring is cheap). Worth remembering before sharing the live search widely.

**Other ways to take it later.** The model is a one-line change if a better-value option appears — the
only requirement is that it still supports web search.

**Status.** Permanent; easily swapped.

---

## 11. Security & privacy (deliberately light for the pilot)

**What we decided (and want to be transparent about).** The login is a simple email + password gate.
It is **not real security**: passwords are stored as plain text, and the database is open to anyone
with the public key the app ships with. It only stops casual browsing. The AI key is kept server-side
only, never in the browser. The data is business (B2B) company information, not personal data.

**Why it's like this.** It's a pilot. Real authentication is a proper project of its own and belongs
with AKBM's IT at handover; adding half-measures now would give a false sense of security.

**What to be aware of.** Anyone with the link could, in principle, reach the data directly. Treat the
live link as semi-private during the pilot.

**Other ways to take it later.** Proper authentication and locked-down database access — **the top
handover item.**

**Status.** Deliberate pilot posture; must be hardened at handover.

---

## 12. All limitations & future opportunities in one place

A single overview so you can see the whole picture at a glance. Each links back to the fuller
reasoning above.

### Limitations we knowingly accepted

| Limitation | Why it exists | Section |
|---|---|---|
| A search is slow (~15 min) and costs ~$3–5, and needs an always-on server | The AI research per company is inherently heavy | 1.1, 2.2, 10 |
| Picking new sources/terms does nothing while 5+ companies are already waiting | We finish the backlog before finding more | 2.3 |
| One run only searches so wide (3 terms × 4 sources) | The AI's search budget is fixed at 12 | 2.5 |
| No real security — plain-text login, openly readable database | Deliberate pilot shortcut | 11 |
| Multiple geographies/categories stored as plain text, not a "proper" structure | Avoided a risky database change for a pilot | 6.1 |
| Renaming/removing a source or category doesn't relabel existing companies | Kept simple; historical data is left as-is | 3.2, 5.5 |
| Counts and dates only start from when tracking began | Can't invent history we didn't record | 6.3 |
| YouTube results are noisy and US/English-leaning | It's an experimental bonus source | 3.5 |
| No screen to review or restore rejected companies | Not built yet | 4.2 |
| One shared database for testing and live (no practice copy) | Simplicity for a small pilot | 1.3 |

### Opportunities / ways to take it further

- **Turn the US market on** — the whole path is built behind a switch; it needs real US criteria.
- **Build the Company Prospectus** tab.
- **Add a "review rejected companies" screen** so rejections can be undone.
- **Validate the scoring** against AKBM's own list of ~100 companies to measure accuracy.
- **Smarter source management** once enough usage data exists — auto-suggest weak sources to retire,
  or auto-recommend strong ones (today it's hand-picked).
- **Per-term statistics** to help prune weak search terms.
- **A more formal data model** (proper multi-value fields or linking tables) if reporting needs grow.
- **Real authentication and locked-down data access** — the essential step for any wider rollout.
- **A separate staging database** so testing never touches live data.

---

_The live, evolving to-do list is in [HANDOVER.md §11](HANDOVER.md). This document is about the
reasoning; that one tracks what's next._
