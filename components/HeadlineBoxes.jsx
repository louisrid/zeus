"use client";
import React from "react";
import { T, lang, val, code } from "../lib/ui";

/* THE HEADLINE BOXES, top-left of the pitch on both the Builder and the Squad screen.
 *
 * On the Builder there is one: live xP, which moves as picks change.
 *
 * On the Squad screen there are two, stacked, because a settled team has a second number that matters
 * as much: how many free transfers are left. A settled team is not a blank slate, so transfers beyond
 * the free ones cost four points each and that deduction belongs in the xP figure rather than in a
 * footnote. The gross figure stays visible above the net one, so it is obvious what the hit cost.
 */
export function XpBox({ label = "xPTS", gross, hit = 0, note }) {
  const net = (Number(gross) || 0) - (Number(hit) || 0);
  return (
    <div style={{ background: T.plate, borderRadius: 14, padding: "14px 18px", minWidth: 148,
      display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={code(13)}>{label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={val(30)}>{net.toFixed(1)}</span>
        {hit > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px",
            borderRadius: 999, background: "#3A0217", ...val(14, T.pink, 500) }}>
            -{hit}
          </span>
        )}
      </span>
      {hit > 0 && <span style={val(13, "#FFFFFF", 500)}>{Number(gross).toFixed(1)} before the hit</span>}
      {note && <span style={lang(13, 600)}>{note}</span>}
    </div>
  );
}

/* Free transfers remaining, and what the next one costs. */
export function FreeTransferBox({ free, made, hitCost = 4 }) {
  const left = Math.max(0, Number(free) - Number(made));
  const overBy = Math.max(0, Number(made) - Number(free));
  return (
    <div style={{ background: T.plate, borderRadius: 14, padding: "14px 18px", minWidth: 148,
      display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={code(13)}>FREE TRANSFERS</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={val(30, left === 0 ? T.pink : "#FFFFFF")}>{left}</span>
        {overBy > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px",
            borderRadius: 999, background: "#3A0217", ...val(14, T.pink, 500) }}>
            -{overBy * hitCost}
          </span>
        )}
      </span>
      <span style={lang(13, 600)}>
        {left > 0
          ? `${made} made this week`
          : `Next one costs ${hitCost} points`}
      </span>
    </div>
  );
}
