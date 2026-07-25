"use client";
import React from "react";
import { Plus } from "lucide-react";
import { T, S, Kit, lang, val, Label } from "../lib/ui";
import { splitSquad, POS_LABEL } from "../lib/squad";

const GRASS = "repeating-linear-gradient(0deg, #0B5A2E 0px, #0B5A2E 44px, #0A5029 44px, #0A5029 88px)";
const ROWS = ["FWD", "MID", "DEF", "GKP"];   // forwards top, GK bottom — binding

function Badge({ kind }) {
  const [txt, bg, fg] = kind === "C" ? ["C", T.tag, "#FFFFFF"] : ["V", "#FFFFFF", "#0D0014"];
  return (
    <span style={{ position: "absolute", top: -6, right: -6, width: 19, height: 19, borderRadius: 10,
      display: "flex", alignItems: "center", justifyContent: "center", background: bg, ...lang(12, 700, fg), lineHeight: 1 }}>
      {txt}
    </span>
  );
}

function Filled({ p, isCaptain, isVice, onClick, drag }) {
  return (
    <button
      draggable={Boolean(drag)}
      onClick={onClick}
      onDragStart={drag ? () => drag.start(p) : undefined}
      onDragOver={drag ? (e) => e.preventDefault() : undefined}
      onDrop={drag ? (e) => { e.preventDefault(); drag.drop(p); } : undefined}
      className="fb-press"
      style={{ width: 88, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ position: "relative", display: "block" }}>
        <Kit team={p.team} size={44} />
        {isCaptain && <Badge kind="C" />}
        {isVice && !isCaptain && <Badge kind="V" />}
      </span>
      <span style={{ marginTop: 5, width: "100%", textAlign: "center", background: "rgba(6,0,12,0.82)",
        borderRadius: "8px 8px 0 0", padding: "4px 4px 1px", ...lang(13.5, 700), lineHeight: 1.15,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.web_name}
      </span>
      <span style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        background: "rgba(6,0,12,0.82)", borderRadius: "0 0 8px 8px", padding: "1px 4px 4px" }}>
        <span style={val(12, "#FFFFFF", 500)}>{Number(p.score ?? 0).toFixed(1)}</span>
        {p.status && p.status !== "a" && <span style={val(12, T.pink, 700)}>!</span>}
      </span>
    </button>
  );
}

function Empty({ pos, onClick }) {
  return (
    <button onClick={onClick} className="fb-press"
      style={{ width: 88, height: 82, borderRadius: S.radiusSm, background: "rgba(6,0,12,0.5)",
        border: "1.5px dashed rgba(255,255,255,0.45)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 4 }}>
      <Plus size={16} color="#FFFFFF" />
      <span style={val(12, "#FFFFFF", 700)}>{POS_LABEL[pos]}</span>
    </button>
  );
}

/* squad = scored players. formation = id. Interactive when onSlot/onPlayer are supplied. */
export default function BuildPitch({ squad, formation, captainId, viceId, onSlot, onPlayer, onSwap, footer }) {
  const dragRef = React.useRef(null);
  const { xi, bench, shape } = splitSquad(squad, formation);
  const drag = onSwap ? { start: (p) => { dragRef.current = p; }, drop: (target) => { const from = dragRef.current; dragRef.current = null; if (from && from.id !== target.id) onSwap(from, target); } } : null;

  return (
    <div style={{ background: GRASS, border: `1px solid ${T.line}`, borderRadius: S.radius,
      padding: "26px 18px 16px", display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 20, paddingBottom: 8, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -70, left: "50%", transform: "translateX(-50%)", width: 190, height: 132, border: "2px solid rgba(255,255,255,0.25)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 300, height: 56, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 128, height: 24, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        {ROWS.map((pos) => {
          const slots = shape[pos] || 0;
          if (!slots) return null;
          const inRow = xi.filter((p) => p.position === pos);
          return (
            <div key={pos} style={{ display: "flex", justifyContent: "center", gap: 14, position: "relative" }}>
              {Array.from({ length: slots }).map((_, i) => {
                const p = inRow[i];
                if (!p) return <Empty key={pos + i} pos={pos} onClick={() => onSlot && onSlot(pos)} />;
                return (
                  <Filled key={p.id} p={p} isCaptain={captainId === p.id} isVice={viceId === p.id}
                    onClick={() => onPlayer && onPlayer(p, false)} drag={drag} />
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ background: "rgba(5,0,10,0.94)", borderRadius: S.radiusSm, padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Label>Bench</Label>
        {bench.map((p, i) => (
          <button key={p.id} className="fb-press"
            draggable={Boolean(drag)}
            onClick={() => onPlayer && onPlayer(p, true)}
            onDragStart={drag ? () => drag.start(p) : undefined}
            onDragOver={drag ? (e) => e.preventDefault() : undefined}
            onDrop={drag ? (e) => { e.preventDefault(); drag.drop(p); } : undefined}
            style={{ display: "flex", alignItems: "center", gap: 9, height: 44, padding: "0 12px", borderRadius: 10,
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.22)" }}>
            <span style={val(12, "#FFFFFF", 500)}>{p.position === "GKP" ? "GK" : i}</span>
            <Kit team={p.team} size={19} />
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ ...lang(13.5, 700), maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.1 }}>{p.web_name}</span>
              <span style={val(12, "#FFFFFF", 500)}>{Number(p.score ?? 0).toFixed(1)}</span>
            </span>
          </button>
        ))}
        {squad.length < 15 && (
          <span style={val(12, "#FFFFFF", 500)}>{15 - squad.length} SLOTS OPEN</span>
        )}
        {footer && <span style={{ marginLeft: "auto", ...val(12, "#FFFFFF", 500) }}>{footer}</span>}
      </div>
    </div>
  );
}
