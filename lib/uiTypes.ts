import type { ExpectedCategory } from "@/lib/icpTest";

// Shared UI types for the Customer Finder front-end.

export type Company = {
  id: number;
  name: string;
  geography: string;
  product_category: string;
  max_price: number | null;
  price_currency: string | null;
  icp_fit: number;
  website_url?: string;
  source_name?: string;
  description?: string;
  priority_tier?: string | null;
  rejected?: boolean;
  added?: boolean;
  added_at?: string | null;
  enriched_at?: string | null;
  status?: string | null;
};

export type SearchResult = {
  name: string;
  website_url: string;
  description: string;
  priority_tier?: string | null;
  icp_score?: number | null;
  geography?: string | null;
  product_category?: string | null;
  max_price_eur?: number | null;
  price_currency?: string | null;
  selected: boolean;
};

// Omit the single-value geography/product_category from SearchResult so we can re-type them as lists.
export type PendingCompany = Omit<SearchResult, "geography" | "product_category"> & {
  // geography + product_category are multi-value (comma-separated in the DB), held as lists in memory.
  geography: string[];
  product_category: string[];
  max_price: string;
  icp_fit: number;
};

export type EditDraft = {
  // geography + product_category are multi-value (held as lists; joined to a comma string on save).
  geography: string[]; product_category: string[]; max_price: string; price_currency: string;
  icp_fit: number; priority_tier: string; website_url: string; description: string;
};

// Search-configuration draft types (edit mode edits a local draft; Save commits the diff).
export type SourceFields = { name: string; type: "web site" | "web page" | "youtube"; url: string; search_prefix: string; note: string; market: string; featured: boolean };
export type SourceRecord = SourceFields & { id: number; times_used: number; companies_found: number };
export type DraftTerm = { key: string; id: number | null; term: string; is_default: boolean };
export type DraftSource = SourceFields & { key: string; id: number | null; times_used?: number; companies_found?: number };

// The manual "Add company" form shape.
export type AddCompanyForm = {
  // geography + product_category are multi-value (held as lists; joined to a comma string on save).
  name: string; website_url: string; geography: string[]; product_category: string[];
  max_price: string; price_currency: string; icp_fit: number; priority_tier: string;
  description: string; source_name: string;
};

// Line-level diff segment (used when showing what the AI changed in an ICP draft).
export type DiffSeg = { type: "equal" | "add" | "remove"; text: string };

// One row of the "test on example companies" result table.
export type IcpTestRow = { name: string; icp_score: number; priority_tier: string; geography: string; product_category: string; included: boolean; reason: string; expected: ExpectedCategory };
