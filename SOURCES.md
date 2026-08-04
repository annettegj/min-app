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

> **Geography is NOT a source filter (policy, 2026-08).** US-focused sources are welcome — the ICP
> step filters results to European finished brands downstream, so casting wider costs a little
> extra research but never hurts coverage. Sources are judged only on **extractability** and whether
> they list **companies** (not ingredient suppliers, not pure trend/ingredient data). Earlier
> "low EU relevance" notes below are kept as context, not as reasons to exclude.

## In use

| Source | Type | Status | Notes |
|---|---|---|---|
| NutraIngredients Europe | Website | ✅ Working | Core trade media. Keep "Europe" in the prefix (serves US edition by default). |
| Nutrition Insight | Website | ✅ Working | Core trade media. |
| Nutraceutical Business Review | Website | ✅ Working | Many articles paywalled — extract names from titles/snippets. |
| Nutritional Outlook | Website | ✅ Working | Core trade media. |
| Healthline — Best Vitamin Brands | Single page | ✅ Working | `web_fetch` reads it fine (13 companies in test). US-leaning list (Ritual, HUM, Seed, Nature Made…) — that's fine under the geography policy above; the ICP filters. Fixed list, so nothing new on re-runs. |
| Vitafoods Europe | Website | 🧪 Trial (2026-08) | See trade-show findings below. Added via migration 002. |
| In-Vitality | Website | 🧪 Trial (2026-08) | See trade-show findings below. Added via migration 002. |
| EHPM — Member Companies | Single page | 🧪 Trial (2026-08) | Small static member list (~18 companies). Added via migration 003. Note skips associations + ingredient suppliers. Fixed list — nothing new on re-runs. |
| SupplySide Supplement Journal | Website | 🧪 Trial (2026-08) | Trade media, names companies (incl. European launches). Added via migration 004. |
| mindbodygreen — Best Omega-3 / Memory / Nootropics | Single page (×3) | 🧪 Trial (2026-08) | Editorial "best of" round-ups (multi-brand, static). Added via migration 004. US-leaning; ICP filters. Omega-3 list includes a krill brand (Kori). |
| Well+Good, Everyday Health, Prevention, Verywell Health | Website (×4) | 🧪 Trial (2026-08) | US consumer health media that publish supplement brand round-ups. Added via migration 005. Domain-scoped search; ICP filters to European brands. |

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

## Evaluated — Associations & partnering conferences (from Viola's list, tested 2026-08)

**General finding:** this batch is a poorer fit than the trade shows. **Partnering conferences**
(euroPLX, PharmaSynergy) are private 1-on-1 meeting platforms with **no public company directory**
to read. **CPHI Europe** is a pharma-ingredients show — its exhibitors are API/excipient/CDMO
suppliers, exactly what the ICP excludes. Only **EHPM** exposes a small, static, on-ICP member list.

| Source | Verdict | Why |
|---|---|---|
| **EHPM** (Fed. of Health Product Manufacturers) | ✅ Added — Single page (migration 003) | `ehpm.org/members-list-2/` is a **static** list of ~18 corporate members — a mix of finished-supplement brands (BioGaia, Lifeplus, Forever Living), multinationals (Nestlé, Unilever) and ingredient suppliers (Sabinsa, Barentz) to skip. Small volume, but clean and relevant. Also lists ~15 national associations (not companies). |
| **NutraFood (Poland)** | ⏸️ Hold | Only ~9 **featured** exhibitor logos are static (incl. Aker BioMarine itself, KSM-66, Sirio); the full ~113-exhibitor list is behind a JavaScript catalogue (`catalogue.worldfood.pl`). Low fetchable yield, mixed audience. |
| **euroPLX** | ❌ Can't mine | Private pharma **partnering conference** (pre-arranged 1-on-1 meetings); no public participant list. Focus is drug developers/CDMOs/licensing → off-ICP. |
| **CPHI Europe** | ⏸️ Reject | Exhibitors are pharma **API / excipient / CDMO / packaging** suppliers — excluded by the ICP. Directory is JavaScript (`exhibitors.cphi.com`); aggregators blocked. |
| **PharmaSynergy** | ❌ Can't mine | Private OTC/consumer-health **partnering event** (meeting-mojo platform); no public company directory. Audience (OTC brands adding supplements) is relevant, but there's nothing to extract. |

## Evaluated — Consumer & trend media (from a Perplexity list, tested 2026-08)

**General finding:** consumer "best supplements" media *do* name brands, so they're extractable — but
the brands are overwhelmingly **US** (Nature Made, Thorne, NOW, Garden of Life, OLLY…), so the
Europe-focused ICP rejects most (same lesson as Healthline). The higher-value use of these is as a
source of **trending ingredients → new search terms**, run against our European trade media. One
genuine new *company* source stood out: SupplySide Supplement Journal (trade media, not consumer).

| Source | Verdict | Why |
|---|---|---|
| **SupplySide Supplement Journal** (`supplysidesj.com`) | ✅ Added — Website (migration 004) | Real trade publication covering brand launches, founders, product news — names companies, incl. European brands. Same profile as our other trade-media sources. |
| **mindbodygreen** | ✅ Added — 3 editorial round-ups as Single page (migration 004) | Its **shop** pages are single-brand + JavaScript (rejected). Its **editorial** "best of" articles are static and multi-brand — added best-omega-3 (incl. Kori Krill), best-memory, best-nootropics. US-leaning but on-topic; ICP filters. Decision (2026-08): stop excluding US sources — the ICP handles EU filtering. |
| **Well+Good / Everyday Health / Prevention / Verywell Health** | ✅ Added — Website ×4 (migration 005) | US consumer "best of" media. Added as domain-scoped Website sources (ongoing, catches new round-ups). If a domain search proves thin, swap to a specific editorial round-up page as Single page (as done for mindbodygreen). |
| **Examine / NIH Office of Dietary Supplements** | ❌ Not a source | Ingredient/evidence references only — no company names to extract. |
| **ConsumerLab / Consumer Reports** | ❌ Paywalled | Brand testing behind subscription; not readable. |
| **Google Trends / Spate / Glimpse** | ⛔ Trend platforms | Paid/JS dashboards, no company list. Inspiration for search terms only (Google Trends excluded per request). |
| **TikTok / Instagram / YouTube** | ⛔ Excluded (for now) | Social signal, not validated company data. |

## If trade shows underperform

If the two trials yield few/no matches, the honest conclusion is that **trade shows don't fit the
current pipeline** (their value is locked in JS directories). The better long-term fit would be a
dedicated **"import an exhibitor list"** path — paste company names, or point at a specific static
list/PDF — which bypasses discovery entirely. Not built yet; note it as a candidate feature.

## How to record a new evaluation

When you test a new source, add a row here with the verdict (✅ working / ⚠️ caveat / ⏸️ hold /
❌ rejected) and a one-line reason. Keep the live `sources` table and this log in sync.
