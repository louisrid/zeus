"use client";

import { T, S, code, lang, val } from "../lib/ui";

const n1 = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "0.0";

export default function SquadRangeSummary({ result, metric = "xPTS" }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <section data-zeus-feature="squad-range-summary-v1" style={{ maxWidth: 1040, width: "100%", margin: "0 auto",
        border: `1px solid ${T.pink}`, borderRadius: S.radiusSm, background: "#2A0410", padding: 14 }}>
        <span style={lang(14, 600, T.pink)}>{result.error}</span>
      </section>
    );
  }

  return (
    <section data-zeus-feature="squad-range-summary-v1" aria-label="Saved squad gameweek range"
      style={{ maxWidth: 1040, width: "100%", margin: "0 auto", border: `1px solid ${T.line}`,
        borderRadius: S.radius, background: T.card, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={code(13, T.xp)}>GW{result.gw_from}-GW{result.gw_to} OPTIMISED RANGE</span>
        <span style={val(20, T.xp)}>{n1(result.total.net_xpts)} {metric}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
        {result.weekly.map((week) => {
          const captain = (week.players || []).find((player) => player.captain);
          return (
            <div key={week.gw} style={{ borderRadius: S.radiusSm, background: T.plate, border: `1px solid ${T.line}`,
              padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={code(12, T.cyan)}>GW{week.gw} · {week.structure}</span>
                <span style={val(15, T.xp)}>{n1(week.net_xpts)}</span>
              </div>
              <span style={lang(13, 600)}>Captain: {captain?.name || week.captain || "none"}</span>
              <span style={lang(12.5, 600)}>
                {week.chip ? `${week.chip} · ` : ""}gross {n1(week.gross_xpts)} · hit -{n1(week.transfer_hit)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
