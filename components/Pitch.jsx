"use client";
import React from "react";
import { T, Kit, Label, BudgetPill, WarnFlag } from "../lib/ui";
import PlayerPlate from "./PlayerPlate";
import Opp from "./Opp";

const GRASS = "repeating-linear-gradient(0deg, #0B5A2E 0px, #0B5A2E 44px, #0A5029 44px, #0A5029 88px)";

/* Shared 15-man pitch. squad = [{ web_name, team, position, price, flag }], first 11 = XI, last 4 = bench.
   Name over PROJECTION: the number under a shirt is xPTS, never price. Price is a thing Louis already knows and
   can read in the list; the projection is the thing he came to the pitch for. xpOf is passed in because this
   component is shared and the pages that use it load the model at different times. */
export default function Pitch({ squad, oppOf, scale, xpOf = null }) {
  const spend = (Array.isArray(squad) ? squad : []).reduce((a, p) => a + (Number(p.price) || 0), 0);
  const xi = squad.slice(0, 11);
  const bench = squad.slice(11, 15);
  const rows = ["FWD", "MID", "DEF", "GKP"].map((pos) => xi.filter((p) => p.position === pos)).filter((r) => r.length > 0);
  return (
    <div style={{ position: "relative", background: GRASS, border: `1px solid ${T.line}`, borderRadius: 18, padding: "26px 18px 16px", display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
      <span style={{ position: "absolute", top: 14, right: 16, zIndex: 2, display: "flex",
        flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <BudgetPill spend={spend} />
      </span>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 22, paddingBottom: 8, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -70, left: "50%", transform: "translateX(-50%)", width: 190, height: 132, border: "2px solid rgba(255,255,255,0.25)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 300, height: 56, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 128, height: 24, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "center", gap: 14, position: "relative" }}>
            {row.map((p) => (
              <div key={p.web_name + p.team} style={{ width: 84, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Kit team={p.team} size={44} />
                <span style={{ marginTop: 5, width: "100%" }}>
                  <PlayerPlate name={p.web_name} xp={xpOf ? xpOf(p) : null} flag={p.flag ? <WarnFlag size={12} /> : null} />
                </span>
                {oppOf && <span style={{ marginTop: 4 }}><Opp fx={oppOf(p)} scale={scale} size="sm" showNumber={false} /></span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ background: "rgba(5,0,10,0.94)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Label>Bench</Label>
        {bench.map((p) => (
          <span key={p.web_name + p.team} style={{ display: "flex", alignItems: "center", gap: 9, height: 44, padding: "0 12px", borderRadius: 10,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.2)" }}>
            <Kit team={p.team} size={19} />
            <PlayerPlate name={p.web_name} xp={xpOf ? xpOf(p) : null} width="auto" />
            {oppOf && <Opp fx={oppOf(p)} scale={scale} size="sm" showNumber={false} />}
          </span>
        ))}
      </div>
    </div>
  );
}
