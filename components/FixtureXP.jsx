"use client";
import React from "react";
import { T, S, lang, val } from "../lib/ui";
import Opp from "./Opp";
import { xpWithCaptain } from "../lib/captain.mjs";
import { fmtPts } from "../lib/format.mjs";

/* NEXT FIXTURE AND xP, then the run on demand.
 *
 * The immediately visible thing for any player is who he faces next and what he is projected to score
 * in that fixture. Everything beyond that is one click away, because a row showing five fixtures at
 * once is unreadable and a row showing none is useless.
 *
 * Every number is per fixture. Where a gameweek cannot be scored the cell says so rather than
 * repeating another gameweek's figure, which would look like information and be a lie.
 */

/* xP numbers are not colour-coded BY SIZE. There is no defensible threshold at which 5.0 is "good" and
   4.9 is not. Every xP figure is T.xp, the one colour that means "a projection", so it can never be read
   as a price or a points total beside it; fixture difficulty keeps its own scale on the opponent tag. */
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
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
      <span style={val(14)}>{fmtPts(Number(total))}</span>
      {count < expected && <span style={val(13, "#FFFFFF", 500)}>·{count}</span>}
    </span>
  );
}

export function NextFixtureXP({ fx, xp, scale, size = "sm" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <Opp fx={fx} scale={scale} size={size} showNumber={false} />
      <span style={val(size === "sm" ? 14 : 15, tone(xp))}>
        {xp === null || xp === undefined ? "-" : fmtPts(Number(xp))}
      </span>
    </span>
  );
}

/* The run: N fixtures, each with its own xP, plus the total. Used on player pages and in the
   expandable row detail. */
/* `xrOf`, when given, adds an xR figure under each week's xPTS in xR's own colour. */
export function FixtureRun({ fixtures, xpOf, xrOf = null, scale, n = 5, showTotal = true, tabs = false }) {
  const list = (fixtures || []).slice(0, n);
  if (!list.length) return <span style={lang(13.5, 600)}>No fixtures published.</span>;
  const values = list.map((f) => (xpOf ? xpOf(f.gw) : null));
  const scored = values.filter((v) => v !== null && v !== undefined);
  const total = scored.length ? scored.reduce((a, b) => a + Number(b), 0) : null;

  /* Each fixture is its own boxed column: gameweek, opponent, xP, all centred. The previous version was
     left-aligned with no separation, so the numbers ran together and could not be scanned. */
  /* tabs: the player page's version. Each gameweek is a tinted tab in the same style and size as the xG
     and xA tabs above it (pale tint, 15px label, 30px figure), and the row stretches the full width. */
  /* Each gameweek tab is filled with its fixture difficulty, strongly: deep green easy, pale green
     good, grey middling, pink hard, deep red very hard. The total tab is the xA blue. */
  const FDR_TAB = {
    1: ["#1FC86A", "#002E16"], 2: ["#7CF0AE", "#003D1F"], 3: ["#C9C9D6", "#1E1E2A"],
    4: ["#FF8AA6", "#4D0014"], 5: ["#C8163F", "#FFFFFF"],
  };
  const TOTAL_TAB = ["#6CCBFF", "#00304F"];
  const tabColours = (f) => {
    /* difficultyOf gives 0 (easiest) to 100 (hardest); five equal bands, the same scale as the dots. */
    const d = f && scale && typeof scale.difficultyOf === "function" ? scale.difficultyOf(f.oppId, f.home) : null;
    const n = d && Number.isFinite(Number(d.difficulty)) ? Number(d.difficulty) : 50;
    return FDR_TAB[n < 20 ? 1 : n < 40 ? 2 : n < 60 ? 3 : n < 80 ? 4 : 5];
  };
  const Box = ({ children, wide = false, fx = null }) => {
    const [bg, ink] = wide ? TOTAL_TAB : tabColours(fx);
    return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: tabs ? "flex-start" : "center", justifyContent: "center", gap: tabs ? S.gapXs : 4,
      color: tabs ? ink : undefined,
      background: tabs ? bg : T.plate, borderRadius: S.radiusSm, padding: tabs ? "12px 16px" : "8px 6px",
      minWidth: tabs ? 0 : (wide ? 62 : 54), flex: tabs ? "1 1 0" : "0 0 auto" }}>
      {children}
    </div>
    );
  };

  return (
    <div className={tabs ? "zeus-fx-tabs" : undefined} style={tabs ? undefined : { display: "flex", gap: 6, alignItems: "stretch", flexWrap: "wrap" }}>
      {list.map((f, i) => (
        <Box key={`${f.gw}-${i}`} fx={f}>
          <span style={{ ...(tabs ? lang(15, 700, tabColours(f)[1]) : val(13, "#FFFFFF", 500)), textAlign: tabs ? "left" : "center" }}>GW{f.gw}{tabs && f.opp ? ` · ${f.opp}${f.home ? " (H)" : " (A)"}` : ""}</span>
          {!tabs && <Opp fx={f} scale={scale} size="sm" showNumber={false} />}
          <span style={{ ...(tabs ? val(30, tabColours(f)[1], 700) : val(14, T.xp)), textAlign: tabs ? "left" : "center" }}>
            {values[i] === null || values[i] === undefined ? "-" : fmtPts(Number(values[i]))}
            {xrOf && values[i] !== null && values[i] !== undefined && (() => {
              const xr = xrOf(f.gw);
              return xr === null || xr === undefined ? null : (
                <span style={{ ...val(12, T.xr), display: "block", lineHeight: 1.1 }} title="xR">
                  {fmtPts(Number(xr))}
                </span>
              );
            })()}
          </span>
        </Box>
      ))}
      {showTotal && total !== null && (
        <Box wide>
          <span style={{ ...(tabs ? lang(15, 700, TOTAL_TAB[1]) : val(13, "#FFFFFF", 500)), textAlign: tabs ? "left" : "center" }}>{scored.length} GW total</span>
          <span style={{ ...(tabs ? val(30, TOTAL_TAB[1], 700) : val(17, T.xp)), textAlign: tabs ? "left" : "center" }}>{fmtPts(total)}</span>
        </Box>
      )}
    </div>
  );
}
