"use client";
import React from "react";
import { T, S, Kit, Label, lang, val, code } from "../lib/ui";
import { PLAN_RULES, squadAt, transferLedger, validateAt, validateChips, staleness, saleValue } from "../lib/plan.mjs";
import Opp from "./Opp";
import { metricName } from "../lib/solver/score.mjs";
import { xpWithCaptain } from "../lib/captain.mjs";

/* THE GAMEWEEK TIMELINE.
 *
 * A plan is a base fifteen plus a transfer list per gameweek, so everything shown here is derived:
 * the squad at this gameweek, free transfers remaining, hit cost, what changed this week. Nothing is
 * tracked twice, which is why the numbers cannot disagree with each other.
 *
 * The timeline ends where the published fixture list ends. Pretending to plan to gameweek 38 when the
 * fixtures are not out, and blanks are not confirmed, would be inventing certainty.
 */

const POS_ORDER = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };

const Plate = ({ label, value, tone = "#FFFFFF", wide = false }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
    background: T.plate, borderRadius: 10, padding: "9px 12px", minWidth: wide ? 96 : 72 }}>
    <span style={code(13)}>{label}</span>
    <span style={val(16, tone)}>{value}</span>
  </div>
);

function PlayerRow({ p, isCaptain, isVice, xp, fx, scale, onClick, benchIndex }) {
  const shown = xpWithCaptain(xp, isCaptain);
  return (
    <button onClick={onClick} className="fb-hover"
      style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 86px 62px 58px", gap: 9,
        alignItems: "center", height: 40, padding: "0 10px", borderRadius: 9,
        background: T.row, border: `1px solid ${isCaptain ? T.tag : "transparent"}`, textAlign: "left", width: "100%" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Kit team={p.team} size={19} />
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ ...lang(13.5, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.web_name || p.fpl_id}
        </span>
        {isCaptain && <span style={val(13, T.tag, 500)}>C</span>}
        {isVice && <span style={val(13, "#FFFFFF", 500)}>V</span>}
        {benchIndex !== undefined && <span style={val(13, "#FFFFFF", 500)}>{benchIndex}</span>}
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
        <Opp fx={fx} scale={scale} size="sm" showNumber={false} />
      </span>
      <span style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 3 }}>
        <span style={val(13.5)}>{shown.value === null ? "—" : shown.value.toFixed(1)}</span>
        {shown.doubled && <span style={val(13, T.tag, 500)}>×2</span>}
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
        <span style={val(13, "#FFFFFF", 500)}>{Number(p.price).toFixed(1)}</span>
      </span>
    </button>
  );
}

