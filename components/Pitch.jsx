"use client";
import React from "react";
import { T, Kit, lang, val, Label } from "../lib/ui";
import Opp from "./Opp";

const GRASS = "repeating-linear-gradient(0deg, #0B5A2E 0px, #0B5A2E 44px, #0A5029 44px, #0A5029 88px)";

/* Shared 15-man pitch. squad = [{ web_name, team, position, price, flag }], first 11 = XI, last 4 = bench.
   Name-over-number: name Outfit 700, price mono 500 smaller. */
export default function Pitch({ squad, oppOf, scale }) {
  const xi = squad.slice(0, 11);
  const bench = squad.slice(11, 15);
  const rows = ["FWD", "MID", "DEF", "GKP"].map((pos) => xi.filter((p) => p.position === pos)).filter((r) => r.length > 0);
  return (
    <div style={{ background: GRASS, border: `1px solid ${T.line}`, borderRadius: 18, padding: "26px 18px 16px", display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 22, paddingBottom: 8, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -70, left: "50%", transform: "translateX(-50%)", width: 190, height: 132, border: "2px solid rgba(255,255,255,0.25)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 300, height: 56, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 128, height: 24, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "center", gap: 14, position: "relative" }}>
            {row.map((p) => (
              <div key={p.web_name + p.team} style={{ width: 84, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Kit team={p.team} size={44} />
                <div style={{ marginTop: 5, width: "100%", textAlign: "center", background: "rgba(6,0,12,0.8)", borderRadius: "8px 8px 0 0", padding: "4px 4px 1px",
                  ...lang(13.5, 700), lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.web_name}{p.flag ? " ⚠" : ""}
                </div>
                <div style={{ width: "100%", textAlign: "center", background: "rgba(6,0,12,0.8)", borderRadius: "0 0 8px 8px", padding: "1px 4px 4px", ...val(12, "#FFFFFF", 500) }}>
                  {Number(p.price).toFixed(1)}
                </div>
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
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ ...lang(13.5, 700), maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.1 }}>{p.web_name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={val(12, "#FFFFFF", 500)}>{Number(p.price).toFixed(1)}</span>
                {oppOf && <Opp fx={oppOf(p)} scale={scale} size="sm" showNumber={false} />}
              </span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
