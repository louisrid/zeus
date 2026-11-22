"use client";
import React from "react";
import Link from "next/link";
import { T, S, Kit, ClubBar, Value, lang, code, usePaged, ShowMore } from "../lib/ui";
import Opp from "./Opp";
import { SORT_KEYS, metricColor, formatMetric, sortArrow } from "../lib/sorting.mjs";

/* A TABLE CANNOT BECOME A PHONE SCREEN.
 *
 * The desktop players table is eleven grid tracks totalling roughly 1330px. There is no honest way to
 * fit that on a 390px screen: shrinking the columns makes every number unreadable, and a horizontal
 * scroll means the player's name leaves the screen the moment you go looking for his ownership, so you
 * are reading a row of digits with no idea whose they are.
 *
 * So the row becomes a card. The same data, reorganised for a shape that is tall rather than wide:
 * identity and the metric you sorted by on the top line, the three fixtures beneath, and the remaining
 * numbers in a grid that wraps. Nothing is dropped, and the sorted column is promoted so the list still
 * reads as a ranking rather than an unordered pile.
 */

/* Which numbers earn a place on a small card, in order. The rest stay available through sorting, which
   promotes any of them to the headline slot. */
/* Every figure the desktop table shows, in the same order, four to a row. Short labels so each fits. */
const SHORT = { PTS_LAST_YEAR: "PTS LAST YR", PTS_THIS_YEAR: "PTS THIS YR", GAMETIME: "MINS %", OWNERSHIP: "OWNED %", XGA: "xG+xA", DEFCON: "DEFCON /90" };
const CARD_METRICS = SORT_KEYS.map((k) => k.key);

export default function MobilePlayerList({ list, sort, onSort, readers, fixturesOf, scale, defconColour }) {
  const { visible, remaining, more } = usePaged(list, 40);
  const [openSort, setOpenSort] = React.useState(false);
  const sortLabel = (SORT_KEYS.find((k) => k.key === sort.key) || SORT_KEYS[0]).label;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Sorting is the whole point of this screen, so it gets a control rather than a hidden header
          row. A phone has no column headers to tap. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => setOpenSort((v) => !v)}
          aria-expanded={openSort}
          className="zeus-sort-bar"
          style={{ flex: 1, height: S.ctrl, borderRadius: S.radiusSm, background: T.card,
            border: `1px solid ${T.line}`, display: "flex", alignItems: "center",
            justifyContent: "space-between", padding: "0 14px" }}>
          <span style={{ ...code(13, "#FFFFFF"), fontWeight: 700 }}>SORT</span>
          <span style={{ ...code(13, "var(--tag)"), fontWeight: 700 }}>{sortLabel}{sortArrow(sort, sort.key)}</span>
        </button>
      </div>

      {openSort && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6,
          background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radiusSm, padding: 10 }}>
          {SORT_KEYS.map((k) => {
            const active = sort.key === k.key;
            return (
              <button key={k.key} type="button"
                onClick={() => { onSort(k.key); setOpenSort(false); }}
                className={active ? "zeus-sort-choice zeus-sort-choice-on" : "zeus-sort-choice"}
                style={{ height: S.ctrl, borderRadius: S.radiusXs, padding: "0 10px",
                  background: active ? "var(--tag)" : "transparent",
                  border: `1px solid ${active ? "var(--tag)" : T.line}`,
                  ...code(13, active ? "#000000" : "#FFFFFF"), fontWeight: 700, textAlign: "center" }}>
                {k.label}
              </button>
            );
          })}
        </div>
      )}

      {visible.map((p) => {
        const fx = fixturesOf(p);
        const headline = readers[sort.key] ? readers[sort.key](p) : null;
        const headlineColour = sort.key === "DEFCON" && defconColour
          ? defconColour(p) : metricColor(sort.key);
        return (
          <Link key={p.fpl_id} href={`/player/${p.fpl_id}`} style={{ textDecoration: "none" }}>
            <article
              style={{ background: T.row, border: `1px solid ${T.line}`, borderRadius: S.radiusSm,
                padding: "11px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ClubBar team={p.team} height={26} />
                <Kit team={p.team} size={24} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ ...lang(15, 700), display: "block", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                  <span style={{ ...lang(12, 500) }}>{p.team} · {p.position}</span>
                </span>
                {/* The sorted metric is the reason this player is where he is in the list, so it is the
                    one number given room. */}
                <span style={{ textAlign: "right", flexShrink: 0 }}>
                  <span style={{ ...code(12, "#FFFFFF"), display: "block" }}>
                    {sortLabel}
                  </span>
                  <Value size={17} color={headlineColour}>{formatMetric(sort.key, headline)}</Value>
                </span>
              </div>

              {fx.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {fx.map((f, i) => <Opp key={i} fx={f} scale={scale} size="sm" />)}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
                {CARD_METRICS.filter((key) => key !== sort.key).map((key) => {
                  const meta = SORT_KEYS.find((k) => k.key === key);
                  const colour = key === "DEFCON" && defconColour ? defconColour(p) : metricColor(key);
                  return (
                    <span key={key} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ ...code(12, "#FFFFFF"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{SHORT[key] || meta.label}</span>
                      <Value box fill size={13} color={colour}>
                        {formatMetric(key, readers[key] ? readers[key](p) : null)}
                      </Value>
                    </span>
                  );
                })}
              </div>
            </article>
          </Link>
        );
      })}
      <ShowMore remaining={remaining} onMore={more} />
    </div>
  );
}
