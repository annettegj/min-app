"use client";

import { useState, useMemo } from "react";
import companiesData from "@/data/companies.json";

const GEOGRAPHIES = ["All", "Norway", "Nordics", "Europe", "Global"];

type Company = {
  id: number;
  name: string;
  geography: string;
  productCategory: string;
  revenue: number;
  averagePrice: number;
  icpFit: number;
};

const companies: Company[] = companiesData;

export default function Home() {
  const [geography, setGeography] = useState("Alle");
  const [category, setCategory] = useState("");
  const [revenueMin, setRevenueMin] = useState("");
  const [revenueMax, setRevenueMax] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [icpMin, setIcpMin] = useState(1);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "done">("idle");
  const [searchParams, setSearchParams] = useState<null | {
    geography: string; category: string;
    revenueMin: string; revenueMax: string;
    priceMin: string; priceMax: string;
    icpMin: number;
  }>(null);

  const results = useMemo(() => {
    if (!searchParams) return [];
    return companies.filter((c) => {
      if (searchParams.geography !== "All" && c.geography !== searchParams.geography) return false;
      if (searchParams.category && !c.productCategory.toLowerCase().includes(searchParams.category.toLowerCase())) return false;
      if (searchParams.revenueMin && c.revenue < Number(searchParams.revenueMin)) return false;
      if (searchParams.revenueMax && c.revenue > Number(searchParams.revenueMax)) return false;
      if (searchParams.priceMin && c.averagePrice < Number(searchParams.priceMin)) return false;
      if (searchParams.priceMax && c.averagePrice > Number(searchParams.priceMax)) return false;
      if (c.icpFit < searchParams.icpMin) return false;
      return true;
    });
  }, [searchParams]);

  function handleSearch() {
    setSearchState("loading");
    setSearchParams(null);
    setTimeout(() => {
      setSearchParams({ geography, category, revenueMin, revenueMax, priceMin, priceMax, icpMin });
      setSearchState("done");
    }, 500);
  }

  const icpColor = (score: number) =>
    score >= 4 ? "#16a34a" : score === 3 ? "#d97706" : "#dc2626";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F4F5FA", fontFamily: "Inter, sans-serif" }}>

      {/* Top bar */}
      <div style={{ background: "#1A2456", borderBottom: "3px solid #4A63D8" }}>
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div style={{ width: 3, height: 28, background: "#7B6FDE" }} />
            <div>
              <p style={{ color: "#A0AECF", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Aker BioMarine</p>
              <p style={{ color: "#FFFFFF", fontSize: 22, fontWeight: 700, letterSpacing: "0.01em" }}>Customer Finder</p>
            </div>
          </div>
          <p style={{ color: "#A0AECF", fontSize: 12 }}>ICP &amp; Prospecting Tool</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-8 py-8 flex-1 flex flex-col gap-6">

        {/* Filter panel */}
        <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8" }}>
          <div style={{ background: "#2E3F80", padding: "12px 20px" }}>
            <p style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 700, letterSpacing: "0.02em" }}>Search Criteria</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0" style={{ borderTop: "1px solid #E4E7F2" }}>

            {/* Geography */}
            <div style={{ padding: "18px 20px", borderRight: "1px solid #E4E7F2", borderBottom: "1px solid #E4E7F2" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4A63D8", marginBottom: 8 }}>Geography</label>
              <select
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                style={{ width: "100%", border: "1px solid #C4CAE8", padding: "8px 10px", fontSize: 13, color: "#1A2456", background: "#FAFBFF", outline: "none" }}
              >
                {GEOGRAPHIES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>

            {/* Product category */}
            <div style={{ padding: "18px 20px", borderRight: "1px solid #E4E7F2", borderBottom: "1px solid #E4E7F2" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4A63D8", marginBottom: 8 }}>Product Category</label>
              <input
                type="text"
                placeholder="E.g. SaaS, Retail…"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: "100%", border: "1px solid #C4CAE8", padding: "8px 10px", fontSize: 13, color: "#1A2456", background: "#FAFBFF", outline: "none" }}
              />
            </div>

            {/* ICP fit */}
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #E4E7F2" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4A63D8", marginBottom: 8 }}>
                ICP Fit — minimum: <span style={{ color: "#1A2456" }}>{icpMin}/5</span>
              </label>
              <input
                type="range" min={1} max={5} value={icpMin}
                onChange={(e) => setIcpMin(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#4A63D8" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#A0AECF", marginTop: 4 }}>
                {[1,2,3,4,5].map(n => <span key={n}>{n}</span>)}
              </div>
            </div>

            {/* Revenue */}
            <div style={{ padding: "18px 20px", borderRight: "1px solid #E4E7F2" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4A63D8", marginBottom: 8 }}>Revenue (MNOK)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" placeholder="Min" value={revenueMin}
                  onChange={(e) => setRevenueMin(e.target.value)}
                  style={{ width: "100%", border: "1px solid #C4CAE8", padding: "8px 10px", fontSize: 13, color: "#1A2456", background: "#FAFBFF", outline: "none" }} />
                <input type="number" placeholder="Max" value={revenueMax}
                  onChange={(e) => setRevenueMax(e.target.value)}
                  style={{ width: "100%", border: "1px solid #C4CAE8", padding: "8px 10px", fontSize: 13, color: "#1A2456", background: "#FAFBFF", outline: "none" }} />
              </div>
            </div>

            {/* Average price */}
            <div style={{ padding: "18px 20px", borderRight: "1px solid #E4E7F2" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4A63D8", marginBottom: 8 }}>Avg. Price (NOK)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" placeholder="Min" value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  style={{ width: "100%", border: "1px solid #C4CAE8", padding: "8px 10px", fontSize: 13, color: "#1A2456", background: "#FAFBFF", outline: "none" }} />
                <input type="number" placeholder="Max" value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  style={{ width: "100%", border: "1px solid #C4CAE8", padding: "8px 10px", fontSize: 13, color: "#1A2456", background: "#FAFBFF", outline: "none" }} />
              </div>
            </div>

          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleSearch}
            style={{ background: "#0891B2", color: "#FFFFFF", border: "none", padding: "12px 36px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#0670A0")}
            onMouseLeave={e => (e.currentTarget.style.background = "#0891B2")}
          >
            Find Companies →
          </button>
        </div>

        {/* Results */}
        {searchState === "loading" && (
          <p style={{ color: "#4A63D8", fontSize: 13 }}>Fetching companies…</p>
        )}

        {searchState === "done" && (
          <div style={{ background: "#FFFFFF", border: "1px solid #D0D5E8" }}>
            <div style={{ background: "#2E3F80", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 700, letterSpacing: "0.02em" }}>Results</p>
              <p style={{ color: "#A0BEFF", fontSize: 12 }}>{results.length} {results.length !== 1 ? "companies" : "company"} found</p>
            </div>

            {results.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#A0AECF", fontSize: 13 }}>
                No companies match the selected filters.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#EEF0FA", borderBottom: "1px solid #D0D5E8" }}>
                    {["Company", "Geography", "Category", "Revenue", "Avg. Price", "ICP Fit"].map(h => (
                      <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4A63D8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #E4E7F2", background: i % 2 === 0 ? "#FFFFFF" : "#FAFBFF" }}>
                      <td style={{ padding: "14px 20px", fontWeight: 600, color: "#1A2456" }}>{c.name}</td>
                      <td style={{ padding: "14px 20px", color: "#4B5563" }}>{c.geography}</td>
                      <td style={{ padding: "14px 20px", color: "#4B5563" }}>{c.productCategory}</td>
                      <td style={{ padding: "14px 20px", color: "#4B5563" }}>{c.revenue} MNOK</td>
                      <td style={{ padding: "14px 20px", color: "#4B5563" }}>{c.averagePrice.toLocaleString("nb-NO")} NOK</td>
                      <td style={{ padding: "14px 20px", fontWeight: 700, color: icpColor(c.icpFit) }}>{c.icpFit}/5</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #D0D5E8", padding: "16px 32px", background: "#FFFFFF" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#A0AECF" }}>Aker BioMarine — Internal Tool</p>
      </footer>
    </div>
  );
}
