import sourcesConfig from "@/config/sources.json";

// Set to true to skip the real search and use mock data for demos.
export const DEMO_MODE = false;

// Disables the live "Search for New Companies" button in deployed environments (the real search is
// too long-running for serverless). Set NEXT_PUBLIC_DISABLE_SEARCH=true on Vercel; leave unset locally.
export const SEARCH_DISABLED = process.env.NEXT_PUBLIC_DISABLE_SEARCH === "true";

export const GEOGRAPHIES = ["All", "EU", "UK", "US", "APAC", "Global"];
export const GEO_OPTIONS = ["EU", "UK", "US", "APAC", "Global"];
export const CATEGORIES = ["All", "Premium/science-driven brand", "Pharma Rx", "Established CHC", "Distributor/enabler"];
export const CAT_OPTIONS = CATEGORIES.slice(1);
export const TIERS = ["All", "Early Mover", "Follower", "Enabler"];

// Search-configuration preview options — read directly from config/sources.json (one-way: config →
// app), so the UI always mirrors the actual sources and search concepts the code uses.
export const SEARCH_TERM_OPTIONS = Array.from(new Set([
  ...((sourcesConfig as { search_concepts?: string[] }).search_concepts ?? []),
  ...((sourcesConfig as { keyword_bank?: string[] }).keyword_bank ?? []),
]));
export const SOURCE_OPTIONS = ((sourcesConfig as { sources?: { name: string; type?: string; url?: string; market?: string }[] }).sources ?? [])
  .map(s => ({ name: s.name, type: s.type ?? "web site", url: s.url ?? "", market: s.market ?? "", times_used: 0, companies_found: 0 }));

// Outreach status the user can set per company (migration 015). Values are stored; labels are shown.
export const STATUS_OPTIONS = [
  { value: "not_contacted", label: "Not contacted" },
  { value: "contacted", label: "Contacted" },
  { value: "in_dialogue", label: "In dialogue" },
  { value: "not_relevant", label: "Not relevant" },
];

// Blank state for the manual "Add company" form.
export const EMPTY_ADD_FORM = { name: "", website_url: "", geography: "EU", product_category: CAT_OPTIONS[0], max_price: "", price_currency: "", icp_fit: 3, priority_tier: "", description: "", source_name: "" };

export const AUTH_KEY = "cf_auth"; // localStorage key for the simple pilot login
export const AUTH_MAX_AGE = 14 * 24 * 60 * 60 * 1000; // auto-logout after 2 weeks
