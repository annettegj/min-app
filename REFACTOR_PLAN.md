# Refactor plan — splitting `app/page.tsx` (3012 lines)

**Status:** PLAN ONLY — nothing implemented yet. This document describes how to break the single
`app/page.tsx` client component into small, maintainable pieces **without changing any behaviour**.

## Why
`app/page.tsx` is one 3012-line client component holding the entire UI: ~70 `useState`, ~55 handler
functions, 4 tabs, and 6 modals. It's hard to navigate, hard to change safely, and a steep onboarding
for whoever takes over at handover. `lib/search.ts` (1005 lines) is large too but is one cohesive
concern (the pipeline) — out of scope here; this plan is only about `page.tsx`.

## Guiding principles (read before starting)
1. **No behaviour change.** Every step is a pure structural move. If the app looks or behaves
   differently after a step, the step is wrong — revert it.
2. **Tiny, independently shippable steps.** After each step: run `npx tsc --noEmit` **and**
   `npm run build`, do a manual smoke test of the affected tab, then commit. One green commit per step
   so any step can be reverted in isolation.
3. **One domain at a time.** Never refactor two tabs in the same commit.
4. **Bottom-up.** Extract the leaf, zero-shared-state things first (styles, types, pure helpers,
   standalone components, modals), then the big tabs last — by then most of their dependencies already
   live in shared modules.
5. **State strategy = one custom hook per domain.** Rather than prop-drilling ~70 state values, each
   feature domain gets a hook (`useCompanies`, `useIcpEditor`, …) that owns its state + handlers and
   returns a small API. Tab components call the hook (or receive its result as props). `page.tsx`
   becomes a thin shell.
6. **Don't deploy mid-refactor to production during the 2-week final-prep window** unless a step is
   fully verified. Prefer doing the whole refactor on a branch, or land the safe phases (1–3) and
   defer the risky tab extraction (phase 4+) if time is short.

---

## Target structure (end state)

```
app/
  page.tsx                     # thin shell: auth gate, tab state, header/footer, renders the active tab + modals
  components/
    common/
      AuthScreen.tsx            # (already standalone in-file → move)
      MarketBadge.tsx           # (already standalone in-file → move)
      Header.tsx                # top bar: logo, signed-in email, Log out, tab nav
    database/
      CompanyDatabaseTab.tsx
      CompanyFilters.tsx        # the "Filter Companies" panel
      CompanyTable.tsx          # results table: rows, expand, inline edit, checkbox, status dropdown
      AddCompanyModal.tsx
    search/
      FindCompaniesTab.tsx
      SearchConfigPanel.tsx     # terms + sources selection + draft edit mode
      SearchProgress.tsx        # "Step X of 3", timer, live log panel
      SearchResults.tsx         # selectable results + save-to-database flow
      SourceModal.tsx
      QueueModal.tsx
      SourcePerfModal.tsx       # "Source performance" (logically belongs to search config, not ICP)
    icp/
      IcpTab.tsx
      IcpEditor.tsx             # textarea + Review/Apply/Test/Version controls
      IcpDiffView.tsx           # the apply-fix diff
      IcpTestResults.tsx        # the test-on-examples table
      ReviewInfoModal.tsx       # "What does the AI review check?"
      ManageExamplesModal.tsx
    about/
      HowItWorksTab.tsx
  hooks/
    useAuth.ts                  # authEmail, login, signup, logout, localStorage session
    useCompanies.ts             # companies, filters, results/visibleResults, edit/remove/status, selection, hidden, export
    useSearchConfig.ts          # sources/terms records + options, draft edit, saveConfig, source modal state
    useSearchJob.ts             # agent search, polling (refs), queue count, queue modal
    useIcpEditor.ts             # icp docs, draft, review/apply/diff/test/versions
    useSettings.ts              # warn thresholds + review instructions + test example set (all app_settings)
  lib/
    styles.ts                   # inputStyle, labelStyle, btnBase, btnPrimary, btnSecondary  (already module-level → move)
    format.ts                   # displayHostname, safeHref, fmtAddedDate, icpColor, diffLines
    uiTypes.ts                  # Company, SearchResult, PendingCompany, EditDraft, Source*, DraftTerm/Source, DiffSeg, IcpTestRow
    uiConstants.ts              # GEOGRAPHIES, GEO_OPTIONS, CATEGORIES, CAT_OPTIONS, TIERS, STATUS_OPTIONS, SEARCH_TERM_OPTIONS, SOURCE_OPTIONS, AUTH_KEY, AUTH_MAX_AGE, EMPTY_ADD_FORM
```
(`lib/models.ts`, `features.ts`, `icpReview.ts`, `icpTest.ts`, `supabase.ts` already exist and stay.)

---

## What's in `page.tsx` today (the map this plan is based on)

