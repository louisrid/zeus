"use client";
import React from "react";
import { Plus } from "lucide-react";
import { T, S, Kit, lang, val, Label, BudgetPill, WarnFlag } from "../lib/ui";
import PlayerPlate from "./PlayerPlate";
import BenchPlayerCard from "./BenchPlayerCard";
import LockMark from "./LockMark";
import Opp from "./Opp";
import { structureByKey, xi, benchOf, RULES } from "../lib/solver/squad";

const GRASS = "repeating-linear-gradient(0deg, #0B5A2E 0px, #0B5A2E 44px, #0A5029 44px, #0A5029 88px)";
const ROWS = ["FWD", "MID", "DEF", "GKP"]; // forwards top, goalkeeper bottom (03 §1)
// A filled cell and an empty slot must occupy the same box, or the row shifts as players come and go.
/* 84px, unchanged. Widening it to fit full surnames pushed the dashboard's narrower pitch card off the
   side of a phone screen, so the truncation stays for now rather than shipping an overflow. */
const CELL = { width: 84, minHeight: 132 };
/* Kit renders a 44-wide box whose height is size * 0.9. The empty slot's dashed square is placed inside
   a container of exactly that footprint and centred within it, so its centre is identical to a shirt's
   by construction rather than by a guessed margin. Nudging offsets by eye is what kept this wrong. */
const KIT_SIZE = 44;
const KIT_BOX = { width: KIT_SIZE, height: KIT_SIZE * 0.9 };

function EmptySlot({ pos, onClick, active, readOnly }) {
  return (
    <button onClick={onClick} className="fb-press"
      style={{ ...CELL, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 5 }}>
      <span style={{ ...KIT_BOX, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ width: 38, height: 34, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
          border: `2px dashed ${active ? T.green : "rgba(255,255,255,0.55)"}`, background: active ? "rgba(0,255,133,0.14)" : "rgba(6,0,12,0.28)" }}>
          <Plus size={17} color={active ? T.green : "#FFFFFF"} strokeWidth={2.6} />
        </span>
      </span>
      <span style={{ width: "100%", textAlign: "center", background: "rgba(6,0,12,0.8)", borderRadius: 8, padding: "3px 4px", ...lang(13, 700) }}>
        {readOnly ? (pos === "GKP" ? "GK" : pos) : `Pick ${pos === "GKP" ? "GK" : pos}`}
      </span>
    </button>
  );
}

function Shirt({ p, metric, metricName, isCaptain, isVice, captainMultiplier, onOpen, selected, target, fx, scale }) {
  return (
    <div
      style={{ ...CELL, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
        cursor: "pointer", borderRadius: 12, outlineOffset: 3,
        outline: selected ? `2px solid ${T.green}` : target ? "2px dashed #FFFFFF" : "none" }}
    >
      <button onClick={() => onOpen(p)} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <Kit team={p.team} size={KIT_SIZE} />
        {(isCaptain || isVice) && (
          <span style={{ position: "absolute", top: -4, right: 12, width: 20, height: 20, borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isCaptain ? T.tag : "#FFFFFF", ...val(13, "#0D0014") }}>
            {isCaptain ? "C" : "V"}
          </span>
        )}
        <span style={{ marginTop: 5, width: "100%" }}>
          <PlayerPlate width={CELL.width} name={p.web_name} xp={metric === null || metric === undefined ? null : Number(metric) * (isCaptain ? captainMultiplier : 1)}
            flag={p.status && p.status !== "a" ? <WarnFlag size={12} /> : null} captain={isCaptain} vice={isVice} />
        </span>
      </button>
      {scale && <span style={{ marginTop: 4 }}><Opp fx={fx} scale={scale} size="sm" showNumber={false} /></span>}
    </div>
  );
}

