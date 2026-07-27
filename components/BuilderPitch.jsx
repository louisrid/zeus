"use client";
import React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { T, S, Kit, lang, val, Label, BudgetPill } from "../lib/ui";
import LockMark from "./LockMark";
import Opp from "./Opp";
import { XpValue } from "./FixtureXP";
import { structureByKey, xi, benchOf, RULES } from "../lib/solver/squad";

const GRASS = "repeating-linear-gradient(0deg, #0B5A2E 0px, #0B5A2E 44px, #0A5029 44px, #0A5029 88px)";
const ROWS = ["FWD", "MID", "DEF", "GKP"]; // forwards top, goalkeeper bottom (03 §1)
// A filled cell and an empty slot must occupy the same box, or the row shifts as players come and go.
const CELL = { width: 84, minHeight: 132 };
/* Kit renders a 44-wide box whose height is size * 0.9. The empty slot's dashed square is placed inside
   a container of exactly that footprint and centred within it, so its centre is identical to a shirt's
   by construction rather than by a guessed margin. Nudging offsets by eye is what kept this wrong. */
const KIT_SIZE = 44;
const KIT_BOX = { width: KIT_SIZE, height: KIT_SIZE * 0.9 };

function EmptySlot({ pos, onClick, active }) {
  return (
    <button onClick={onClick} className="fb-press"
      style={{ ...CELL, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 5 }}>
      <span style={{ ...KIT_BOX, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ width: 38, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
          border: `2px dashed ${active ? T.green : "rgba(255,255,255,0.55)"}`, background: active ? "rgba(0,255,133,0.14)" : "rgba(6,0,12,0.28)" }}>
          <Plus size={17} color={active ? T.green : "#FFFFFF"} strokeWidth={2.6} />
        </span>
      </span>
      <span style={{ width: "100%", textAlign: "center", background: "rgba(6,0,12,0.8)", borderRadius: 8, padding: "3px 4px", ...lang(13, 700) }}>
        Pick {pos === "GKP" ? "GK" : pos}
      </span>
    </button>
  );
}

