"use client";
import React from "react";
import { Flag } from "lucide-react";
import { T, S, D, Kit, lang, val, Label, Plate } from "../lib/ui";
import { POS_ORDER, POS_LABEL } from "../lib/squad";
import { evaluateSquad } from "../lib/solver";

/* Exactly four readouts and nothing else. Fixed right column, instant, internal, free. */
export default function FeedbackPanel({ squad, formation, horizon, setHorizon, captainId, gate }) {
  const e = React.useMemo(() => evaluateSquad(squad, formation, horizon, captainId, gate), [squad, formation, horizon, captainId, gate]);
  const empty = squad.length === 0;
  const s = e.structure;
  const total = s.total || 1;

  return (
    <aside style={{ width: 330, flexShrink: 0, position: "sticky", top: 22, alignSelf: "flex-start",
      background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 22,
      display: "flex", flexDirection: "column", gap: 20 }}>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <Label color={T.green}>Live feedback</Label>
        <Plate h={28} w={104} bg={T.plate}>{squad.length}/15 · £{s.bank.toFixed(1)}</Plate>
      </div>

      {!gate.passed && (
        <div style={{ background: T.plate, borderRadius: S.radiusSm, padding: "10px 12px" }}>
          <span style={val(12, T.tag, 700)}>{gate.upgrade_label}</span>
        </div>
      )}

      <div>
        <Label>Projected points</Label>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 8 }}>
          <span style={{ ...D, color: empty ? "#FFFFFF" : T.green, fontSize: 44, lineHeight: 1 }}>
            {empty ? "—" : e.projected.total}
          </span>
          <span style={{ paddingBottom: 4, ...val(13, "#FFFFFF", 500) }}>OVER {horizon} GW{horizon > 1 ? "S" : ""}</span>
        </div>
        {!empty && e.projected.low !== null && (
          <div style={{ marginTop: 8 }}>
            <span style={val(12, "#FFFFFF", 500)}>P10 {e.projected.low} · P90 {e.projected.high}</span>
          </div>
        )}
        <input type="range" min={1} max={12} value={horizon} onChange={(ev) => setHorizon(Number(ev.target.value))}
          style={{ width: "100%", marginTop: 10, accentColor: T.green }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={val(12, "#FFFFFF", 500)}>THIS GW</span>
          <span style={val(12, "#FFFFFF", 500)}>12 GWS</span>
        </div>
      </div>

      <div>
        <Label>Captaincy strength</Label>
        {!e.captaincy ? <div style={{ marginTop: 8, ...val(14, "#FFFFFF", 500) }}>—</div> : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <Kit team={e.captaincy.captain.team} size={26} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...lang(16, 700), lineHeight: 1 }}>{e.captaincy.captain.web_name}</span>
                <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: 6,
                  background: e.captaincy.mode === "SET" ? T.tag : T.plate, ...val(12, "#FFFFFF", 700) }}>
                  {e.captaincy.mode}
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                <span style={val(13, T.green, 700)}>{e.captaincy.doubled.toFixed(1)} doubled</span>
                {e.captaincy.p12 !== null && e.captaincy.p12 !== undefined && (
                  <span style={val(13, "#FFFFFF", 500)}> · P(12+) {Math.round(Number(e.captaincy.p12) * 100)}%</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Label>Risk flags</Label>
          <Plate h={26} w={34} bg={T.plate} color={e.risks.length ? T.pink : T.green}>{e.risks.length}</Plate>
        </div>
        {empty ? <div style={{ marginTop: 8, ...val(14, "#FFFFFF", 500) }}>—</div>
          : e.risks.length === 0 ? <div style={{ marginTop: 8, ...lang(14.5, 600, T.green) }}>Nothing flagged.</div>
            : (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
                {e.risks.slice(0, 6).map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Flag size={12} color={T.pink} style={{ flexShrink: 0 }} />
                    <span style={lang(14, 700)}>{r.player.web_name}</span>
                    <span style={lang(13, 600)}>{r.note}</span>
                  </div>
                ))}
              </div>
            )}
      </div>

      <div>
        <Label>Structure</Label>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {POS_ORDER.map((pos) => (
            <div key={pos} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 34, ...val(12, "#FFFFFF", 500) }}>{POS_LABEL[pos]}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#2A0B3D", overflow: "hidden" }}>
                <div style={{ height: 8, width: `${(s.spend[pos] / total) * 100}%`, background: T.green }} />
              </div>
              <Plate h={26} w={54} bg={T.plate}>£{s.spend[pos].toFixed(1)}</Plate>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <span style={val(12, "#FFFFFF", 500)}>BENCH QUALITY</span>
          <Plate h={28} w={62} bg={T.plate} color={s.benchScore >= 6.5 ? T.green : "#FFFFFF"}>
            {empty ? "—" : `${s.benchScore.toFixed(1)}/10`}
          </Plate>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={val(12, "#FFFFFF", 500)}>AUTOSUB COVER</span>
          <Plate h={28} w={62} bg={T.plate} color={s.autosubCoverage >= 0.9 ? T.green : "#FFFFFF"}>
            {empty ? "—" : `${Math.round(s.autosubCoverage * 100)}%`}
          </Plate>
        </div>
      </div>
    </aside>
  );
}
