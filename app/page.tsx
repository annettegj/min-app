"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { AuthScreen } from "@/app/components/common/AuthScreen";
import { HowItWorksTab } from "@/app/components/about/HowItWorksTab";
import { IcpTab } from "@/app/components/icp/IcpTab";
import { CompanyDatabaseTab } from "@/app/components/database/CompanyDatabaseTab";
import { FindCompaniesTab } from "@/app/components/search/FindCompaniesTab";
import { useCompanies } from "@/app/hooks/useCompanies";
import { AUTH_KEY, AUTH_MAX_AGE } from "@/lib/uiConstants";

export default function Home() {
  // Simple pilot login. undefined = still checking localStorage; null = logged out; string = email.
  const [authEmail, setAuthEmail] = useState<string | null | undefined>(undefined);
  const [tab, setTab] = useState<"database" | "search" | "icp" | "prospectus" | "about">("database");

  // --- Company Database domain (state + handlers) ---
  const companiesApi = useCompanies();
  const { savedBySource, loadCompanies } = companiesApi;

  // --- Simple pilot login (against the plain app_users table; not secure) ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) {
        const { email, loginAt } = JSON.parse(raw) as { email?: string; loginAt?: number };
        if (email && loginAt && Date.now() - loginAt < AUTH_MAX_AGE) { setAuthEmail(email); return; }
        localStorage.removeItem(AUTH_KEY); // expired (>2 weeks)
      }
    } catch { /* ignore */ }
    setAuthEmail(null);
  }, []);

  async function login(email: string, password: string): Promise<string | null> {
    const e = email.trim().toLowerCase();
    const { data, error } = await supabase.from("app_users").select("email").eq("email", e).eq("password", password).maybeSingle();
    if (error) return "Something went wrong — please try again.";
    if (!data) return "Wrong email or password.";
    localStorage.setItem(AUTH_KEY, JSON.stringify({ email: e, loginAt: Date.now() }));
    setAuthEmail(e);
    return null;
  }
  async function signup(email: string, password: string): Promise<string | null> {
    const e = email.trim().toLowerCase();
    const { data: existing } = await supabase.from("app_users").select("email").eq("email", e).maybeSingle();
    if (existing) return "That email already has an account — log in instead.";
    const { error } = await supabase.from("app_users").insert({ email: e, password });
    if (error) return "Could not create the account — please try again.";
    localStorage.setItem(AUTH_KEY, JSON.stringify({ email: e, loginAt: Date.now() }));
    setAuthEmail(e);
    return null;
  }
  function logout() {
    localStorage.removeItem(AUTH_KEY);
    setAuthEmail(null);
  }

  if (authEmail === undefined) return null; // still checking localStorage
  if (!authEmail) return <AuthScreen onLogin={login} onSignup={signup} />;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--page)", fontFamily: "Inter, sans-serif" }}>

      {/* Top bar */}
      <div style={{ background: "var(--header)", borderBottom: "3px solid var(--accent)" }}>
        <div className="max-w-screen-2xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex flex-col gap-2" style={{ alignItems: "flex-start" }}>
            <img src="/AKBM logo.png" alt="Aker BioMarine" style={{ height: 52, width: "auto", objectFit: "contain", display: "block" }} />
            <p style={{ color: "var(--white)", fontSize: 20, fontWeight: 700, letterSpacing: "0.01em", marginLeft: 10 }}>Lysoveta Customer Finder</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "var(--on-dark)", fontSize: 12 }}>{authEmail}</span>
            <button type="button" onClick={logout}
              style={{ background: "transparent", color: "var(--white)", border: "1px solid var(--border-on-dark)", borderRadius: 4, padding: "6px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", cursor: "pointer" }}>
              Log out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-screen-2xl mx-auto px-8 flex">
          <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
            {[
              { key: "database", label: "Company Database", soon: false },
              { key: "search", label: "Find New Companies", soon: false },
              { key: "icp", label: "Lysoveta ICP Criteria", soon: false },
              { key: "about", label: "How It Works", soon: false },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as "database" | "search" | "icp" | "prospectus" | "about")}
                style={{
                  padding: "10px 20px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                  borderRadius: 4,
                  background: tab === t.key ? "var(--page)" : "transparent",
                  color: tab === t.key ? "var(--navy)" : "var(--text-faint)",
                  borderTop: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                {t.label}
              </button>
            ))}
            <div style={{ marginLeft: "auto" }}>
              <button
                disabled
                style={{
                  padding: "10px 20px", fontSize: 13, fontWeight: 600, border: "none", cursor: "default",
                  borderRadius: 4,
                  background: "transparent", color: "var(--text-disabled)",
                  borderTop: "2px solid transparent",
                }}
              >
                Company Prospectus (Soon)
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto w-full px-8 py-8 flex-1 flex flex-col gap-6">

        {/* ── TAB 1: Company Database ── */}
        {tab === "database" && <CompanyDatabaseTab api={companiesApi} />}

        {/* ── TAB 2: Find New Companies ── */}
        {tab === "search" && (
          <FindCompaniesTab savedBySource={savedBySource} reloadCompanies={loadCompanies} onGoToDatabase={() => setTab("database")} />
        )}

        {/* ── TAB 3: ICP Criteria ── */}
        {tab === "icp" && <IcpTab authEmail={authEmail} />}

        {/* ── TAB: How It Works ── */}
        {tab === "about" && <HowItWorksTab />}

      </div>

      <footer style={{ borderTop: "1px solid var(--border-card)", padding: "16px 32px", background: "var(--white)" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-faint)" }}>Aker BioMarine — Internal Tool</p>
      </footer>
    </div>
  );
}
