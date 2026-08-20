"use client";

import { T, S, code, val } from "../lib/ui";

const n1 = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "0.0";

export default function ProjectedScoreBreakdown({ breakdown, metric = "" }) {
  if (!breakdown) return null;
  const rows = [
    ["STARTING XI", breakdown.startingXpts, T.xp],
    [breakdown.captainMultiplier === 3 ? "TRIPLE CAPTAIN" : "CAPTAIN BONUS", breakdown.captainBonus, T.xp],
  ];
  if (breakdown.benchBoostBonus > 0 || breakdown.chip === "benchboost") {
    rows.push(["BENCH BOOST", breakdown.benchBoostBonus, T.green]);
  }
  if (breakdown.transferHit > 0) rows.push(["TRANSFER COST", -breakdown.transferHit, T.pink]);
  if (breakdown.wildcardSaving > 0) rows.push(["WILDCARD SAVED", breakdown.wildcardSaving, T.green]);
  rows.push([`NET ${metric}`, breakdown.netXpts, T.xp]);

  return (
    <section data-zeus-feature="projected-score-breakdown-v1" aria-label="Projected score breakdown"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(125px, 100%), 1fr))", gap: 8,
        width: "100%", maxWidth: 1040, margin: "0 auto" }}>
      {rows.map(([label, value, tone], index) => (
        <div key={`${label}-${index}`} style={{ minHeight: 54, borderRadius: S.radiusSm,
          background: label.startsWith("NET ") ? T.row : T.plate,
          border: `1px solid ${label === "TRANSFER COST" ? T.pink : T.line}`,
          padding: "8px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
          <span style={code(12)}>{label}</span>
          <span style={val(17, tone)}>{Number(value) > 0 && label !== "STARTING XI" && !label.startsWith("NET ") ? "+" : ""}{n1(value)}</span>
        </div>
      ))}
    </section>
  );
}
