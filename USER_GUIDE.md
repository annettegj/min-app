# Lysoveta Customer Finder — User Guide

A short guide to using the app. No technical knowledge needed. For architecture and maintenance,
see [HANDOVER.md](HANDOVER.md).

## What the app does

It helps you find potential B2B customers for Lysoveta. It searches trade media for supplement
companies, researches each one, scores them against the Lysoveta Ideal Customer Profile (ICP), and
lets you review and save the best matches to a database you can filter and export.

## The three tabs

### 1. Company Database

Your saved companies. Use the filters at the top (geography, category, price range, ICP fit,
priority tier) to narrow the list, then **Find Companies** to apply them (or **Show All Companies**).
Click a row to expand its description.

- **Export as Excel** — downloads an `.xlsx` file of the companies **currently shown** (it respects
  your filters and any rows you've hidden). The file name includes the date. The first export may
  take a moment while the export engine loads; after that it's instant.
- **Clear Results** — empties the shown table and returns to a clean starting point (just the
  filters). It doesn't delete anything.

#### Editing and removing companies

Click **Edit list** (top-right of the results) to turn on edit mode. Each row then shows two icons:

- **✎ (pencil)** — opens an inline form to edit the company's fields (geography, category, price,
  ICP fit, priority tier, website, description). **Save** writes the change to the database;
  **Cancel** discards it. *(The company name can't be edited.)*
- **✕** — opens a small dialog with two choices:
  - **Remove from this view only** — hides the row from the current list and the Excel export. It's
    **not deleted** — click **Restore hidden** (top of the results) to bring hidden rows back, or
    just reload the page.
  - **Delete from the company database** — removes it from the database. It's kept internally so it
    can be restored later and won't be re-discovered in future searches.

Click **Done editing** to leave edit mode.

> If you've changed a field but not saved it, and then filter, clear, or export, the app warns you
> ("You have unsaved changes") so you don't lose the edit by accident.

### 2. Find New Companies

This is where you run a search.

1. **Search terms** — tick up to **3** terms, and **Sources** — tick up to **4** — for this search.
   Leave a list all unticked to use the defaults (the default terms / all sources). Each list shows
   a few items with a scrollbar; **Show all** expands it fully and **Show fewer** collapses it back.
   *(Why the 3-and-4 limit? A search runs `terms × sources` web searches with a hard budget of 12,
   and 3 × 4 = 12 fills it exactly — picking more can't run and just slows things down. Full
   reasoning in [SEARCH_PIPELINE.md](SEARCH_PIPELINE.md#why-the-caps-up-to-3-terms--4-sources).)*
2. **Step 3 — ICP matching** is set to **Automatic**: the app scores companies against the ICP for
   you. (The manual option is disabled for now.)
3. Click **Search for New Companies**. A search takes roughly **15 minutes** and will time out after
   **30 minutes**.
4. While it runs you'll see **"Step X of 3"**, an elapsed timer, and a **Search Log** panel you can
   expand to watch what the app is doing behind the scenes.
5. When it finishes, you get a list of companies that passed the ICP matching. Tick the ones you
   want, fill in/adjust any fields, and **save** them to the Company Database. Companies you don't
   save are set aside.

> The first search after a quiet period can take ~30 seconds just to start up — the server "wakes
> up" after being idle. That's normal.

#### Managing search terms & sources

The lists aren't fixed — you can change what's available to everyone. In the **Search Configuration**
panel, click **Edit** (top-right). Everything you do in edit mode is a **draft**: it doesn't touch
the real configuration until you press **Save changes**.

- **Edit a search term** — click its text field and change the wording (fix a typo, reword it).
- **Edit a source** — click the source to open a form pre-filled with all its fields; change what
  you need and press **Update source**. The fields are:
  - **Name** — how it's shown in the list.
  - **Type** — **Website** (searched repeatedly) or **Single page** (one URL, read once).
  - **Search prefix** *(website, required)* — what's put in front of each term to target the site,
    e.g. `nutraingredients.com Europe`.
  - **Homepage URL** *(website, optional)* / **Page URL** *(single page, required)*.
  - **Note to the AI** *(optional)* — a plain-language instruction for that source, e.g.
    *"Serves the US edition by default — always keep 'Europe' in the query"* or
    *"Paywalled — read company names from the titles."* This is passed to the AI during the search.
- **Add** — **+ Add new search term** adds a blank field to type into; **+ Add new source** opens
  the same form, empty.
- **Remove** — click the **✕** next to a term or source.

When you're done, press **Save changes** to write everything at once, or **Cancel** to discard the
whole draft.

> **Nothing is saved until you press Save changes**, and the changes are **shared** — once saved,
> they affect every search for everyone. A yellow line reminds you of this while editing. Switching
> tabs keeps your draft; only reloading the page discards it.

> **Single-page sources** are read during the search: the AI fetches that one URL and pulls the
> companies from it. This is ideal for a fixed list (e.g. a "best brands 2026" round-up) — but note
> it finds nothing *new* on a re-run, since the page doesn't change. If a site blocks automated
> reading, that page is simply skipped.

> Each search uses Sprint's Anthropic account, which has limited usage, so it's worth being a little
> deliberate with test runs.

### 3. Lysoveta ICP Criteria

Shows the ICP definition the app uses to score companies (read-only for now). If you'd like changes
to the criteria, note them down — editing from the app is planned but not built yet.

## Tips

- Best viewed on a **laptop/desktop** — the layout isn't designed for mobile.
- There's **no login** — anyone with the link can open the app, so please don't share the link more
  widely than intended.
- Your actions are **live**: saving or rejecting companies changes the real database.

## Questions / feedback

Note anything you'd like changed or added while testing — it all feeds into planning the next phase.
