"use client";
import React from "react";
import { T, S, val, lang } from "../lib/ui";

/* ONE PLATE, EVERY PITCH.
 *
 * The name and the projection belong in the SAME box. They were drawn three different ways: a name pill with a
 * loose number under it on the line-ups pitch, a split plate on the builder, and something else again on the
 * dashboard. Three pitches, three looks, and none of them was the one that reads best.
 *
 * This is the one that reads best: a single rounded plate, name on top, projection under it in the xPTS colour
 * at a larger size, because the number is what the pitch exists to show. Everything that draws a shirt uses
 * this, so it cannot drift apart again.
 */
export default function PlayerPlate({ name, xp, flag = null, captain = false, vice = false, muted = false, width = "100%" }) {
  const figure = xp === null || xp === undefined || !Number.isFinite(Number(xp)) ? null : Number(xp);
  return (
    <span style={{ width, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
      background: "rgba(6,0,12,0.86)", borderRadius: S.radiusSm, padding: "5px 9px 6px", maxWidth: "100%" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: "100%" }}>
        {flag}
        <span style={{ ...lang(13.5, 700, muted ? "rgba(255,255,255,0.55)" : "#FFFFFF"),
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.15 }}>
          {name}
        </span>
        {(captain || vice) && (
          <span style={{ width: 17, height: 17, borderRadius: 9, display: "flex", alignItems: "center",
            justifyContent: "center", background: captain ? T.tag : "#FFFFFF", ...val(12, "#0D0014", 700) }}>
            {captain ? "C" : "V"}
          </span>
        )}
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
