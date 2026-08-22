"use client";
import React from "react";
import { T, Kit, Label, BudgetPill, WarnFlag } from "../lib/ui";
import PlayerPlate from "./PlayerPlate";
import Opp from "./Opp";
import BenchPlayerCard from "./BenchPlayerCard";

const GRASS = "repeating-linear-gradient(0deg, #0B5A2E 0px, #0B5A2E 44px, #0A5029 44px, #0A5029 88px)";

/* Shared 15-man pitch. The four substitutes always occupy one shared compact bench grid. */
export default function Pitch({ squad, oppOf, scale, xpOf = null }) {
  const players = Array.isArray(squad) ? squad : [];
  const spend = players.reduce((total, player) => total + (Number(player.price) || 0), 0);
  const xi = players.slice(0, 11);
  const bench = players.slice(11, 15);
  const rows = ["FWD", "MID", "DEF", "GKP"]
    .map((position) => xi.filter((player) => player.position === position))
    .filter((row) => row.length > 0);

  return (
    <div style={{ position: "relative", background: GRASS, border: `1px solid ${T.line}`, borderRadius: 18,
      padding: "26px 18px 16px", display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
      <span style={{ position: "absolute", top: 14, right: 16, zIndex: 2, display: "flex",
        flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <BudgetPill spend={spend} />
      </span>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 22,
        paddingBottom: 8, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -70, left: "50%", transform: "translateX(-50%)",
          width: "min(190px, 52%)", height: 132, border: "2px solid rgba(255,255,255,0.25)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "min(300px, 82%)", height: 56, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "min(128px, 35%)", height: 24, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="fb-pitch-row" style={{ display: "flex", justifyContent: "center", gap: 14, position: "relative" }}>
            {row.map((player) => (
              <div key={player.web_name + player.team}
                style={{ width: 84, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Kit team={player.team} size={44} />
                <span style={{ marginTop: 5, width: "100%" }}>
                  {/* PlayerPlate has drawn the armband since it was written; the pitch simply never
                      told it who wore one, so a squad shown with expected points had no captain on it.
                      The width given is the room the NAME gets, not the cell: this preview draws a
                      tighter plate than the squad pitch and the type is sized to what it actually has. */}
                  <PlayerPlate width={58} name={player.web_name} xp={xpOf ? xpOf(player) : null}
                    captain={Boolean(player.captain)} vice={Boolean(player.vice)}
                    flag={player.flag ? <WarnFlag size={12} /> : null} />
                </span>
                {oppOf && (
                  <span style={{ marginTop: 4 }}>
                    <Opp fx={oppOf(player)} scale={scale} size="sm" showNumber={false} />
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="zeus-bench-row" data-zeus-bench-version="compact-grid-v1">
        <span className="zeus-bench-label"><Label>Bench</Label></span>
        {bench.map((player) => (
          <BenchPlayerCard key={player.fpl_id || `${player.web_name}-${player.team}`}
            player={player} xp={xpOf ? xpOf(player) : null}
            fixture={oppOf ? oppOf(player) : null} scale={scale} showOpponent={Boolean(oppOf)} />
        ))}
      </div>
    </div>
  );
}
