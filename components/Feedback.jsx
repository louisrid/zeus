"use client";
import React from "react";
import { AlertTriangle } from "lucide-react";
import { T, S, D, Label, Kit, lang, val } from "../lib/ui";
import { metricLabel, interimChip } from "../lib/solver/score.mjs";
import Fan from "./Fan";

const Block = ({ n, title, chip, children }) => (
  <div style={{ background: T.row, borderRadius: S.radiusSm, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 20, height: 20, borderRadius: 10, background: T.plate, display: "flex", alignItems: "center", justifyContent: "center", ...val(12, "#FFFFFF", 500) }}>{n}</span>
      <span style={{ ...lang(14, 700), letterSpacing: "0.1em", textTransform: "uppercase", flex: 1 }}>{title}</span>
      {chip && <span style={{ ...val(11.5, "#FFFFFF", 500), background: T.plate, borderRadius: 999, padding: "4px 8px" }}>{chip}</span>}
    </div>
    {children}
  </div>
);

/* The four readouts (03 §3.2). This component renders exactly these and nothing else. */
export default function Feedback({ evaluation, horizon, setHorizon, gateOpen, provenance, onPickCaptain }) {
  const e = evaluation;
  const max = Math.max(6, (e.captaincy?.best?.ev || 6) * 1.1);

  return (
    <aside style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20,
      display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 20 }}>
      <div>
        <Label color={T.green}>Live feedback</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>{metricLabel(gateOpen)}</h2>
      </div>

      <Block n="1" title="Projected points" chip={`${horizon} GW`}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <span style={{ ...D, fontSize: 40, lineHeight: 1, color: "#FFFFFF" }}>{e.points.mean.toFixed(0)}</span>
          <span style={{ ...val(13, "#FFFFFF", 500), paddingBottom: 6 }}>
            {e.points.p10.toFixed(0)} – {e.points.p90.toFixed(0)}
          </span>
        </div>
        <input type="range" min={1} max={12} value={horizon} onChange={(ev) => setHorizon(Number(ev.target.value))}
          style={{ width: "100%", accentColor: T.green }} aria-label="Horizon in gameweeks" />
        <div style={{ display: "flex", justifyContent: "space-between", ...val(11.5, "#FFFFFF", 500) }}>
          <span>1 GW</span><span>12 GW</span>
        </div>
        {e.points.extrapolated && (
          <span style={lang(12.5, 600)}>Weeks beyond the projected horizon are carried at the current rate.</span>
        )}
      </Block>

      <Block n="2" title="Captaincy" chip={e.captaincy ? (e.captaincy.set ? "SET" : "AUTO") : null}>
        {!e.captaincy ? (
          <span style={lang(13.5, 600)}>Pick a starting eleven and the armband options appear here.</span>
        ) : (
          <>
            {(e.captaincy.chosen ? [e.captaincy.chosen, ...e.captaincy.ranked.filter((r) => r.p.fpl_id !== e.captaincy.chosen.p.fpl_id)] : e.captaincy.ranked)
              .slice(0, 3)
              .map((r, i) => (
                <button key={r.p.fpl_id} onClick={() => onPickCaptain && onPickCaptain(r.p)} className="fb-hover"
                  style={{ display: "flex", alignItems: "center", gap: 9, height: 42, padding: "0 10px", borderRadius: 10, textAlign: "left",
                    background: i === 0 ? "rgba(255,46,204,0.14)" : T.plate, border: `1px solid ${i === 0 ? T.tag : "transparent"}` }}>
                  <Kit team={r.p.team} size={19} />
                  <span style={{ ...lang(14, 700), flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.p.web_name}</span>
                  <Fan band={r.band} max={max / 2} width={54} height={16} />
                  <span style={val(13.5, "#FFFFFF")}>{r.ev.toFixed(1)}</span>
                  {r.tail !== null && r.tail !== undefined && (
                    <span style={{ ...val(12, "#FFFFFF", 500), background: T.card, borderRadius: 999, padding: "3px 7px" }}>{Math.round(r.tail * 100)}%</span>
                  )}
                </button>
              ))}
            {e.captaincy.ranked[0] && e.captaincy.ranked[0].tail === null && (
              <span style={lang(12.5, 600)}>The 12-point tail arrives with the simulation run.</span>
            )}
          </>
        )}
      </Block>

      <Block n="3" title="Risk flags" chip={String(e.risk.count)}>
        {e.risk.count === 0 ? (
          <span style={lang(13.5, 600)}>No availability or rotation flags in this squad.</span>
        ) : (
          e.risk.items.slice(0, 5).map((r) => (
            <div key={r.player.fpl_id} style={{ display: "flex", alignItems: "center", gap: 9, height: 38, padding: "0 10px", borderRadius: 10, background: T.plate }}>
              <AlertTriangle size={14} color={T.pink} />
              <span style={{ ...lang(14, 700), flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.player.web_name}</span>
              <span style={val(12, T.pink, 500)}>{r.kind.toUpperCase()}</span>
              {r.detail && <span style={val(12, "#FFFFFF", 500)}>{r.detail}</span>}
            </div>
          ))
        )}
        <span style={{ ...val(11.5, "#FFFFFF", 500) }}>{interimChip("minutes")}</span>
      </Block>

      <Block n="4" title="Structure">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
          {["GKP", "DEF", "MID", "FWD"].map((pos) => {
            const b = e.structure.byPos[pos];
            return (
              <div key={pos} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: T.plate, borderRadius: 10, padding: "8px 0" }}>
                <span style={lang(12.5, 700)}>{pos === "GKP" ? "GK" : pos}</span>
                <span style={val(13.5, b.count === b.of ? T.green : "#FFFFFF")}>{b.count}/{b.of}</span>
                <span style={val(12, "#FFFFFF", 500)}>{b.spend.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["BANK", e.structure.bank.toFixed(1)], ["BENCH", e.structure.benchSpend.toFixed(1)], ["BENCH FLOOR", e.structure.benchQuality.toFixed(1)], ["PREMIUMS", e.structure.premiums]].map(([l, v]) => (
            <div key={l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: T.plate, borderRadius: 10, padding: "8px 4px" }}>
              <span style={{ ...lang(11.5, 700), textAlign: "center" }}>{l}</span>
              <span style={val(13, "#FFFFFF")}>{v}</span>
            </div>
          ))}
        </div>
      </Block>

      {provenance && <span style={{ ...lang(12.5, 600), lineHeight: 1.5 }}>{provenance}</span>}
    </aside>
  );
}
