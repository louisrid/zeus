"use client";
import React from "react";
import { T, Plate, lang, val, code } from "../lib/ui";
import Opp from "./Opp";

/* NEXT FIXTURE AND xP, then the run on demand.
 *
 * The immediately visible thing for any player is who he faces next and what he is projected to score
 * in that fixture. Everything beyond that is one click away, because a row showing five fixtures at
 * once is unreadable and a row showing none is useless.
 *
 * Every number is per fixture. Where a gameweek cannot be scored the cell says so rather than
 * repeating another gameweek's figure, which would look like information and be a lie.
 */

const tone = (xp) => (xp === null ? "#FFFFFF" : xp >= 5 ? T.green : xp >= 3 ? "#FFFFFF" : T.pink);

/* One compact cell: next opponent plus xP for that fixture. This is what sits in every player row. */
/* A total with the number of fixtures it covers, so "next 5" cannot silently be next 1. */
export function RunTotal({ total, count, expected = 5 }) {
  if (total === null || total === undefined) return <span style={val(13, "#FFFFFF")}>—</span>;
  const short = count < expected;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={val(13.5, short ? "#FFFFFF" : T.green)}>{Number(total).toFixed(1)}</span>
      {short && <span style={lang(12, 600)}>({count})</span>}
    </span>
  );
}

export function NextFixtureXP({ fx, xp, scale, size = "sm" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <Opp fx={fx} scale={scale} size={size} showNumber={false} />
      <span style={val(size === "sm" ? 13 : 14, tone(xp))}>
        {xp === null || xp === undefined ? "—" : Number(xp).toFixed(1)}
      </span>
    </span>
  );
}

/* The run: N fixtures, each with its own xP, plus the total. Used on player pages and in the
   expandable row detail. */
export function FixtureRun({ fixtures, xpOf, scale, n = 5, showTotal = true }) {
  const list = (fixtures || []).slice(0, n);
  if (!list.length) {
    return <span style={lang(13.5, 600)}>Fixtures not published yet.</span>;
  }
  const values = list.map((f) => (xpOf ? xpOf(f.gw) : null));
  const scored = values.filter((v) => v !== null && v !== undefined);
  const total = scored.length ? scored.reduce((a, b) => a + Number(b), 0) : null;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
      {list.map((f, i) => (
        <span key={`${f.gw}-${i}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={val(12, "#FFFFFF", 500)}>GW{f.gw}</span>
          <Opp fx={f} scale={scale} size="sm" showNumber={false} />
          <span style={val(13.5, tone(values[i]))}>
            {values[i] === null || values[i] === undefined ? "—" : Number(values[i]).toFixed(1)}
          </span>
        </span>
      ))}
      {showTotal && total !== null && (
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginLeft: 4 }}>
          <span style={lang(12, 700)}>{scored.length} GW</span>
          <Plate w={62} color={T.green}>{total.toFixed(1)}</Plate>
        </span>
      )}
      {scored.length < list.length && (
        <span style={{ ...lang(12.5, 600), alignSelf: "center" }}>
          {list.length - scored.length} not scoreable yet
        </span>
      )}
    </div>
  );
}
