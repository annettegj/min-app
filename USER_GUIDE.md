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

1. **Search terms** — tick up to **3** terms you want to search for (from a preset list). Leave them
   all unticked to use the default terms. *Note: the Sources list next to it is not selectable yet —
   the sources are fixed for now.*
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
