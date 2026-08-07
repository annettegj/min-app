import { useState } from "react";
import { labelStyle, inputStyle, btnPrimary } from "@/lib/styles";

// Simple pilot login screen (NOT secure, see migration 011). Calls back to the parent to log in /
// create an account against the plain app_users table; the callbacks return an error string or null.
export function AuthScreen({ onLogin, onSignup }: { onLogin: (e: string, p: string) => Promise<string | null>; onSignup: (e: string, p: string) => Promise<string | null> }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email.trim() || !password) { setError("Enter an email and a password."); return; }
    setBusy(true); setError("");
    const err = mode === "login" ? await onLogin(email, password) : await onSignup(email, password);
    if (err) { setError(err); setBusy(false); } // on success the parent swaps to the app
  };
  return (
    <div style={{ minHeight: "100vh", background: "var(--page)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: "var(--white)", border: "1px solid var(--border-card)", borderRadius: 4, overflow: "hidden", maxWidth: 420, width: "100%", boxShadow: "0 12px 40px rgba(12,28,46,0.12)" }}>
        <div style={{ background: "var(--header)", padding: "18px 24px", borderBottom: "3px solid var(--accent)" }}>
          <p style={{ color: "var(--white)", fontSize: 18, fontWeight: 700 }}>Lysoveta Customer Finder</p>
        </div>
        <div style={{ padding: "24px 26px" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
            {(["login", "signup"] as const).map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(""); }}
                style={{ flex: 1, padding: "8px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: mode === m ? "var(--accent)" : "var(--surface)", color: mode === m ? "var(--white)" : "var(--text-slate)" }}>
                {m === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} autoFocus onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="you@company.com" style={{ ...inputStyle, marginBottom: 12 }} />
          <label style={labelStyle}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="Lysoveta123" style={inputStyle} />
          {error && <p style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 10 }}>{error}</p>}
          <button type="button" onClick={submit} disabled={busy} style={{ ...btnPrimary, width: "100%", marginTop: 16, padding: "11px", opacity: busy ? 0.6 : 1 }}>
            {busy ? "…" : mode === "login" ? "Log in →" : "Create account →"}
          </button>
          <div style={{ background: "var(--banner-warn-bg)", border: "1px solid var(--banner-warn-border)", borderRadius: 4, padding: "10px 12px", marginTop: 16 }}>
            <p style={{ fontSize: 11.5, color: "var(--banner-warn-text)", lineHeight: 1.55 }}>
              This is a pilot login with <strong>no real security yet</strong>, please don&apos;t reuse a password you use elsewhere. Pick something simple like <strong>Lysoveta123</strong>. Proper security is handled at handover.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
