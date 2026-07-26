"use client";
import React from "react";
import { AlertTriangle, Check } from "lucide-react";
import { T, S, D, Label, Kit, lang, val } from "../lib/ui";
import { metricLabel, interimChip } from "../lib/solver/score.mjs";
import Fan from "./Fan";
import { bandFor } from "../lib/scoring";

/* Each block carries its state as colour so the panel reads at a glance rather than as prose. */
const Block = ({ n, title, chip, tone = "#FFFFFF", children }) => (
  <div style={{ background: T.row, borderRadius: S.radiusSm, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 9,
    borderLeft: `3px solid ${tone}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 20, height: 20, borderRadius: 10, background: T.plate, display: "flex", alignItems: "center", justifyContent: "center", ...val(13, tone, 500) }}>{n}</span>
      <span style={{ flex: 1 }}><Label>{title}</Label></span>
      {chip && <span style={{ ...val(13, tone, 500), background: T.plate, borderRadius: 999, padding: "4px 8px" }}>{chip}</span>}
    </div>
    {children}
  </div>
);

const Cell = ({ label, value, tone = "#FFFFFF" }) => (
  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: T.plate, borderRadius: 10, padding: "8px 2px" }}>
    <span style={{ ...lang(13, 700), textAlign: "center", whiteSpace: "nowrap" }}>{label}</span>
    <span style={val(13.5, tone)}>{value}</span>
  </div>
);

/* The four readouts (03 §3.2). This component renders exactly these and nothing else. */
const toneOf = (v) => { const b = bandFor(v); return !b ? "#FFFFFF" : b.tone === "green" ? T.green : b.tone === "pink" ? T.pink : "#FFFFFF"; };

/* A score renders only when it exists. Null renders nothing, per DECISIONS 2.1. */
const Score = ({ label, value, big }) => (
  value === null || value === undefined ? null : (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: big ? "flex-start" : "center", minWidth: 0 }}>
      <span style={lang(big ? 13.5 : 12, big ? 600 : 700)}>{label}</span>
      <span style={val(big ? 34 : 15, toneOf(value))}>{value}</span>
    </div>
  )
);

export default function Feedback({ evaluation, horizon, setHorizon, gateOpen, provenance, onPickCaptain, scores }) {
  const e = evaluation;
  const max = Math.max(6, (e.captaincy?.best?.ev || 6) * 1.1);
  const complete = ["GKP", "DEF", "MID", "FWD"].every((pos) => e.structure.byPos[pos].count === e.structure.byPos[pos].of);
  const trust = horizon <= 3 ? T.green : horizon <= 6 ? "#FFFFFF" : T.pink;
  const clubSpread = scores ? scores.clubs : { clubs: 0, max: 0 };

  return (
    <aside style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 18,
      display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 20 }}>
      <div>
        <Label color={T.green}>Live feedback</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>{metricLabel(gateOpen)}</h2>
      </div>

      {scores && scores.overall !== null && (
        <Block n="0" title="Squad score" tone={toneOf(scores.overall)} chip={`${scores.clubs.clubs} clubs`}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 22 }}>
            <Score label="Overall" value={scores.overall} big />
            <div style={{ display: "flex", gap: 14, paddingBottom: 6 }}>
              {["GKP", "DEF", "MID", "FWD"].map((pos) => (
                <Score key={pos} label={pos === "GKP" ? "GK" : pos} value={scores.lines[pos]} />
              ))}
              <Score label="CAPT" value={scores.captaincy} />
            </div>
          </div>
        </Block>
      )}


      {scores && (scores.template || scores.topRank) && (
        <Block n="T" title="Ownership" tone="#FFFFFF"
          chip={scores.template ? `${scores.template.shared}/${scores.template.of}` : ""}>
          <div style={{ display: "flex", gap: 26 }}>
            {scores.template && (
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={val(22)}>{scores.template.pct}%</span>
                <span style={lang(13, 600)}>the field owns</span>
              </span>
            )}
            {scores.topRank && (
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={val(22, T.cyan)}>{scores.topRank.pct}%</span>
                <span style={lang(13, 600)}>the top rank owns</span>
              </span>
            )}
          </div>
        </Block>
      )}

      <Block n="1" title="Points" chip={`${horizon} GW`} tone={trust}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <span style={{ ...D, fontSize: 40, lineHeight: 1, color: "#FFFFFF" }}>{e.points.mean.toFixed(0)}</span>
          <span style={{ ...val(13, "#FFFFFF", 500), paddingBottom: 6 }}>
            {e.points.p10.toFixed(0)} – {e.points.p90.toFixed(0)}
          </span>
        </div>
        
      </Block>

      <Block n="2" title="Captain" tone={!e.captaincy ? T.pink : e.captaincy.set ? T.green : "#FFFFFF"}
        chip={e.captaincy ? (e.captaincy.set ? "SET" : "AUTO") : "NO XI"}>
        {!e.captaincy ? null : (
          (e.captaincy.chosen ? [e.captaincy.chosen, ...e.captaincy.ranked.filter((r) => r.p.fpl_id !== e.captaincy.chosen.p.fpl_id)] : e.captaincy.ranked)
            .slice(0, 3)
            .map((r, i) => (
              <button key={r.p.fpl_id} onClick={() => onPickCaptain && onPickCaptain(r.p)} className="fb-hover"
                style={{ display: "flex", alignItems: "center", gap: 9, height: 40, padding: "0 10px", borderRadius: 10, textAlign: "left",
                  background: i === 0 ? "rgba(255,46,204,0.14)" : T.plate, border: `1px solid ${i === 0 ? T.tag : "transparent"}` }}>
                <Kit team={r.p.team} size={19} />
                <span style={{ ...lang(14, 700), flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.p.web_name}</span>
                <span style={val(13.5, "#FFFFFF")}>{r.ev.toFixed(1)}</span>
                {r.tail !== null && r.tail !== undefined && (
                  <span style={{ ...val(13, "#FFFFFF", 500), background: T.card, borderRadius: 999, padding: "3px 7px" }}>{Math.round(r.tail * 100)}%</span>
                )}
              </button>
            ))
        )}
      </Block>

      <Block n="3" title="Risk" chip={e.risk.count === 0 ? "CLEAR" : String(e.risk.count)}
        tone={e.risk.count === 0 ? T.green : T.pink}>
        {e.risk.count === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7, height: 30 }}>
            <Check size={15} color={T.green} />
            <span style={val(13, T.green, 500)}>NO FLAGS</span>
          </div>
        ) : (
          e.risk.items.slice(0, 5).map((r) => (
            <div key={r.player.fpl_id} style={{ display: "flex", alignItems: "center", gap: 9, height: 36, padding: "0 10px", borderRadius: 10, background: T.plate }}>
              <AlertTriangle size={14} color={T.pink} />
              <span style={{ ...lang(14, 700), flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.player.web_name}</span>
              <span style={val(13, T.pink, 500)}>{r.kind.toUpperCase()}</span>
              {r.detail && <span style={val(13, "#FFFFFF", 500)}>{r.detail}</span>}
            </div>
          ))
        )}
        <span style={{ ...val(13, "#FFFFFF", 500) }}>{interimChip("minutes")}</span>
      </Block>

      <Block n="4" title="Structure" chip={complete ? "LEGAL 15" : `${e.structure.byPos.GKP.count + e.structure.byPos.DEF.count + e.structure.byPos.MID.count + e.structure.byPos.FWD.count}/15`}
        tone={complete ? T.green : "#FFFFFF"}>
        <div style={{ display: "flex", gap: 5 }}>
          {["GKP", "DEF", "MID", "FWD"].map((pos) => {
            const b = e.structure.byPos[pos];
            return <Cell key={pos} label={pos === "GKP" ? "GK" : pos} value={`${b.count}/${b.of}`} tone={b.count === b.of ? T.green : "#FFFFFF"} />;
          })}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <Cell label="BANK" value={e.structure.bank.toFixed(1)} tone={e.structure.bank < 0 ? T.pink : "#FFFFFF"} />
          <Cell label="BENCH" value={e.structure.benchSpend.toFixed(1)} />
          <Cell label="FLOOR" value={e.structure.benchQuality.toFixed(1)} />
          <Cell label="PREM" value={e.structure.premiums} />
          <Cell label="CLUBS" value={clubSpread.clubs} tone={clubSpread.max >= 3 ? T.pink : "#FFFFFF"} />
        </div>
      </Block>

      {provenance && <span style={{ ...lang(13, 600), lineHeight: 1.45 }}>{provenance}</span>}
    </aside>
  );
}