**Module-level (lines ~1–208):** constants (GEOGRAPHIES, CATEGORIES, STATUS_OPTIONS, SOURCE/TERM
options, AUTH_KEY…), style objects (`inputStyle`, `labelStyle`, `btnBase`, `btnPrimary`,
`btnSecondary` — already module-level ✅), types (`Company`, `SearchResult`, `PendingCompany`,
`EditDraft`, `SourceFields/Record`, `DraftTerm/Source`, `DiffSeg`), pure helper `diffLines`, and two
standalone components `MarketBadge` and `AuthScreen`.

**`Home()` (210–3012):**
- **State (~70 `useState`, 4 refs, 3 memos)** grouped by domain — see the inventory below.
- **Handlers by domain:** auth (login/signup/logout); companies (load, add, edit, remove, status,
  select, hide, export, filters); search config (load, draft edit, save, source modal); queue (count,
  clear); ICP editor (load, review, apply, diff, test, versions, manage examples, review-info);
  settings (load/save thresholds + review instructions); agent search (handleAgentSearch + polling,
  results review, handleSave).
- **Render:** header + tab nav, then `tab === "database" | "search" | "icp" | "about"` blocks, then 6
  modals (queue, source performance, review-info, add-company, manage-examples, source).

### State → domain mapping (drives which hook owns what)
| Domain (hook) | State it owns |
|---|---|
| `useAuth` | authEmail |
| `useCompanies` | companies, geography, category, priceMin/Max, icpMin, tier, searchState, searchParams, editingCompanyId, editDraft, editOriginal, savingEdit, editError, confirmRemoveId, removing, editMode, hiddenIds, selectedIds, showOnlySelected, expandedCompanyId, pendingNav, pendingExport, exporting, addOpen/addForm/addSaving/addFormError; memos `results`, `visibleResults`, `savedBySource` |
| `useSearchConfig` | sourceOptions, termOptions, configEditMode, termRecords, sourceRecords, draftTerms, draftSources, newSource, editingSourceKey, sourceModalOpen, sourceInfoOpen, termsExpanded, expandedSourceGroups, configBusy, configError, selectedTerms, selectedSources, targetMarket, keyRef |
| `useSearchJob` | agentState, agentError, staleCompanies, searchResults, pendingCompanies, addingState, saveError, sourceNameMap, searchProgress, activeSearchJobId, logLines, showLog, elapsedSec, pendingQueueCount, queueModalOpen, clearingQueue; refs pollRef/elapsedRef/startMsRef |
| `useIcpEditor` | icpDocs, icpRegion, icpEditMode, icpDraft, icpSaving, icpError, icpHistoryOpen, icpVersions, icpChecking, icpCheck, icpApplying, icpApplyNote, icpApplyError, icpDiff, icpTesting, icpTestResults, icpTestError, icpTestEmpty, manage* (examples) |
| `useSettings` | warnThresholdPct, warnMinUses, perf* (modal/draft), perfEditThreshold, reviewInstructions + review-info modal state, icpTestSet |
| shell (`page.tsx`) | tab, aboutSection |

---

## Phased steps (each = one commit, build-verified)

### Phase 0 — safety net (before touching anything)
- Confirm `npm run build` is green on current `main`. Tag/note the commit hash to roll back to.
- (Optional but recommended) create a `refactor/split-page` branch and do all of this there; merge when
  the whole thing is verified. Keeps `main` deployable during the 2-week window.

