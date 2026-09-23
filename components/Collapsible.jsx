"use client";
import React from "react";
import { T, S, lang } from "../lib/ui";
import { usePersistentState } from "../lib/use-persistent-state.jsx";

/* ONE WAY TO FOLD A SECTION.
 *
 * Long tables and long lists were either always open, filling a screen before the thing you came for,
 * or folded in two different home-made ways. This is the one fold: a header row with the title on the
 * left, an optional count, and SHOW or HIDE with a chevron on the right; the whole row is the button.
 * The open state is remembered per key so a section stays how you left it. Nothing inside it renders
 * while closed, so a closed table costs nothing. */
export default function Collapsible({ id, title, count = null, defaultOpen = false, accent = T.text, children }) {
  const [open, setOpen] = usePersistentState(`fold.${id}`, defaultOpen);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gapSm }}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={Boolean(open)}
        className="fb-press zeus-fold"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
          minHeight: S.ctrl, padding: `0 ${S.gapSm}px 0 0`, background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left", borderRadius: S.radiusXs }}>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: S.gapSm, minWidth: 0 }}>
          <span style={{ ...lang(15, 700, accent), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          {count !== null && count !== undefined && <span style={{ ...lang(13, 600), opacity: 0.85 }}>{count}</span>}
        </span>
        <span aria-hidden="true" style={{ ...lang(12.5, 700, accent), display: "inline-flex", alignItems: "center", gap: S.gapXs, flexShrink: 0 }}>
          {open ? "Hide" : "Show"}
          <span className="zeus-fold-chevron" style={{ display: "inline-block", transform: open ? "rotate(180deg)" : "none" }}>⌄</span>
        </span>
      </button>
      {open && children}
    </div>
  );
}
