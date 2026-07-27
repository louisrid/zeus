"use client";
import React from "react";
import { T, S, Label, lang, code } from "../lib/ui";

/* CHECKS. Replaces the Live Feedback panel, rejected four times.
 *
 * The old panel reported state Louis could already see (positions filled, players missing) and jargon he
 * never asked for, and its heading carried no number. Every row here
 * either recommends an action or names a problem, and a row with nothing to say does not render.
 */
const Row = ({ label, headline, detail, tone = "#FFFFFF" }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "12px 14px",
    borderRadius: S.radiusSm, background: T.row }}>
    <span style={code(13)}>{label}</span>
    <span style={{ ...lang(15.5, 700, tone) }}>{headline}</span>
    {detail && <span style={{ ...lang(13.5, 600), lineHeight: 1.45 }}>{detail}</span>}
  </div>
);

export default function Checks({ captain, risk, budget, shape, metric = "xPTS" }) {
  const rows = [];

  if (captain) {
    rows.push(<Row key="c" label="CAPTAIN" tone={T.tag}
      headline={captain.gain > 0 ? `${captain.name}, ${captain.gain.toFixed(1)} clear` : captain.name}
      detail={captain.gain > 0 ? `Best ${metric} in your eleven.` : `Best ${metric} in your eleven, level with the next.`} />);
  }
  if (risk && risk.count > 0) {
    rows.push(<Row key="r" label="RISK" tone={T.pink}
      headline={risk.count === 1 ? "1 player flagged" : `${risk.count} players flagged`}
      detail={risk.names} />);
  }
  if (budget && budget.upgrade) {
    rows.push(<Row key="b" label="BUDGET" tone={T.green}
      headline={`${budget.left.toFixed(1)} left`}
      detail={`${budget.upgrade.out} to ${budget.upgrade.in} adds ${budget.upgrade.gain.toFixed(1)} ${metric}.`} />);
  } else if (budget && budget.left > 0.05) {
    rows.push(<Row key="b" label="BUDGET" headline={`${budget.left.toFixed(1)} left`}
      detail="No upgrade it buys." />);
  }
  if (shape && shape.gain > 0.05) {
    rows.push(<Row key="s" label="SHAPE" tone={T.green}
      headline={shape.key}
      detail={`Adds ${shape.gain.toFixed(1)} ${metric} over ${shape.current}.`} />);
  }

  if (!rows.length) return null;
  return (
    <aside style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius,
      padding: S.pad, display: "flex", flexDirection: "column", gap: 10 }}>
      <Label color={T.green}>Checks</Label>
      {rows}
    </aside>
  );
}
