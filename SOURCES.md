# Source Test Log

A running record of every source we've evaluated for the discovery pipeline (Step 1) — what was
tried, whether it works, and **why**. The goal is that we never re-test the same dead source twice,
and that anyone can see the reasoning behind the current source list.

- The **live** source list lives in the database (`sources` table) and is edited from the app
  (Search Configuration → Edit). See [USER_GUIDE.md](USER_GUIDE.md#managing-search-terms--sources).
- How sources are used in the pipeline: [SEARCH_PIPELINE.md](SEARCH_PIPELINE.md).
- Source types: **Website** = searched repeatedly via `web_search`; **Single page** = read once via
  `web_fetch`.

## The two levers that decide if a source works

1. **Extractability** — can the pipeline actually read company names from it? `web_search` needs the
   content to be **indexed by Google as text**; `web_fetch` needs a **static** page (it can't run
   JavaScript). JS-rendered directories and blocked/anti-bot pages fail both.
2. **ICP relevance** — the ICP targets **finished-brand supplement companies** and *excludes*
   ingredient suppliers, contract manufacturers and distributors. A source packed with ingredient
   suppliers extracts fine but produces almost no *matches*.

## In use

| Source | Type | Status | Notes |
|---|---|---|---|
| NutraIngredients Europe | Website | ✅ Working | Core trade media. Keep "Europe" in the prefix (serves US edition by default). |
| Nutrition Insight | Website | ✅ Working | Core trade media. |
| Nutraceutical Business Review | Website | ✅ Working | Many articles paywalled — extract names from titles/snippets. |
| Nutritional Outlook | Website | ✅ Working | Core trade media. |
| Healthline — Best Vitamin Brands | Single page | ⚠️ Works, low EU relevance | `web_fetch` reads it fine (13 companies in test), but the list is **US-skewed** (Ritual, HUM, Seed, Nature Made…), so few pass the Europe-focused ICP. Delete if it keeps yielding nothing that matches. |
| Vitafoods Europe | Website | 🧪 Trial (2026-08) | See trade-show findings below. Added via migration 002. |
| In-Vitality | Website | 🧪 Trial (2026-08) | See trade-show findings below. Added via migration 002. |

## Evaluated — Events & trade shows (from Viola's list, tested 2026-08)

**General finding:** trade-show **exhibitor directories** are the valuable part, but they are almost
always **JavaScript search databases** (Vitafoods & Fi Europe on figlobal, in-cosmetics, In-Vitality)
or **blocked third-party aggregators** (10times, expolista returned HTTP 403). So `web_fetch` can't
read them as a single page. `web_search` on the event domain can surface *some* indexed exhibitor
text, so promising shows are added as **Website** sources, not Single page. Separately, exhibitors
skew heavily toward **ingredient suppliers / contract manufacturers / distributors**, which the ICP
excludes — so even a readable list tends to produce a **low match rate**.

| Source | Verdict | Why |
|---|---|---|
| **Vitafoods Europe** | 🧪 Trial as Website | Most relevant (nutraceuticals) & largest (~1,300 exhibitors). Official list is behind figlobal JS and 10times is blocked, but it's worth a search-based trial. Note steers extraction to finished brands only. |
| **In-Vitality** | 🧪 Trial as Website | Google had indexed exhibitor names from `in-vitality.it`, so a domain-scoped search may work. Italian, raw-materials heavy → expect many ingredient suppliers to skip. |
| **Fi Europe (Food Ingredients Europe)** | ⏸️ Hold | Exhibitors are mostly **food-ingredient suppliers** — largely excluded by the ICP. Directory is figlobal JS. Low expected payoff. |
| **in-cosmetics** | ⏸️ Hold | **Cosmetics**, not supplements — mostly outside the ICP. JS directory. |
| **NFBD (Nutriform Business Days)** | ❌ Can't mine (as-is) | No public exhibitor list at all (`nfbd.fr`; registration via idloom). Nothing for the pipeline to read. |

## If trade shows underperform

If the two trials yield few/no matches, the honest conclusion is that **trade shows don't fit the
current pipeline** (their value is locked in JS directories). The better long-term fit would be a
dedicated **"import an exhibitor list"** path — paste company names, or point at a specific static
list/PDF — which bypasses discovery entirely. Not built yet; note it as a candidate feature.

## How to record a new evaluation

When you test a new source, add a row here with the verdict (✅ working / ⚠️ caveat / ⏸️ hold /
❌ rejected) and a one-line reason. Keep the live `sources` table and this log in sync.