### Phase 1 — extract zero-risk module-level code (pure moves, no state)
Risk: **very low** (pure cut/paste + imports).
1. `lib/styles.ts` ← `inputStyle`, `labelStyle`, `btnBase`, `btnPrimary`, `btnSecondary`. Import back into `page.tsx`.
2. `lib/uiConstants.ts` ← all the `const` arrays/values (GEOGRAPHIES … EMPTY_ADD_FORM).
3. `lib/uiTypes.ts` ← all `type` declarations. (Note: `IcpTestRow` is currently declared *inside* `Home()` — move it to the module first.)
4. `lib/format.ts` ← `diffLines` (module-level today) + `displayHostname`, `safeHref`, `icpColor`, `fmtAddedDate` (currently inside `Home()` — move out; they're pure).
5. `components/common/MarketBadge.tsx` and `components/common/AuthScreen.tsx` ← the two standalone components (move as-is; they already take props).

Verify after **each** of 1–5: `tsc` + `build`, load the app, click through all tabs. Commit each.
After Phase 1, `page.tsx` should be ~300–400 lines shorter and import from the new modules.

### Phase 2 — extract the self-contained modals (props in, callbacks out)
Risk: **low** — modals already read a well-defined slice of state; convert that slice to props.
For each modal: create the component file, give it explicit props (values + `on*` callbacks + `onClose`),
and replace the inline JSX in `page.tsx` with `<XModal ... />`. Do them one per commit:
6. `SourcePerfModal.tsx` (reads sourceOptions + warn thresholds + savedBySource; callbacks to save thresholds).
7. `ReviewInfoModal.tsx`.
8. `AddCompanyModal.tsx`.
9. `ManageExamplesModal.tsx`.
10. `QueueModal.tsx`.
11. `SourceModal.tsx` (+ its embedded info toggle).
Verify each: open/close the modal, exercise its actions, `tsc`+`build`, commit.

### Phase 3 — introduce domain hooks (move state, NO new components yet)
Risk: **medium** — this relocates state but keeps the same render in `page.tsx`.
The trick: create each hook, move its state + handlers into it, and in `page.tsx` replace the removed
declarations with `const x = useXxx()` then reference `x.foo` / `x.doThing()`. The JSX barely changes
(only the identifiers get a prefix). Do one hook per commit, smallest first:
12. `useAuth` → wire the auth gate.
13. `useSettings` (thresholds + review instructions + test set) — used by ICP + source perf.
14. `useSearchConfig`.
15. `useSearchJob` (includes the polling refs + timer — keep the `useEffect` cleanup semantics identical).
16. `useIcpEditor`.
17. `useCompanies` (biggest; includes the `results`/`visibleResults`/`savedBySource` memos + export).

> Because a hook returns an object, the mechanical change in `page.tsx` is mostly find-replace of bare
> identifiers to `hook.identifier`. Keep each hook in one commit and lean on `tsc` to catch every
> missed reference before building.

### Phase 4 — extract the tab components (the real win)
Risk: **medium-high** — biggest JSX moves. Now that state lives in hooks, a tab component either calls
its hook(s) directly or receives the hook result(s) as props. **Recommendation:** call hooks *inside*
the tab component where the data is single-domain, and pass down cross-domain bits as props.
18. `about/HowItWorksTab.tsx` — **do this first**: it's almost pure JSX (only `aboutSection` state),
    zero coupling. Great confidence-builder and immediately removes ~220 lines.
19. `icp/IcpTab.tsx` (+ `IcpEditor`, `IcpDiffView`, `IcpTestResults` sub-components) — consumes
    `useIcpEditor` + `useSettings`.
20. `database/CompanyDatabaseTab.tsx` (+ `CompanyFilters`, `CompanyTable`) — consumes `useCompanies`.
21. `search/FindCompaniesTab.tsx` (+ `SearchConfigPanel`, `SearchProgress`, `SearchResults`) —
    consumes `useSearchConfig` + `useSearchJob`; on save, calls `useCompanies.reload()`.
22. `components/common/Header.tsx` — the top bar + tab nav.
After each: `tsc` + `build` + smoke-test that exact tab. Commit per tab.

### Phase 5 — cleanup
23. Delete now-dead code, tighten imports, ensure `page.tsx` is a thin shell (~150–250 lines:
    auth gate, tab state, `<Header/>`, the active `<*Tab/>`, and the modals that are globally mounted).
24. Update `HANDOVER.md` §7 (key files) to describe the new `components/` + `hooks/` layout.

---

## Cross-cutting gotchas (the things that will bite if ignored)
- **`guardUnsavedEdit` couples tabs + company editing.** Tab switching and several actions call it to
  warn about an unsaved inline company edit. Plan: `useCompanies` exposes `hasUnsavedEdit()` +
  `guardUnsavedEdit(fn)`; `page.tsx`/`Header` import that and wrap tab changes. Don't scatter the guard.
- **Search → save → database reload.** After `handleSave` in the search flow, the database must refresh.
  Wire it as a callback: `useSearchJob`/`SearchResults` receives `onSaved` → `useCompanies.reload()`.
- **Polling & timers use refs + a `useEffect` cleanup.** Keep `pollRef`/`elapsedRef`/`startMsRef` and
  their cleanup inside `useSearchJob`; verify the interval is cleared on unmount and on job completion
  exactly as today (easy to introduce a leak here).
- **Shared styles must move first (Phase 1).** Every component imports `btnPrimary` etc. — extract to
  `lib/styles.ts` before any component extraction or you'll create circular/duplicate definitions.
- **`ManageExamplesModal` and `testIcp` read companies straight from Supabase**, not from React state —
  so they *don't* need `useCompanies`. Keep that decoupling (don't "helpfully" wire them together).
- **`IcpTestRow` type is declared inside `Home()`** — must be lifted to `lib/uiTypes.ts` in Phase 1.
- **US gating (`US_MARKET_ENABLED`) and Step-3-always-auto** logic stays as-is — no behaviour change.

## Verification checklist (run after every step)
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` clean
- [ ] Manual smoke test of the touched area: Database (filter, expand, edit, status, select, export,
      add-company), Find New Companies (config edit, source/queue/perf modals, a mock/real search),
      ICP (edit → review → apply diff → test → version history), How It Works, login/logout.
- [ ] `git commit` with a message naming exactly what moved.

## Rollback
Every step is one commit. If a step breaks something not caught by the build (a runtime/visual
regression), `git revert` that single commit — no other step is affected.

## Effort estimate (rough)
Phases 1–2 (styles/types/helpers/modals): ~half a day, very safe. Phase 3 (hooks): ~1 day. Phase 4
(tabs): ~1–1.5 days. Total ~3 days of careful work with a build+smoke-test between every step.
Given ~2 weeks to final and "core must keep working", a sensible split is: **land Phases 1–2 now**
(pure win, near-zero risk), **do Phases 3–4 on a branch** and merge only when fully verified.
