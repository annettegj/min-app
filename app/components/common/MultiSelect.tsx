"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inputStyle } from "@/lib/styles";

// A dropdown with a checkbox per option — the multi-value counterpart to a native <select>.
// value/onChange work with a string[] (the selected options). Closes on outside click or Escape.
// The option list is rendered in a PORTAL (fixed-positioned to the trigger) so it can never be
// clipped by an ancestor's `overflow: hidden` (filter panel, modal body, result card, …).
export function MultiSelect({ options, value, onChange, placeholder = "Select…", disabled = false, descriptions, searchable }: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  // Optional per-option tooltip text (shown on hover) — e.g. a definition of each category/tier.
  descriptions?: Record<string, string>;
  // Show a search box at the top of the dropdown (auto-on for long lists) to filter options by name.
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [hover, setHover] = useState<{ text: string; top: number; left: number; flip: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  useLayoutEffect(() => { if (open) reposition(); }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    function onReflow() { reposition(); }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    // capture: true so we also catch scrolls inside nested scroll containers (modal body, table).
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);

  const summary = value.length === 0 ? placeholder : value.join(", ");
  const showSearch = searchable ?? options.length > 8;
  const q = query.trim().toLowerCase();
  const shownOptions = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  return (
    <>
      <button ref={triggerRef} type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        style={{ ...inputStyle, textAlign: "left", cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, opacity: disabled ? 0.6 : 1 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: value.length === 0 ? "var(--text-faint)" : "var(--navy)" }}>{summary}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && rect && typeof document !== "undefined" && createPortal(
        <>
        <div ref={menuRef}
          style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 2000, background: "var(--white)", border: "1px solid var(--border-input)", borderRadius: 4, boxShadow: "0 8px 24px rgba(12,28,46,0.18)", maxHeight: 300, overflowY: "auto", padding: "4px 0" }}>
          {showSearch && (
            <div style={{ padding: "6px 8px", position: "sticky", top: 0, background: "var(--white)", borderBottom: "1px solid var(--border-light)" }}>
              <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
                style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
            </div>
          )}
          {shownOptions.length === 0 && <p style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-faint)" }}>No matches.</p>}
          {shownOptions.map((opt) => {
            const checked = value.includes(opt);
            const desc = descriptions?.[opt];
            return (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 13, color: "var(--text)", cursor: "pointer", background: checked ? "var(--surface-input)" : "transparent" }}
                onMouseEnter={desc ? (e) => { const r = e.currentTarget.getBoundingClientRect(); const flip = r.right + 8 + 260 > window.innerWidth; setHover({ text: desc, top: r.top, left: flip ? r.left - 8 : r.right + 8, flip }); } : undefined}
                onMouseLeave={desc ? () => setHover(null) : undefined}>
                <input type="checkbox" checked={checked} onChange={() => toggle(opt)}
                  style={{ accentColor: "var(--accent)", width: 15, height: 15, flexShrink: 0 }} />
                {opt}
              </label>
            );
          })}
        </div>
        {hover && (
          <div style={{ position: "fixed", top: hover.top, left: hover.left, transform: hover.flip ? "translateX(-100%)" : undefined, maxWidth: 260, zIndex: 2100, background: "var(--navy)", color: "var(--white)", fontSize: 12, lineHeight: 1.5, padding: "8px 10px", borderRadius: 4, boxShadow: "0 8px 24px rgba(12,28,46,0.28)", pointerEvents: "none" }}>
            {hover.text}
          </div>
        )}
        </>,
        document.body
      )}
    </>
  );
}
