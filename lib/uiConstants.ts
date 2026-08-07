import sourcesConfig from "@/config/sources.json";
import type { AddCompanyForm } from "@/lib/uiTypes";

// Set to true to skip the real search and use mock data for demos.
export const DEMO_MODE = false;

// Disables the live "Search for New Companies" button in deployed environments (the real search is
// too long-running for serverless). Set NEXT_PUBLIC_DISABLE_SEARCH=true on Vercel; leave unset locally.
export const SEARCH_DISABLED = process.env.NEXT_PUBLIC_DISABLE_SEARCH === "true";

export const GEOGRAPHIES = ["All", "EU", "UK", "US", "APAC", "Global"];
export const GEO_OPTIONS = ["EU", "UK", "US", "APAC", "Global"];
export const CATEGORIES = ["All", "Premium/science-driven brand", "Pharma Rx", "Established CHC", "Distributor/enabler"];
export const CAT_OPTIONS = CATEGORIES.slice(1);
// Priority tiers. "Enabler" was retired as a tier (distributors are covered by the company category
// "Distributor/enabler"), existing enabler companies were migrated to Follower (migration 020).
export const TIERS = ["All", "Early Mover", "Follower"];

// Hover-tooltip definitions for the filter options (shown when hovering an option in the dropdown).
export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "Premium/science-driven brand": "A consumer brand built on scientific credibility and premium positioning. This is the core Lysoveta target.",
  "Pharma Rx": "A pharmaceutical company with prescription (Rx) products; sells science-backed products via pharmacy and healthcare channels.",
  "Established CHC": "An established consumer-health (CHC / over-the-counter) company with a broad, often mass-market portfolio.",
  "Distributor/enabler": "Resells or brings other brands to market rather than selling its own products (a distributor or market-access enabler).",
};
export const TIER_DESCRIPTIONS: Record<string, string> = {
  "Early Mover": "Strong, ready-now fit: science-driven positioning with the right category and price signals for Lysoveta.",
  "Follower": "A plausible fit likely to adopt after the early movers (includes distributors and enablers).",
};
// Roughly how the point total maps to stars (mirrors the scoring table in config/icp.md).
export const ICP_STAR_POINTS: Record<number, string> = { 1: "0–3 pts", 2: "4–5 pts", 3: "6–7 pts", 4: "8–9 pts", 5: "10–11 pts" };

// Search-configuration preview options, read directly from config/sources.json (one-way: config →
// app), so the UI always mirrors the actual sources and search concepts the code uses.
export const SEARCH_TERM_OPTIONS = Array.from(new Set([
  ...((sourcesConfig as { search_concepts?: string[] }).search_concepts ?? []),
  ...((sourcesConfig as { keyword_bank?: string[] }).keyword_bank ?? []),
]));
export const SOURCE_OPTIONS = ((sourcesConfig as { sources?: { name: string; type?: string; url?: string; market?: string }[] }).sources ?? [])
  .map(s => ({ name: s.name, type: s.type ?? "web site", url: s.url ?? "", market: s.market ?? "", times_used: 0, companies_found: 0, featured: false, last_used_at: null as string | null }));

// Outreach status the user can set per company (migration 015). Values are stored; labels are shown.
export const STATUS_OPTIONS = [
  { value: "not_contacted", label: "Not contacted" },
  { value: "contacted", label: "Contacted" },
  { value: "in_dialogue", label: "In dialogue" },
  { value: "not_interested", label: "Not interested" },
  { value: "not_relevant", label: "Not relevant" },
];

// Blank state for the manual "Add company" form.
export const EMPTY_ADD_FORM: AddCompanyForm = { name: "", website_url: "", geography: ["EU"], product_category: [CAT_OPTIONS[0]], max_price: "", price_currency: "", icp_fit: 3, priority_tier: "", description: "", source_name: "" };

export const AUTH_KEY = "cf_auth"; // localStorage key for the simple pilot login
export const AUTH_MAX_AGE = 14 * 24 * 60 * 60 * 1000; // auto-logout after 2 weeks
