"use client";
import React from "react";
import { T, S, val, lang } from "../lib/ui";

/* One plate for every pitch. The compact form is reserved for substitute benches: one line,
   transparent inside the darker outer bench card, with the name flexing and truncating before xPTS. */
export default function PlayerPlate({
  name, xp, flag = null, captain = false, vice = false, muted = false, width = "100%",
  compact = false, transparent = false,
}) {
  const figure = xp === null || xp === undefined || !Number.isFinite(Number(xp)) ? null : Number(xp);
  const role = (captain || vice) ? (
    <span style={{ width: compact ? 15 : 17, height: compact ? 15 : 17, borderRadius: 9,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      background: captain ? T.tag : "#FFFFFF", ...val(12, "#0D0014", 700) }}>
      {captain ? "C" : "V"}
    </span>
  ) : null;

  if (compact) {
    return (
      <span style={{ width, minWidth: 0, maxWidth: "100%", flex: "1 1 auto",
        display: "flex", alignItems: "center", gap: 5, overflow: "hidden",
        background: transparent ? "transparent" : "rgba(6,0,12,0.86)",
        borderRadius: transparent ? 0 : 8, padding: transparent ? 0 : "3px 6px" }}>
        {flag && <span style={{ display: "flex", flexShrink: 0 }}>{flag}</span>}
        <span style={{ ...lang(12.25, 700, muted ? "rgba(255,255,255,0.55)" : "#FFFFFF"),
          flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap", lineHeight: 1.05 }}>
          {name}
        </span>
        {role}
        {figure === null
          ? <span style={{ ...val(12.75, "rgba(255,255,255,0.45)", 700), flexShrink: 0 }}>-</span>
          : <span style={{ ...val(14.25, T.xp, 800), flexShrink: 0 }}>{figure.toFixed(1)}</span>}
        {captain && figure !== null && <span style={{ ...val(12, T.tag, 700), flexShrink: 0 }}>×2</span>}
      </span>
    );
  }

  return (
    <span style={{ width, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
      background: transparent ? "transparent" : "rgba(6,0,12,0.86)", borderRadius: S.radiusSm,
      padding: transparent ? 0 : "5px 9px 6px", maxWidth: "100%" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: "100%" }}>
        {flag}
        <span style={{ ...lang(13.5, 700, muted ? "rgba(255,255,255,0.55)" : "#FFFFFF"),
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.15 }}>
          {name}
        </span>
        {role}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        {figure === null
          ? <span style={val(14, "rgba(255,255,255,0.45)", 700)}>-</span>
          : <span style={val(16.5, T.xp, 800)}>{figure.toFixed(1)}</span>}
        {captain && figure !== null && <span style={val(12, T.tag, 700)}>×2</span>}
      </span>
    </span>
  );
}
