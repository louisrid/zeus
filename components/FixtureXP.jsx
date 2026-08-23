"use client";
import React from "react";
import { T, lang, val } from "../lib/ui";
import Opp from "./Opp";
import { xpWithCaptain } from "../lib/captain.mjs";

/* NEXT FIXTURE AND xP, then the run on demand.
 *
 * The immediately visible thing for any player is who he faces next and what he is projected to score
 * in that fixture. Everything beyond that is one click away, because a row showing five fixtures at
 * once is unreadable and a row showing none is useless.
 *
 * Every number is per fixture. Where a gameweek cannot be scored the cell says so rather than
 * repeating another gameweek's figure, which would look like information and be a lie.
 */

/* xP numbers are not colour-coded. There is no defensible threshold at which 5.0 is "good" and 4.9 is
   not, and having xP shaded on one rule while the run total was shaded on a different rule made two
   adjacent columns contradict each other. Colour is reserved for fixture difficulty, which has a
   defined 0-100 scale behind it. */
const tone = () => T.xp;

export function XpValue({ value, isCaptain = false, size = 14, align = "center" }) {
  const { value: v, doubled } = xpWithCaptain(value, isCaptain);
  if (v === null) return <span style={{ ...val(size, "#FFFFFF"), textAlign: align }}>-</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, justifyContent: align === "center" ? "center" : "flex-start" }}>
      <span style={val(size)}>{v.toFixed(1)}</span>
      {doubled && <span style={val(Math.max(13, size - 2), T.tag, 500)}>×2</span>}
    </span>
  );
}

/* One compact cell: next opponent plus xP for that fixture. This is what sits in every player row. */
/* A total with the number of fixtures it covers, so "next 5" cannot silently be next 1. */
/* A total with the number of fixtures behind it, ALWAYS shown. Showing the count only when it was
   short meant a bare number and a number with "(4)" sat side by side with nothing explaining the
   difference, and a five-fixture total could silently be one fixture. */
export function RunTotal({ total, count, expected = 5 }) {
  if (total === null || total === undefined || !count) return <span style={val(13, "#FFFFFF")}>-</span>;
  // Just the number. The small count appears only when the run is short of the column's promise.
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <span style={val(14)}>{Number(total).toFixed(1)}</span>
      {count < expected && <span style={val(13, "#FFFFFF", 500)}>·{count}</span>}
    </span>
  );
}

export function NextFixtureXP({ fx, xp, scale, size = "sm" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <Opp fx={fx} scale={scale} size={size} showNumber={false} />
      <span style={val(size === "sm" ? 14 : 15, tone(xp))}>
        {xp === null || xp === undefined ? "-" : Number(xp).toFixed(1)}
      </span>
    </span>
  );
}

/* The run: N fixtures, each with its own xP, plus the total. Used on player pages and in the
   expandable row detail. */
export function FixtureRun({ fixtures, xpOf, scale, n = 5, showTotal = true }) {
  const list = (fixtures || []).slice(0, n);
  if (!list.length) return <span style={lang(13.5, 600)}>No fixtures published.</span>;
  const values = list.map((f) => (xpOf ? xpOf(f.gw) : null));
  const scored = values.filter((v) => v !== null && v !== undefined);
  const total = scored.length ? scored.reduce((a, b) => a + Number(b), 0) : null;

  /* Each fixture is its own boxed column: gameweek, opponent, xP, all centred. The previous version was
     left-aligned with no separation, so the numbers ran together and could not be scanned. */
  const Box = ({ children, wide = false }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
      background: T.plate, borderRadius: 12, padding: "8px 6px", minWidth: wide ? 62 : 54 }}>
      {children}
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch", flexWrap: "wrap" }}>
      {list.map((f, i) => (
        <Box key={`${f.gw}-${i}`}>
          <span style={{ ...val(13, "#FFFFFF", 500), textAlign: "center" }}>GW{f.gw}</span>
          <Opp fx={f} scale={scale} size="sm" showNumber={false} />
          <span style={{ ...val(14), textAlign: "center" }}>
            {values[i] === null || values[i] === undefined ? "-" : Number(values[i]).toFixed(1)}
          </span>
        </Box>
      ))}
      {showTotal && total !== null && (
        <Box wide>
          <span style={{ ...val(13, "#FFFFFF", 500), textAlign: "center" }}>{scored.length} GW</span>
          <span style={{ ...val(17), textAlign: "center" }}>{total.toFixed(1)}</span>
        </Box>
      )}
    </div>
  );
}
