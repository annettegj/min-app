"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inputStyle } from "@/lib/styles";

// A dropdown with a checkbox per option — the multi-value counterpart to a native <select>.
// value/onChange work with a string[] (the selected options). Closes on outside click or Escape.
// The option list is rendered in a PORTAL (fixed-positioned to the trigger) so it can never be
// clipped by an ancestor's `overflow: hidden` (filter panel, modal body, result card, …).
export function MultiSelect({ options, value, onChange, placeholder = "Select…", disabled = false }: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
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

  return (
    <>
      <button ref={triggerRef} type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        style={{ ...inputStyle, textAlign: "left", cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, opacity: disabled ? 0.6 : 1 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: value.length === 0 ? "var(--text-faint)" : "var(--navy)" }}>{summary}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && rect && typeof document !== "undefined" && createPortal(
        <div ref={menuRef}
          style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 2000, background: "var(--white)", border: "1px solid var(--border-input)", borderRadius: 4, boxShadow: "0 8px 24px rgba(12,28,46,0.18)", maxHeight: 260, overflowY: "auto", padding: "4px 0" }}>
          {options.map((opt) => {
            const checked = value.includes(opt);
            return (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 13, color: "var(--text)", cursor: "pointer", background: checked ? "var(--surface-input)" : "transparent" }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(opt)}
                  style={{ accentColor: "var(--accent)", width: 15, height: 15, flexShrink: 0 }} />
                {opt}
              </label>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