export default function BuilderPitch({
  squad, scoreOf, metricName, activeSlot, onSlotClick, onOpenPlayer, showMetric = true, oppOf, scale, locks = [],
  selectedId = null, swapTargets = [],
  structures = null, onStructure = null, shapeLocked = false, onShapeLock = null, fill = false,
  showBudget = true, readOnly = false, swapInto = null, cornerPills = null, underShape = null,
  captainMultiplier = 2, benchOrder = null, benchExtras = null, benchFooter = null,
  bank = null, available = null, availableLabel = "BANK",
}) {
  const spend = (squad.players || []).reduce((a, p) => a + (Number(p.price) || 0), 0);
  const st = structureByKey(squad.structure);
  const starters = xi(squad);
  /* BENCH ORDER.
   *
   * The reserve keeper always sits furthest left and never moves: he can only ever replace the keeper, so
   * his position in the queue means nothing. The three outfield reserves are the actual autosub queue and
   * read left to right, best first, using this week's xPTS. That order is recomputed per gameweek, so a
   * reserve with a good fixture in GW3 moves up for GW3 on his own.
   *
   * An explicit benchOrder, written when two reserves are swapped by hand, overrides the automatic sort
   * for that week. Nothing is reordered behind the user's back once they have said what they want. */
  const bench = (() => {
    const all = benchOf(squad);
    const keepers = all.filter((player) => player.position === "GKP");
    const outfield = all.filter((player) => player.position !== "GKP");
    if (benchOrder && benchOrder.length) {
      const rank = new Map(benchOrder.map((id, index) => [Number(id), index]));
      outfield.sort((a, b) => (rank.get(Number(a.fpl_id)) ?? 99) - (rank.get(Number(b.fpl_id)) ?? 99));
    } else if (scoreOf) {
      outfield.sort((a, b) => Number(scoreOf(b) ?? 0) - Number(scoreOf(a) ?? 0));
    }
    return [...keepers, ...outfield];
  })();

  const rowFor = (pos) => {
    const filled = starters.filter((p) => p.position === pos);
    const empty = Math.max(0, st[pos] - filled.length);
    return { filled, empty };
  };


  return (
    <div style={{ position: "relative", background: GRASS, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: "26px 18px 16px",
      display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
      {showBudget && (
        <span className="zeus-pitch-overlay zeus-pitch-overlay-right" style={{ position: "absolute", top: 14, right: 16, zIndex: 3, display: "flex",
          flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <BudgetPill spend={spend} bank={bank} available={available} availableLabel={availableLabel} />
          {cornerPills}
        </span>
      )}
      {structures && (
        <span className="zeus-pitch-overlay zeus-pitch-overlay-left" style={{ position: "absolute", top: 14, left: 16, zIndex: 3, display: "flex",
          flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select value={squad.structure} onChange={(e) => onStructure && onStructure(e.target.value)}
            disabled={!onStructure} className="zeus-pitch-control" aria-label="Formation"
            style={{ height: S.ctrlSm, padding: "0 10px", borderRadius: S.radiusSm, background: "rgba(6,0,12,0.82)",
              border: `1px solid ${T.line}`, color: "#FFFFFF", ...val(15), outline: "none",
              cursor: onStructure ? "pointer" : "default" }}>
            {structures.map((st) => (
              <option key={st.key} value={st.key} style={{ background: T.card }}>{st.key}</option>
            ))}
          </select>
          {onShapeLock && (
            <button onClick={onShapeLock} className="fb-press zeus-pitch-control" aria-label="Lock the formation"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: S.ctrlSm, height: S.ctrlSm,
                borderRadius: S.radiusSm, background: shapeLocked ? "transparent" : T.card,
                border: shapeLocked ? "none" : `1px solid ${T.line}` }}>
              <LockMark size={shapeLocked ? 26 : 22} on={shapeLocked} />
            </button>
          )}
          </span>
          {underShape}
        </span>
      )}
      <div style={{ position: "relative", display: "flex", flexDirection: "column",
        justifyContent: fill ? "space-between" : "flex-start", gap: fill ? 0 : 20,
        minHeight: fill ? "min(56vh, 600px)" : undefined,
        paddingBottom: 8, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -70, left: "50%", transform: "translateX(-50%)", width: "min(190px, 52%)", height: 132,
          border: `2px solid ${T.pitchLine}`, borderRadius: "50%" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "min(300px, 82%)", height: 56,
          border: `2px solid ${T.pitchLine}`, borderBottom: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "min(128px, 35%)", height: 24,
          border: `2px solid ${T.pitchLine}`, borderBottom: "none" }} />
        {ROWS.map((pos) => {
          const { filled, empty } = rowFor(pos);
          return (
            <div key={pos} className="fb-pitch-row" style={{ display: "flex", justifyContent: "center", gap: 14, position: "relative", minHeight: 84 }}>
              {filled.map((p) => (
                <Shirt key={p.fpl_id} p={p} fx={oppOf ? oppOf(p) : null} scale={scale} metric={showMetric ? scoreOf(p) : null} metricName={metricName}
                  isCaptain={squad.captain === p.fpl_id} isVice={squad.vice === p.fpl_id}
                  captainMultiplier={captainMultiplier}
                  onOpen={onOpenPlayer} selected={selectedId === p.fpl_id}
                  target={swapTargets.includes(p.fpl_id)} />
              ))}
              {Array.from({ length: empty }).map((_, i) => (
                <EmptySlot key={`${pos}-${i}`} pos={pos} active={activeSlot === pos || (swapInto && swapInto === pos)}
                  readOnly={!onSlotClick || readOnly}
                  onClick={() => onSlotClick && onSlotClick(pos)} />
              ))}
            </div>
          );
        })}
      </div>

      {benchExtras && <div className="zeus-bench-extras">{benchExtras}</div>}

      <div className="zeus-bench-row" data-zeus-bench-version="compact-grid-v1">
        <span className="zeus-bench-label"><Label>Bench</Label></span>
        {bench.map((p, i) => (
          <BenchPlayerCard key={p.fpl_id} player={p}
            slotLabel={p.position === "GKP" ? "GK" : bench.slice(0, i).filter((x) => x.position !== "GKP").length + 1}
            xp={showMetric && scoreOf ? scoreOf(p) : null}
            fixture={oppOf ? oppOf(p) : null} scale={scale} showOpponent={Boolean(scale)}
            onClick={onOpenPlayer}
            marker={locks.includes(p.fpl_id) && <LockMark size={15} />}
            selected={selectedId === p.fpl_id} target={swapTargets.includes(p.fpl_id)}
            captain={squad.captain === p.fpl_id} vice={squad.vice === p.fpl_id} />
        ))}
        {(() => {
          /* Which positions the bench still needs, so clicking an empty bench slot filters the list the
             same way clicking an empty pitch slot does. Before this they were plain spans and nothing
             happened when Louis clicked them. */
          /* What the BENCH still needs, which is the squad quota minus the eleven minus whoever is already
             benched. Counting the full quota instead gave an empty draft slots labelled GK, GK, DEF, DEF:
             it forgot that the eleven takes most of them. */
          const st = structureByKey(squad.structure) || {};
          const needed = [];
          for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
            const forBench = (RULES.composition[pos] || 0) - (st[pos] || 0);
            const benched = bench.filter((b) => b.position === pos).length;
            for (let k = benched; k < forBench; k++) needed.push(pos);
          }
          const slots = Math.max(0, RULES.size - RULES.startingXI - bench.length);
          return Array.from({ length: slots }).map((_, i) => {
            const pos = needed[i] || null;
            return (
              <button key={`be-${i}`} onClick={() => { if (pos && onSlotClick) onSlotClick(pos); }}
                disabled={!pos || !onSlotClick} className="fb-press zeus-bench-empty"
                style={{ background: activeSlot && pos === activeSlot ? "rgba(0,255,133,0.14)" : T.plate,
                  border: `2px dashed ${activeSlot && pos === activeSlot ? T.green : T.slotEmpty}`,
                  cursor: pos && onSlotClick ? "pointer" : "default", ...lang(13, 700) }}>
                {pos ? (pos === "GKP" ? "GK" : pos) : "Bench"}
              </button>
            );
          });
        })()}
      </div>

      {benchFooter && <div className="zeus-bench-footer">{benchFooter}</div>}
    </div>
  );
}
