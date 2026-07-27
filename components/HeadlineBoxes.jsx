"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";

/* THE HEADLINE BOXES, above the pitch on the left.
 *
 * The score is a readout about the squad, not about the pitch, so it sits above rather than on it. The
 * pitch corners carry the two controls that describe the shape and the money: the formation dropdown on
 * the left and the budget on the right. Putting four things in one corner was the overcrowding to avoid.
 */
export function XpBox({ label = "xPTS", gross, hit = 0, tone = T.xp }) {
  const net = (Number(gross) || 0) - (Number(hit) || 0);
  return (
    <div style={{ background: T.plate, borderRadius: S.radiusSm, padding: "14px 18px", minWidth: 150,
      display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={code(13, tone)}>{label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={val(28, tone)}>{net.toFixed(1)}</span>
        {hit > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px",
            borderRadius: S.radiusSm, background: "#3A0217", ...val(14, T.pink, 500) }}>-{hit}</span>
        )}
      </span>
      {hit > 0 && <span style={val(13, "#FFFFFF", 500)}>{Number(gross).toFixed(1)} before the hit</span>}
    </div>
  );
}

/* Free transfers, and what the next one costs. Squad only: a draft has no transfer history. */
export function FreeTransferBox({ free, made, hitCost = 4 }) {
  const left = Math.max(0, Number(free) - Number(made));
  const over = Math.max(0, Number(made) - Number(free));
  return (
    <div style={{ background: T.plate, borderRadius: S.radiusSm, padding: "14px 18px", minWidth: 150,
      display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={code(13)}>FREE TRANSFERS</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={val(28, left === 0 ? T.pink : "#FFFFFF")}>{left}</span>
        {over > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px",
            borderRadius: S.radiusSm, background: "#3A0217", ...val(14, T.pink, 500) }}>-{over * hitCost}</span>
        )}
      </span>
      <span style={lang(13, 600)}>{left > 0 ? `${made} made` : `Next costs ${hitCost}`}</span>
    </div>
  );
}