function Shirt({ p, metric, metricName, isCaptain, isVice, onOpen, selected, target, fx, scale }) {
  return (
    <div
      style={{ ...CELL, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
        cursor: "pointer", borderRadius: 10, outlineOffset: 3,
        outline: selected ? `2px solid ${T.green}` : target ? `2px dashed ${T.cyan}` : "none" }}
    >
      <button onClick={() => onOpen(p)} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <Kit team={p.team} size={KIT_SIZE} />
        {(isCaptain || isVice) && (
          <span style={{ position: "absolute", top: -4, right: 12, width: 20, height: 20, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isCaptain ? T.tag : "#FFFFFF", ...val(13, isCaptain ? "#FFFFFF" : "#0D0014", 700) }}>
            {isCaptain ? "C" : "V"}
          </span>
        )}
        <div style={{ marginTop: 5, width: "100%", textAlign: "center", background: "rgba(6,0,12,0.86)", borderRadius: "8px 8px 0 0",
          padding: "4px 4px 1px", ...lang(13.5, 700), lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.web_name}{p.status && p.status !== "a" ? " ⚠" : ""}
        </div>
        <div style={{ width: "100%", display: "flex", background: "rgba(6,0,12,0.86)", borderRadius: "0 0 8px 8px", padding: "1px 3px 4px" }}>
          <span style={{ flex: 1, textAlign: "center", ...val(13, "#FFFFFF", 500) }}>{Number(p.price).toFixed(1)}</span>
          <span style={{ flex: 1, textAlign: "center", ...val(13, T.green, 700) }}>{metric === null ? "" : Number(metric).toFixed(1)}</span>
        </div>
      </button>
      {scale && <span style={{ marginTop: 4 }}><Opp fx={fx} scale={scale} size="sm" showNumber={false} /></span>}
      <Link href={`/player/${p.fpl_id}`} onClick={(e) => e.stopPropagation()} aria-label={`${p.web_name} player page`}
        style={{ textDecoration: "none", marginTop: 3 }}>
        <span style={{ ...lang(13, 700, T.green) }}>Page</span>
      </Link>
    </div>
  );
}

export default function BuilderPitch({
  squad, scoreOf, metricName, activeSlot, onSlotClick, onOpenPlayer, showMetric = true, oppOf, scale, locks = [],
  selectedId = null, swapTargets = [],
  structures = null, onStructure = null, shapeLocked = false, onShapeLock = null, fill = false,
  showBudget = true,
}) {
  const spend = (squad.players || []).reduce((a, p) => a + (Number(p.price) || 0), 0);
  const st = structureByKey(squad.structure);
  const starters = xi(squad);
  const bench = benchOf(squad);

  const rowFor = (pos) => {
    const filled = starters.filter((p) => p.position === pos);
    const empty = Math.max(0, st[pos] - filled.length);
    return { filled, empty };
  };


  return (
    <div style={{ position: "relative", background: GRASS, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: "26px 18px 16px",
      display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
      {showBudget && (
        <span style={{ position: "absolute", top: 14, right: 16, zIndex: 3 }}><BudgetPill spend={spend} /></span>
      )}
      {structures && (
        <span style={{ position: "absolute", top: 14, left: 16, zIndex: 3, display: "flex", alignItems: "center", gap: 8 }}>
          <select value={squad.structure} onChange={(e) => onStructure && onStructure(e.target.value)}
            disabled={!onStructure}
            style={{ height: 32, padding: "0 10px", borderRadius: S.radiusSm, background: "rgba(6,0,12,0.82)",
              border: `1px solid ${T.line}`, color: "#FFFFFF", ...val(15), outline: "none",
              cursor: onStructure ? "pointer" : "default" }}>
            {structures.map((st) => (
              <option key={st.key} value={st.key} style={{ background: T.card }}>{st.key}</option>
            ))}
          </select>
          {onShapeLock && (
            <button onClick={onShapeLock} className="fb-press" aria-label="Lock the formation"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
                borderRadius: S.radiusSm, background: shapeLocked ? "transparent" : T.card,
                border: shapeLocked ? "none" : `1px solid ${T.line}` }}>
              <LockMark size={shapeLocked ? 26 : 22} on={shapeLocked} />
            </button>
          )}
        </span>
      )}
      <div style={{ position: "relative", display: "flex", flexDirection: "column",
        justifyContent: fill ? "space-between" : "flex-start", gap: fill ? 0 : 20,
        minHeight: fill ? "min(62vh, 640px)" : undefined,
        paddingBottom: 8, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -70, left: "50%", transform: "translateX(-50%)", width: 190, height: 132,
          border: "2px solid rgba(255,255,255,0.25)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 300, height: 56,
          border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 128, height: 24,
          border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        {ROWS.map((pos) => {
          const { filled, empty } = rowFor(pos);
          return (
            <div key={pos} style={{ display: "flex", justifyContent: "center", gap: 14, position: "relative", minHeight: 84 }}>
              {filled.map((p) => (
                <Shirt key={p.fpl_id} p={p} fx={oppOf ? oppOf(p) : null} scale={scale} metric={showMetric ? scoreOf(p) : null} metricName={metricName}
                  isCaptain={squad.captain === p.fpl_id} isVice={squad.vice === p.fpl_id}
                  onOpen={onOpenPlayer} selected={selectedId === p.fpl_id}
                  target={swapTargets.includes(p.fpl_id)} />
              ))}
              {Array.from({ length: empty }).map((_, i) => (
                <EmptySlot key={`${pos}-${i}`} pos={pos} active={activeSlot === pos} onClick={() => onSlotClick(pos)} />
              ))}
            </div>
          );
        })}
      </div>

      <div style={{ background: "rgba(5,0,10,0.94)", borderRadius: S.radiusSm, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minHeight: 64 }}>
        <Label>Bench</Label>
        {bench.map((p, i) => (
          <div key={p.fpl_id}
            style={{ display: "flex", alignItems: "center", gap: 9, height: 46, padding: "0 12px", borderRadius: 10, cursor: "pointer",
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${selectedId === p.fpl_id ? T.green : swapTargets.includes(p.fpl_id) ? T.cyan : "rgba(255,255,255,0.2)"}` }}>
            <span style={val(13, "#FFFFFF", 500)}>{p.position === "GKP" ? "GK" : i}</span>
            <Kit team={p.team} size={19} />
            <button onClick={() => onOpenPlayer(p)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start",
              paddingLeft: 2 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {locks.includes(p.fpl_id) && <LockMark size={17} />}
                <span style={{ ...lang(13.5, 700), maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.1 }}>{p.web_name}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={val(13, "#FFFFFF", 500)}>{Number(p.price).toFixed(1)}</span>
                {showMetric && scoreOf && <XpValue value={scoreOf(p)} isCaptain={squad.captain === p.fpl_id} size={13} align="left" />}
                {scale && <Opp fx={oppOf ? oppOf(p) : null} scale={scale} size="sm" showNumber={false} />}
              </span>
            </button>
          </div>
        ))}
        {Array.from({ length: Math.max(0, RULES.size - RULES.startingXI - bench.length) }).map((_, i) => (
          <span key={`be-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 46, width: 92, borderRadius: 10,
            border: "2px dashed rgba(255,255,255,0.4)", ...lang(13, 700) }}>Bench</span>
        ))}
      </div>
    </div>
  );
}