export default function PlanTimeline({
  plan, gw, maxGw, onGw, pool, livePlayers, scale, fxFor, xpFor,
  onSetCaptain, onSetVice, onSetChip, onTransfer, onUndoTransfer, onBack,
}) {
  const shaped = { ...plan, base: plan.base || [], weeks: plan.weeks || {} };
  const state = squadAt(shaped, gw);
  const ledger = transferLedger(shaped, gw);
  const week = ledger[ledger.length - 1] || { free: 0, made: 0, hit: 0 };
  const check = validateAt(shaped, gw, (id) => {
    const p = (livePlayers || []).find((x) => x.fpl_id === id);
    return p ? Number(p.price) : null;
  });
  const chipCheck = validateChips(shaped);
  const stale = staleness(shaped, gw, livePlayers);

  // Attach live player detail to the derived squad, since a plan stores ids and prices only.
  const byId = new Map((pool || []).map((p) => [p.fpl_id, p]));
  const full = state.players.map((p) => ({ ...(byId.get(p.fpl_id) || {}), ...p }));
  const starting = full.filter((p) => p.starting);
  const xi = (starting.length ? starting : full.slice(0, 11))
    .sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position]);
  const bench = full.filter((p) => !xi.some((x) => x.fpl_id === p.fpl_id));

  const xpOf = (p) => (xpFor ? xpFor(p, gw) : null);
  const gwPoints = xi.reduce((a, p) => {
    const v = xpWithCaptain(xpOf(p), state.captain === p.fpl_id);
    return a + (v.value ?? 0);
  }, 0);
  const thisWeeksTransfers = (shaped.weeks[gw] || {}).transfers || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      {/* Gameweek navigation */}
      <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 16,
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button onClick={onBack} className="fb-press"
          style={{ height: 38, padding: "0 14px", borderRadius: 999, background: T.card, border: `1px solid ${T.line}`, ...lang(13.5, 700) }}>
          ALL PLANS
        </button>
        <span style={{ ...lang(17, 700) }}>{plan.name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <button onClick={() => onGw(gw - 1)} disabled={gw <= 1} className="fb-press"
            style={{ width: 40, height: 40, borderRadius: 999, background: T.plate, ...lang(17, 700), opacity: gw <= 1 ? 0.4 : 1 }}
            aria-label="Previous gameweek">‹</button>
          <span style={{ ...val(19), minWidth: 74, textAlign: "center" }}>GW{gw}</span>
          <button onClick={() => onGw(gw + 1)} disabled={gw >= maxGw} className="fb-press"
            style={{ width: 40, height: 40, borderRadius: 999, background: T.plate, ...lang(17, 700), opacity: gw >= maxGw ? 0.4 : 1 }}
            aria-label="Next gameweek">›</button>
        </div>
      </section>

      {/* This gameweek at a glance */}
      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Plate label={metricName(true)} value={gwPoints ? gwPoints.toFixed(1) : "—"} wide />
        <Plate label="FREE" value={week.free} />
        <Plate label="MOVES" value={week.made} />
        <Plate label="HIT" value={week.hit ? `-${week.hit}` : "0"} tone={week.hit ? T.pink : "#FFFFFF"} />
        <span style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 4 }}>
          <span style={{ ...lang(13.5, 600) }}>{state.structure}</span>
          {state.chip && <span style={val(13, T.tag, 500)}>{state.chip.toUpperCase()}</span>}
        </span>
      </section>

      {!check.ok && (
        <section style={{ background: "#2A0410", border: `1px solid ${T.pink}`, borderRadius: S.radius, padding: 14,
          display: "flex", flexDirection: "column", gap: 5 }}>
          <Label color={T.pink}>Not legal at GW{gw}</Label>
          {check.errors.slice(0, 4).map((e, i) => (
            <span key={i} style={{ ...lang(13.5, 600), lineHeight: 1.45 }}>{e}</span>
          ))}
        </section>
      )}

      {!chipCheck.ok && (
        <section style={{ background: "#2A0410", border: `1px solid ${T.pink}`, borderRadius: S.radius, padding: 14 }}>
          <Label color={T.pink}>Chips</Label>
          {chipCheck.errors.map((e, i) => <span key={i} style={{ ...lang(13.5, 600) }}>{e}</span>)}
        </section>
      )}

      {stale.length > 0 && (
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 14,
          display: "flex", flexDirection: "column", gap: 5 }}>
          <Label color={T.cyan}>Changed since you saved</Label>
          {stale.slice(0, 5).map((c, i) => (
            <span key={i} style={{ ...lang(13.5, 600), lineHeight: 1.45 }}>
              {c.kind === "price" ? `${c.name || c.fpl_id} is now ${c.to.toFixed(1)}, was ${c.from.toFixed(1)}`
                : c.kind === "availability" ? `${c.name || c.fpl_id} is flagged`
                : `Player ${c.fpl_id} is no longer in the league`}
            </span>
          ))}
        </section>
      )}

      {/* Transfers made this gameweek */}
      <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 16,
        display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <Label color={T.green}>Transfers in GW{gw}</Label>
          <button onClick={() => onTransfer(gw)} className="fb-press"
            style={{ height: 34, padding: "0 14px", borderRadius: 999, background: T.card, border: `1px solid ${T.line}`, ...lang(13.5, 700) }}>
            ADD TRANSFER
          </button>
        </div>
        {thisWeeksTransfers.length === 0
          ? <span style={lang(13.5, 600)}>None.</span>
          : thisWeeksTransfers.map((t, i) => {
              const out = byId.get(t.out), inn = byId.get(t.in);
              const sold = out ? saleValue(out.purchasePrice ?? out.price, out.price) : null;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ ...lang(13.5, 600) }}>
                    {(out && out.web_name) || t.out} out{sold !== null ? ` at ${sold.toFixed(1)}` : ""}
                  </span>
                  <span style={val(13, "#FFFFFF", 500)}>→</span>
                  <span style={{ ...lang(13.5, 700) }}>
                    {(inn && inn.web_name) || t.in} in at {Number(t.price).toFixed(1)}
                  </span>
                  <button onClick={() => onUndoTransfer(gw, i)} className="fb-press"
                    style={{ height: 26, padding: "0 10px", borderRadius: 999, background: T.plate, ...lang(13, 700) }}>
                    UNDO
                  </button>
                </div>
              );
            })}
      </section>

      {/* The eleven and the bench for this gameweek */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: S.gap }}>
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 16,
          display: "flex", flexDirection: "column", gap: 7 }}>
          <Label color={T.green}>Starting eleven</Label>
          {xi.map((p) => (
            <PlayerRow key={p.fpl_id} p={p} isCaptain={state.captain === p.fpl_id} isVice={state.vice === p.fpl_id}
              xp={xpOf(p)} fx={fxFor ? fxFor(p, gw) : null} scale={scale}
              onClick={() => onSetCaptain(gw, p.fpl_id)} />
          ))}
          <span style={lang(13, 600)}>Click a player to give him the armband.</span>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 16,
          display: "flex", flexDirection: "column", gap: 7 }}>
          <Label color={T.cyan}>Bench, in order</Label>
          {bench.map((p, i) => (
            <PlayerRow key={p.fpl_id} p={p} isCaptain={false} isVice={state.vice === p.fpl_id}
              xp={xpOf(p)} fx={fxFor ? fxFor(p, gw) : null} scale={scale} benchIndex={i + 1}
              onClick={() => onSetVice(gw, p.fpl_id)} />
          ))}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
            {["none", ...PLAN_RULES.chips].map((c) => (
              <button key={c} onClick={() => onSetChip(gw, c === "none" ? null : c)} className="fb-press"
                style={{ height: 32, padding: "0 12px", borderRadius: 999,
                  background: (state.chip || "none") === c ? T.tag : T.card,
                  border: `1px solid ${(state.chip || "none") === c ? T.tag : T.line}`, ...lang(13, 700) }}>
                {c === "none" ? "NO CHIP" : c.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
