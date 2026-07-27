"use client";
import React from "react";
import { Wand2, Save, Trash2, Star, Upload, ChevronRight, ChevronLeft, X, Search, Check } from "lucide-react";
import { T, S, D, Kit, Label, Plate, POS_LABEL, SkeletonRows, Skeleton, ErrorCard, lang, val, code, Value } from "../../lib/ui";
import { loadCore, nextFixtures, sb } from "../../lib/data";
import { loadModel, provenanceLine } from "../../lib/projections";
import { metricName, interimChip } from "../../lib/solver/score.mjs";
import {
  RULES, STRUCTURES, structureByKey, emptySquad, bank, addPlayer, removePlayer, swapStarter,
  applyStructure, autoComplete, squadCountPos, clubCount, isComplete,
} from "../../lib/solver/squad";
import { evaluateSquad } from "../../lib/solver/evaluate";
import BuilderPitch from "../../components/BuilderPitch";
import ShortlistPanel from "../../components/ShortlistPanel";
import Feedback from "../../components/Feedback";
import Fan from "../../components/Fan";
import Opp from "../../components/Opp";
import { FixtureRun } from "../../components/FixtureXP";
import { buildOpponentScale } from "../../lib/opponent";
import { buildPayload, payloadBrief, alternativesBlock, maybesBlock } from "../../lib/payload.mjs";
import { bestXI } from "../../lib/solver/autobuild.mjs";
import FITTED from "../../config/fitted-params.json";
import SCHEDULE from "../../config/schedule.js";
import { scoreSquad } from "../../lib/scoring";
import { buildVariants } from "../../lib/variants.mjs";
import { templateSquad } from "../../lib/data";

const TABS = [["build", "Build"]];
const POS_ORDER = ["GKP", "DEF", "MID", "FWD"];

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", left: "50%", bottom: 34, transform: "translateX(-50%)", zIndex: 60,
      background: T.row, border: `1px solid ${toast.bad ? T.pink : T.green}`, borderRadius: 999, padding: "12px 22px",
      boxShadow: "0 12px 36px rgba(0,0,0,0.6)", ...lang(14.5, 700) }}>
      {toast.text}
    </div>
  );
}

function TabBar({ tab, setTab, draftCount }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {TABS.map(([key, label]) => {
        const on = tab === key;
        return (
          <button key={key} onClick={() => setTab(key)} className="fb-press"
            style={{ height: 42, padding: "0 20px", borderRadius: 999, background: on ? T.green : T.card,
              border: `1px solid ${on ? T.green : T.line}`, ...lang(14.5, 700, on ? "#04130A" : "#FFFFFF") }}>
            {label.toUpperCase()}{key === "drafts" && draftCount ? ` (${draftCount})` : ""}
          </button>
        );
      })}
    </div>
  );
}

/* Ranked candidates for one position, inside the remaining budget envelope. */
/* One list for the whole pool. You search and filter by position rather than picking a slot first,
   because choosing a slot before you know who is available is the wrong order. */
function Candidates({ pos, pool, squad, scoreOf, bandOf, gateOpen, onAdd, max, oppOf, scale, xpOf, run5Of }) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("xP NEXT");
  const [hideFlagged, setHideFlagged] = React.useState(true);
  const [maxPrice, setMaxPrice] = React.useState("ALL");

  const cheapest = React.useMemo(() => {
    const out = {};
    for (const p of pool) {
      const cur = out[p.position];
      if (!cur || Number(p.price) < cur) out[p.position] = Number(p.price);
    }
    return out;
  }, [pool]);

  const reserve = React.useMemo(() => {
    let r = 0;
    for (const other of POS_ORDER) {
      const missing = RULES.composition[other] - squadCountPos(squad, other);
      const count = other === pos ? missing - 1 : missing;
      if (count > 0) r += count * (cheapest[other] ?? 0);
    }
    return Math.max(0, r);
  }, [squad, pos, cheapest]);

  const envelope = +(bank(squad) - reserve).toFixed(1);
  const left = RULES.composition[pos] - squadCountPos(squad, pos);

  // Position is a filter, not a gate. ALL searches the whole pool; the position pills narrow it.
  const [posFilter, setPosFilter] = React.useState("ALL");
  React.useEffect(() => { setPosFilter(pos || "ALL"); }, [pos]);

  const list = React.useMemo(() => {
    const owned = new Set(squad.players.map((p) => p.fpl_id));
    let l = pool.filter((p) => !owned.has(p.fpl_id));
    if (posFilter !== "ALL") l = l.filter((p) => p.position === posFilter);
    if (q) l = l.filter((p) => (p.web_name + " " + p.name + " " + p.team).toLowerCase().includes(q.toLowerCase()));
    if (hideFlagged) l = l.filter((p) => p.status === "a");
    if (maxPrice !== "ALL") l = l.filter((p) => Number(p.price) <= Number(maxPrice));
    const by = {
      "xP NEXT": (a, b) => (xpOf ? (xpOf(b) ?? -99) - (xpOf(a) ?? -99) : scoreOf(b) - scoreOf(a)),
      "xP NEXT 5": (a, b) => (run5Of ? (run5Of(b) ?? -99) - (run5Of(a) ?? -99) : scoreOf(b) - scoreOf(a)),
      SCORE: (a, b) => scoreOf(b) - scoreOf(a),
      VALUE: (a, b) => scoreOf(b) / Number(b.price) - scoreOf(a) / Number(a.price),
      OWNED: (a, b) => Number(b.own) - Number(a.own),
      PRICE: (a, b) => Number(b.price) - Number(a.price),
      NAME: (a, b) => a.web_name.localeCompare(b.web_name),
    }[sort] || ((a, b) => scoreOf(b) - scoreOf(a));
    return [...l].sort(by).slice(0, 80);
  }, [pool, posFilter, q, sort, hideFlagged, maxPrice, squad, scoreOf, xpOf, run5Of]);

  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Label color={T.green}>All players · {squad.structure}</Label>
          <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>
            {posFilter === "ALL" ? `${list.length} available` : left > 0 ? `Pick ${left} more ${POS_LABEL[posFilter]}` : `${POS_LABEL[posFilter]} filled`}
          </h2>
        </div>
        <Plate w={104} h={40} size={14}>{envelope.toFixed(1)} max</Plate>
      </header>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 170, display: "flex", alignItems: "center", gap: 9, background: T.row, border: `1px solid ${T.line}`, borderRadius: 12, padding: "0 13px", height: 40 }}>
          <Search size={15} color="#FFFFFF" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or club"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", ...lang(14.5) }} />
        </div>
        {["ALL", "GKP", "DEF", "MID", "FWD"].map((k) => (
          <button key={k} onClick={() => setPosFilter(k)} className="fb-press"
            style={{ height: 40, padding: "0 14px", borderRadius: 999, ...lang(13.5, 700, posFilter === k ? "#04130A" : "#FFFFFF"),
              background: posFilter === k ? T.green : T.card, border: `1px solid ${posFilter === k ? T.green : T.line}` }}>
            {k === "ALL" ? "ALL" : POS_LABEL[k]}
          </button>
        ))}
        {[["xP NEXT", "xP next"], ["xP NEXT 5", "xP next 5"], ["VALUE", "Value"], ["OWNED", "Owned"], ["PRICE", "Price"], ["NAME", "Name"]].map(([k, label]) => (
          <button key={k} onClick={() => setSort(k)} className="fb-press"
            style={{ height: 40, padding: "0 14px", borderRadius: 999, background: sort === k ? T.green : T.row,
              border: `1px solid ${sort === k ? T.green : T.line}`, ...lang(13.5, 700, sort === k ? "#04130A" : "#FFFFFF") }}>
            {label.toUpperCase()}
          </button>
        ))}
        <button onClick={() => setHideFlagged(!hideFlagged)} className="fb-press"
          style={{ height: 40, padding: "0 14px", borderRadius: 999, background: hideFlagged ? T.tag : T.row,
            border: `1px solid ${hideFlagged ? T.tag : T.line}`, ...lang(13.5, 700) }}>
          HIDE FLAGGED
        </button>
        <select value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
          style={{ height: 40, borderRadius: 12, background: T.row, border: `1px solid ${T.line}`, padding: "0 10px", ...lang(14, 700) }}>
          {["ALL", "4.5", "5.5", "6.5", "8.0", "10.0", "13.0"].map((o) => (
            <option key={o} value={o} style={{ background: T.row }}>{o === "ALL" ? "Any price" : `Up to ${o}`}</option>
          ))}
        </select>
      </div>

      <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
        {list.map((p) => {
          const affordable = Number(p.price) <= envelope + 1e-9;
          const clubFull = clubCount(squad, p.team_id) >= RULES.maxPerClub;
          const blocked = !affordable || clubFull || left <= 0;
          return (
            <div key={p.fpl_id} style={{ display: "grid", gridTemplateColumns: "minmax(150px,1fr) 92px 72px 72px 96px", gap: 10, alignItems: "center",
              height: S.row, padding: "0 12px", borderRadius: S.radiusSm, background: T.row, opacity: blocked ? 0.5 : 1 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Kit team={p.team} size={22} />
                <span style={{ ...lang(S.name, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                <span style={{ ...code(), flexShrink: 0 }}>{p.team}</span>
              </span>
              <span style={{ display: "flex", justifyContent: "center" }}><Opp fx={oppOf ? oppOf(p) : null} scale={scale} size="sm" showNumber={false} /></span>
              <Value>{Number(p.price).toFixed(1)}</Value>
              <span style={{ ...val(S.data), textAlign: "center" }}>{scoreOf(p).toFixed(1)}</span>
              <button onClick={() => onAdd(p)} disabled={blocked} className="fb-press"
                style={{ height: 36, borderRadius: 999, background: blocked ? T.plate : T.green, ...lang(13.5, 700, blocked ? "#FFFFFF" : "#04130A") }}>
                {clubFull ? "3 MAX" : !affordable ? "OVER" : left <= 0 ? "FULL" : "ADD"}
              </button>
            </div>
          );
        })}
        {!list.length && <div style={{ padding: "30px 0", textAlign: "center", ...lang(15) }}>Nothing fits that filter inside the budget envelope.</div>}
      </div>
    </section>
  );
}

/* Guided step one: shapes ranked by evidence, each with its score and a one-line why. */
function StructureCards({ scores, onPick, chosen }) {
  const top = scores.length ? scores[0].key : null;
  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Label color={T.green}>Step one</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(24, 700) }}>Choose a shape</h2>
      </div>
      <span style={val(13, "#FFFFFF", 500)}>HISTORIC FITTED ON 9 SEASONS · VALUE FROM TODAY&apos;S MARKET</span>
      <p style={{ ...lang(14, 600), lineHeight: 1.55, margin: 0 }}>
        Change this at any time later. The fifteen you pick are kept and the eleven is rearranged.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        {scores.map((s) => (
          <button key={s.key} onClick={() => onPick(s.key)} className="fb-hover"
            style={{ background: chosen === s.key ? "rgba(0,255,133,0.12)" : T.row, borderRadius: S.radiusSm, padding: "16px 16px 14px",
              border: `1px solid ${chosen === s.key ? T.green : T.line}`, textAlign: "left", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ ...D, fontSize: 22, color: "#FFFFFF" }}>{s.key}</span>
              {s.key === top && s.score !== null && (
                <span style={{ display: "flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: 999, background: T.tag, ...val(13, "#FFFFFF", 500) }}>TOP</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Plate w={64} color={s.histTone}>{s.hist.toFixed(1)}</Plate>
              <span style={lang(13, 600)}>historic per week</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Plate w={64} color={s.value >= 95 ? T.green : s.value >= 85 ? "#FFFFFF" : T.pink}>{s.value}</Plate>
              <span style={lang(13, 600)}>{s.score !== null ? `${s.score.toFixed(1)} projected` : "value today"}</span>
            </div>
            <span style={{ ...lang(13.5, 600), lineHeight: 1.45 }}>
              Thinnest at {s.thin.pos} {s.thin.need}
            </span>
          </button>
        ))}
        {!scores.length && <SkeletonRows n={3} h={110} />}
      </div>
    </section>
  );
}





function DraftCard({ draft, readout, onLoad, onDelete, onPlan, selected, onSelect }) {
  const s = draft.squad || {};
  const picks = s.picks || [];
  const done = picks.length;
  // What is still missing, by position, so an incomplete draft says so on its own card.
  const missing = React.useMemo(() => {
    if (done >= RULES.size) return null;
    const need = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
    for (const p of picks) if (p.position && need[p.position] !== undefined) need[p.position] -= 1;
    const gaps = Object.entries(need).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k === "GKP" ? "GK" : k}`);
    return gaps.length ? gaps.join(", ") : `${RULES.size - done} more`;
  }, [picks, done]);
  return (
    <div style={{ background: T.card, border: `1px solid ${selected ? T.green : T.line}`, borderRadius: S.radius, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={lang(18, 700)}>{draft.name}</span>
            {draft.is_plan_of_record && <Star size={15} color={T.tag} fill={T.tag} />}
          </div>
          <div style={{ marginTop: 5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={code(13)}>{s.structure || "NO SHAPE"}</span>
            <span style={val(13, done === RULES.size ? T.green : "#FFFFFF", 500)}>{done}/{RULES.size}</span>
            <span style={val(13, "#FFFFFF", 500)}>{new Date(draft.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
          </div>
          <div style={{ marginTop: 6, height: 4, width: 148, borderRadius: 2, background: T.plate, overflow: "hidden" }}>
            <div style={{ height: 4, width: `${(done / RULES.size) * 100}%`, background: done === RULES.size ? T.green : T.cyan }} />
          </div>
          {missing && <div style={{ marginTop: 6, ...lang(13, 600) }}>Still needs {missing}</div>}
        </div>
        <button onClick={() => onSelect(draft.id)} className="fb-press"
          style={{ height: 32, padding: "0 12px", borderRadius: 999, background: selected ? T.green : T.row, border: `1px solid ${selected ? T.green : T.line}`, ...lang(13, 700, selected ? "#04130A" : "#FFFFFF") }}>
          {selected ? "PICKED" : "COMPARE"}
        </button>
      </div>
      {readout && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
          {[["POINTS", readout.points.mean.toFixed(0)], ["CAPTAIN", readout.captaincy ? readout.captaincy.best.ev.toFixed(1) : "Not set"],
            ["RISKS", readout.risk.count], ["BANK", readout.structure.bank.toFixed(1)]].map(([l, v2]) => (
            <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: T.plate, borderRadius: 10, padding: "9px 0" }}>
              <span style={lang(13, 700)}>{l}</span>
              <span style={val(14)}>{v2}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onLoad(draft)} className="fb-press" style={{ flex: 1, height: 38, borderRadius: 999, background: T.green, ...lang(13.5, 700, "#04130A"), display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          <Upload size={14} /> LOAD
        </button>
        <button onClick={() => onPlan(draft)} className="fb-press" style={{ height: 38, padding: "0 14px", borderRadius: 999, background: T.row, border: `1px solid ${T.line}`, ...lang(13.5, 700) }}>
          SET PLAN
        </button>
        <button onClick={() => onDelete(draft)} className="fb-press" style={{ width: 38, height: 38, borderRadius: 19, background: T.row, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Trash2 size={15} color={T.pink} />
        </button>
      </div>
    </div>
  );
}

export default function BuilderClient() {
  const [core, setCore] = React.useState(null);
  const [draftsError, setDraftsError] = React.useState(null);
  const [eoByPlayerId, setEoByPlayerId] = React.useState(new Map());
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [tab, setTab] = React.useState("build");
  const [squad, setSquad] = React.useState(() => emptySquad("3-5-2"));
  // BEST XI controls. Locks are players Louis has pinned into the eleven; horizon is how many
  // gameweeks the build maximises over.
  const [locks, setLocks] = React.useState([]);
  // Ignored players are excluded from every auto-build for this draft, so the next best option comes
  // through instead. Cleared when a draft is loaded, like locks.
  const [ignores, setIgnores] = React.useState([]);
  // Formation lock: when on, the auto-build may not change the shape.
  const [formationLocked, setFormationLocked] = React.useState(false);
  // Undo: one step back to the squad exactly as it was before the last action.
  const [undoState, setUndoState] = React.useState(null);
  // The maybe pile: players under consideration but not bought. Feeds the payload so the AI knows
  // what is already on the shortlist.
  const [maybeIds, setMaybeIds] = React.useState([]);
  const [horizon, setHorizon] = React.useState(1);
  const [activeSlot, setActiveSlot] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [drafts, setDrafts] = React.useState([]);
  const [compare, setCompare] = React.useState([]);
  const [menuFor, setMenuFor] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");

  const say = React.useCallback((text, bad = false) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), 2600);
  }, []);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore()
      .then(async (c) => { setCore(c); setModel(await loadModel(c)); })
      .catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const loadDrafts = React.useCallback(() => {
    fetch("/api/drafts")
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setDrafts(j.drafts); setDraftsError(null); } else setDraftsError(j.error || "Draft saving is unavailable."); })
      .catch(() => setDraftsError("Draft saving is unavailable."));
  }, []);
  React.useEffect(() => { loadDrafts(); }, [loadDrafts]);


  // Top-rank effective ownership, newest snapshot. Absent before any gameweek has been played, and
  // the panel then shows nothing rather than a zero.
  React.useEffect(() => {
    if (!core) return;
    sb().from("eo_snapshots").select("player_id, eo, gw").eq("scope", "top10k_proxy")
      .order("gw", { ascending: false }).limit(1000)
      .then(({ data }) => {
        if (!data || !data.length) return;
        const newest = data[0].gw;
        const fplById = new Map(core.players.map((p) => [p.id, p.fpl_id]));
        const m = new Map();
        for (const r of data) {
          if (r.gw !== newest) continue;
          const fpl = fplById.get(r.player_id);
          if (fpl) m.set(fpl, Number(r.eo));
        }
        setEoByPlayerId(m);
      })
      .catch(() => {});
  }, [core]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setActiveSlot(null); setMenuFor(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pool = React.useMemo(() => {
    if (!core || !model) return [];
    return core.players.map((p) => {
      const env = model.envByTeam.get(p.team_id);
      return { ...p, nextLabel: env ? `GW${env.gw}${env.home ? "" : " (A)"}` : null };
    });
  }, [core, model]);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);
  // Template fifteen is the most-owned legal fifteen, from live ownership.
  // templateSquad returns a flat fifteen, XI first then bench. Not an object.
  const templateFifteen = React.useMemo(() => (core ? templateSquad(core.players) : []), [core]);
  const xpOf = React.useCallback((p) => {
    if (!model || !core) return null;
    const f = nextFixtures(core.fixtures, core.teamById, p.team_id, 1)[0];
    return f ? model.scoreForGw(p, f.gw) : null;
  }, [model, core]);
  const run5Of = React.useCallback((p) => {
    if (!model || !core) return null;
    const vals = nextFixtures(core.fixtures, core.teamById, p.team_id, 5)
      .map((f) => model.scoreForGw(p, f.gw)).filter((v) => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) : null;
  }, [model, core]);

  const oppOf = React.useCallback(
    (p) => (core ? nextFixtures(core.fixtures, core.teamById, p.team_id, 1)[0] || null : null),
    [core],
  );

  const ctx = React.useMemo(() => {
    if (!model) return null;
    return {
      scoreOf: model.scoreOf, bandOf: model.bandOf, tailOf: model.tailOf, floorOf: model.floorOf,
      minutes: model.minutes, perGw: model.perGw,
    };
  }, [model]);

  const evaluation = React.useMemo(() => (ctx ? evaluateSquad(squad, horizon, ctx) : null), [squad, horizon, ctx]);
  const scores = React.useMemo(() => {
    if (!ctx || !pool.length) return null;
    const bestCap = evaluation && evaluation.captaincy && evaluation.captaincy.best ? evaluation.captaincy.best.ev : null;
    return scoreSquad({ squad, pool, scoreOf: ctx.scoreOf, bestCaptainEv: bestCap, templateFifteen, eoByPlayerId });
  }, [ctx, pool, squad, evaluation, templateFifteen, eoByPlayerId]);


  const structureScores = React.useMemo(() => {
    if (!ctx || !pool.length) return [];
    // A shape is only worth scoring once there are real players to complete. With an empty squad
    // every shape scores the market's ceiling, not this squad, so no number is shown at all.
    const picked = squad.players.length > 0;
    const ranked = {};
    for (const pos of POS_ORDER) {
      ranked[pos] = pool.filter((p) => p.position === pos).sort((a, b) => ctx.scoreOf(b) - ctx.scoreOf(a));
    }
    return STRUCTURES.map((st) => {
      const base = picked ? { ...squad, structure: st.key } : emptySquad(st.key);
      const filled = autoComplete(base, pool, ctx.scoreOf);
      const readout = evaluateSquad(filled, 1, ctx);
      // Per-line evidence, arithmetic over the live pool only: what the shape demands, what those
      // starters return per million, and how far the score falls at the margin. A steep fall means
      // the shape is asking for players the market prices dearly.
      const lines = ["DEF", "MID", "FWD"].map((pos) => {
        const need = st[pos];
        const list = ranked[pos] || [];
        const starters = list.slice(0, need);
        // Guarded divisor: a sub-£3 price is a data fault, not a bargain, so it cannot inflate value.
        const perM = starters.length
          ? starters.reduce((a, p) => a + ctx.scoreOf(p) / Math.max(3, Number(p.price)), 0) / starters.length
          : 0;
        const last = starters.length ? ctx.scoreOf(starters[starters.length - 1]) : 0;
        const next = list[need] ? ctx.scoreOf(list[need]) : 0;
        return { pos, need, perM, drop: Math.max(0, last - next) };
      });
      const slots = lines.reduce((a, l) => a + l.need, 0);
      const rawValue = slots ? lines.reduce((a, l) => a + l.perM * l.need, 0) / slots : 0;
      const thin = lines.slice().sort((a, b) => b.drop - a.drop)[0];
      // Real historical evidence: what an XI in this shape has returned per gameweek across nine
      // seasons, using points-per-start fitted per position on 2016/17-2024/25. Price-blind by
      // design: it answers "what does this shape return", not "what does it cost".
      const PPS = FITTED.position_points_per_start;
      const hist = PPS.GKP + lines.reduce((a, l) => a + l.need * PPS[l.pos], 0);
      return {
        key: st.key,
        score: picked ? readout.points.mean : null,
        rawValue,
        hist,
        thin,
        bank: readout.structure.bank,
        premiums: readout.structure.premiums,
      };
    })
      .map((r, _, all) => {
        // Normalised 0-100 across the eight shapes so one glance ranks them.
        const best = Math.max(...all.map((x) => x.rawValue)) || 1;
        const hiHist = Math.max(...all.map((x) => x.hist));
        const loHist = Math.min(...all.map((x) => x.hist));
        const spread = hiHist - loHist || 1;
        const rel = (r.hist - loHist) / spread;
        return { ...r, value: Math.round((r.rawValue / best) * 100), histTone: rel > 0.66 ? T.green : rel > 0.33 ? "#FFFFFF" : T.pink };
      })
      .sort((a, b) => (b.score ?? b.value) - (a.score ?? a.value));
  }, [ctx, pool, squad]);

  const maxScore = React.useMemo(() => {
    if (!ctx || !pool.length) return 8;
    return Math.max(4, ...pool.slice(0, 60).map((p) => ctx.bandOf(p).p90 || 0));
  }, [ctx, pool]);


  const add = (p) => {
    if (squad.players.length >= RULES.size) return say("The squad is full at 15 players.", true);
    if (squadCountPos(squad, p.position) >= RULES.composition[p.position]) return say(`You already have ${RULES.composition[p.position]} in that position.`, true);
    if (clubCount(squad, p.team_id) >= RULES.maxPerClub) return say(`Three from ${p.team} is the limit.`, true);
    if (Number(p.price) > bank(squad) + 1e-9) return say(`${p.web_name} costs more than the ${bank(squad).toFixed(1)} you have left.`, true);
    setSquad((s) => addPlayer(s, p));
    say(`${p.web_name} added.`);
  };

  const remove = (p) => { setSquad((s) => removePlayer(s, p.fpl_id)); setMenuFor(null); say(`${p.web_name} removed.`); };
  const swap = (from, to) => {
    if (from.position !== to.position) return say("Swaps are same-position only.", true);
    const benchId = from.starting ? to.fpl_id : from.fpl_id;
    const starterId = from.starting ? from.fpl_id : to.fpl_id;
    setSquad((s) => swapStarter(s, benchId, starterId));
  };
  const setStructure = (key) => setSquad((s) => applyStructure(s, key, ctx ? ctx.scoreOf : () => 0));

  const xpOverHorizon = React.useCallback((p) => {
    if (!model || !core) return ctx ? ctx.scoreOf(p) : 0;
    const fx = nextFixtures(core.fixtures, core.teamById, p.team_id, horizon);
    const vals = fx.map((f) => model.scoreForGw(p, f.gw)).filter((v) => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) : (ctx ? ctx.scoreOf(p) : 0);
  }, [model, core, ctx, horizon]);

  /* Arriving from the dashboard's "edit this as a draft": seat the most-owned fifteen so Louis can work
     from the template rather than an empty pitch. Runs once, only when the flag is present. */
  const [templateLoaded, setTemplateLoaded] = React.useState(false);
  // The plan being edited. Arriving with ?plan=id loads it; saving writes back to the same row.
  const [planId, setPlanId] = React.useState(null);
  const [planName, setPlanName] = React.useState("");
  const [planLoaded, setPlanLoaded] = React.useState(false);

  React.useEffect(() => {
    if (planLoaded || !core || !ctx || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("plan");
    if (!id) { setPlanLoaded(true); return; }
    fetch("/api/plans").then((r) => r.json()).then((j) => {
      const all = j.ok ? [...(j.plans || []), ...(j.live ? [j.live] : [])] : [];
      const row = all.find((x) => String(x.id) === String(id));
      if (!row) { say("That plan could not be found.", true); setPlanLoaded(true); return; }
      const byId = new Map(pool.map((pl) => [pl.fpl_id, pl]));
      const players = (row.base || [])
        .map((b) => { const pl = byId.get(b.fpl_id); return pl ? { ...pl, starting: Boolean(b.starting) } : null; })
        .filter(Boolean);
      setPlanId(row.id); setPlanName(row.name || "");
      setSquad({ structure: row.structure || "3-5-2", captain: row.captain ?? null, vice: row.vice ?? null, players });
      setIgnores(row.ignores || []); setMaybeIds(row.maybe_ids || []);
      const dropped = (row.base || []).length - players.length;
      say(dropped > 0 ? `${row.name} opened. ${dropped} player${dropped === 1 ? "" : "s"} no longer in the league.` : `${row.name} opened.`);
      setPlanLoaded(true);
    }).catch(() => { say("That plan could not be loaded.", true); setPlanLoaded(true); });
  }, [core, ctx, pool, planLoaded]);

  const savePlan = async () => {
    if (!squad.players.length) { say("Nothing to save yet.", true); return; }
    const body = {
      action: "save", id: planId || undefined,
      name: planName || draftName || `${squad.structure} plan`,
      structure: squad.structure, captain: squad.captain, vice: squad.vice,
      base: squad.players.map((pl) => ({
        fpl_id: pl.fpl_id, position: pl.position, team_id: pl.team_id,
        price: Number(pl.price), purchasePrice: Number(pl.price), starting: Boolean(pl.starting),
      })),
      weeks: {}, ignores, maybeIds,
    };
    const r = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json()).catch(() => ({ ok: false, error: "The request failed." }));
    if (!r.ok) { say(r.error, true); return; }
    if (r.id) setPlanId(r.id);
    say(planId ? "Plan updated." : "Plan saved. It is on the Squad screen.");
  };
  React.useEffect(() => {
    if (templateLoaded || !core || !ctx) return;
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("from") !== "template") return;
    // templateFifteen is a flat fifteen. Seat it through the solver so the formation is legal and the
    // strongest eleven starts, rather than trusting the order it happens to arrive in.
    const ids = templateFifteen.map((pl) => pl.fpl_id);
    if (ids.length) {
      const r = bestXI({ pool, xpOf: xpOverHorizon, keep: ids, ignores, startProbOf: model.startProbOf });
      if (r) {
        setSquad((sq) => ({ ...sq, structure: r.formation, players: [...r.xi, ...r.bench] }));
        say("Template loaded. Nothing is saved until you save a draft.");
      }
    }
    setTemplateLoaded(true);
  }, [core, ctx, templateLoaded, templateFifteen, pool, xpOverHorizon, ignores, model]);

  const snapshot = () => setUndoState({ squad, locks, ignores, maybeIds });
  const undo = () => {
    if (!undoState) { say("Nothing to undo.", true); return; }
    setSquad(undoState.squad); setLocks(undoState.locks);
    setIgnores(undoState.ignores); setMaybeIds(undoState.maybeIds);
    setUndoState(null);
    say("Undone.");
  };

  /* BEST XI: fill what is empty, keep everything already picked. Nothing you chose is ever dropped.
     Whether a kept player STARTS is still the solver's call, so a cheap filler can move to the bench,
     but he stays in your fifteen. */
  const doBestXI = () => {
    try {
      snapshot();
      const keep = squad.players.map((pl) => pl.fpl_id);
    if (!ctx || !pool.length) return;
    const r = bestXI({ pool, xpOf: xpOverHorizon, locks, keep, ignores, startProbOf: model.startProbOf,
      onlyFormation: formationLocked ? squad.structure : null });
    if (!r) { say("No legal squad fits the budget with those locks.", true); return; }
    const players = [...r.xi, ...r.bench];
    const captain = [...r.xi].sort((a, b) => xpOverHorizon(b) - xpOverHorizon(a))[0];
    setSquad((sq) => ({ ...sq, structure: r.formation, players, captain: captain ? captain.fpl_id : sq.captain }));
    const added = [...r.xi, ...r.bench].filter((pl) => !keep.includes(pl.fpl_id)).length;
    say(added > 0
      ? `${added} added around your ${keep.length}. ${r.xp} xP, ${r.cost} spent, ${r.formation}.`
      : `Nothing left to fill. ${r.xp} xP, ${r.formation}.`);
    } catch (e) { say(`Best XI failed: ${e.message}`, true); }
  };

  /* REBUILD FROM SCRATCH: discards everything except explicit locks and ignores. Separate button and
     separate label, because this is the destructive one. */
  const doRebuild = () => {
    try {
      if (!ctx || !pool.length) return;
      snapshot();
      const r = bestXI({ pool, xpOf: xpOverHorizon, locks, ignores, startProbOf: model.startProbOf,
        onlyFormation: formationLocked ? squad.structure : null });
      if (!r) { say("No legal squad fits those locks.", true); return; }
      const captain = [...r.xi].sort((a, b) => xpOverHorizon(b) - xpOverHorizon(a))[0];
      setSquad((sq) => ({ ...sq, structure: r.formation, players: [...r.xi, ...r.bench], captain: sq.captain ?? (captain ? captain.fpl_id : null) }));
      say(`Rebuilt: ${r.xp} xP, ${r.cost} spent, ${r.formation}.`);
    } catch (e) { say(`Fill failed: ${e.message}`, true); }
  };

    const maybes = React.useMemo(() => pool.filter((p) => maybeIds.includes(p.fpl_id)), [pool, maybeIds]);
  const ignoredPlayers = React.useMemo(() => pool.filter((p) => ignores.includes(p.fpl_id)), [pool, ignores]);
  const toggleMaybe = (p) => setMaybeIds((l) => (l.includes(p.fpl_id) ? l.filter((x) => x !== p.fpl_id) : [...l, p.fpl_id]));
  const toggleIgnore = (p) => setIgnores((l) => (l.includes(p.fpl_id) ? l.filter((x) => x !== p.fpl_id) : [...l, p.fpl_id]));
  const toggleLock = (p) => setLocks((l) => (l.includes(p.fpl_id) ? l.filter((x) => x !== p.fpl_id) : [...l, p.fpl_id]));

  const doAutoComplete = () => {
    if (!ctx) return;
    const before = squad.players.length;
    const next = autoComplete(squad, pool, ctx.scoreOf);
    setSquad(next);
    const added = next.players.length - before;
    say(added > 0 ? `${added} slot${added === 1 ? "" : "s"} filled.` : "Nothing left to fill.", added === 0);
  };

  // B-16: three GW1 variants, saved as drafts so they compare side by side on the same readouts.
  const [makingVariants, setMakingVariants] = React.useState(false);
  const generateVariants = async () => {
    if (!ctx || !pool.length) return;
    setMakingVariants(true);
    try {
      const variants = buildVariants({
        pool, scoreOf: ctx.scoreOf,
        buildSquad: (objective) => autoComplete(emptySquad(squad.structure || "3-5-2"), pool, objective),
        evaluate: (sq) => evaluateSquad(sq, horizon, ctx),
      });
      for (const v of variants) {
        const payload = {
          name: `GW1 ${v.name}`,
          squad: {
            structure: v.squad.structure,
            picks: v.squad.players.map((p) => ({ fpl_id: p.fpl_id, starting: p.starting, position: p.position })),
            captain: v.squad.captain ?? null, vice: v.squad.vice ?? null,
          },
          evalCache: v.readout ? { points: v.readout.points, structure: v.readout.structure } : null,
        };
        const r = await fetch("/api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json());
        if (!r.ok) throw new Error(r.error);
      }
      loadDrafts();
      say("Three GW1 variants saved. Compare them in Drafts.");
    } catch (e) {
      say(e.message || "Could not build the variants.", true);
    } finally {
      setMakingVariants(false);
    }
  };

  // Copy Analyst Payload: everything a model needs about this squad, as text, at no running cost.
  const copyPayload = async () => {
    if (!ctx || !model) return;
    const text = [
      payloadBrief(),
      buildPayload({
        squad, pool, scoreOf: ctx.scoreOf, metricName: metricName(model.gateOpen),
        evaluation, scores, oppOf, scale, gateOpen: model.gateOpen, fitted: FITTED,
      }),
      maybesBlock({ maybes, scoreOf: ctx.scoreOf }),
      alternativesBlock({ pool, scoreOf: ctx.scoreOf, squad }),
    ].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      say("Payload copied. Paste it into your Claude project.");
    } catch {
      say("Could not reach the clipboard. Check the browser permission.", true);
    }
  };

  const saveDraft = async () => {
    // DECISIONS 6.15: no completeness requirement, no blocking validation. An empty draft saves.
    setSaving(true);
    const payload = {
      name: draftName || `${squad.structure} draft`,
      mode: "free",
      squad: {
        structure: squad.structure, captain: squad.captain, vice: squad.vice,
        // Saved with the draft so reopening it restores exactly what was excluded and shortlisted.
        ignores, maybeIds, locks, formationLocked,
        picks: squad.players.map((p) => ({ fpl_id: p.fpl_id, starting: p.starting, position: p.position })),
      },
      evalCache: evaluation ? { points: evaluation.points, risks: evaluation.risk.count, bank: evaluation.structure.bank } : null,
    };
    try {
      const r = await fetch("/api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setDraftName("");
      loadDrafts();
      const n = squad.players.length;
      say(n === RULES.size ? "Draft saved, squad complete." : `Draft saved with ${n} of ${RULES.size} picked.`);
    } catch (e) {
      say(e.message || "The draft could not be saved.", true);
    } finally {
      setSaving(false);
    }
  };



  const hydrate = React.useCallback((draft) => {
    const byId = new Map(pool.map((p) => [p.fpl_id, p]));
    const s = draft.squad || {};
    const players = (s.picks || [])
      .map((pick) => { const p = byId.get(pick.fpl_id); return p ? { ...p, starting: Boolean(pick.starting) } : null; })
      .filter(Boolean);
    return { structure: s.structure || "3-5-2", captain: s.captain ?? null, vice: s.vice ?? null, players,
      ignores: s.ignores || [], maybeIds: s.maybeIds || [], locks: s.locks || [], formationLocked: Boolean(s.formationLocked) };
  }, [pool]);

  const loadDraft = (draft) => {
    const s = hydrate(draft);
    const saved = ((draft.squad || {}).picks || []).length;
    if (saved > s.players.length) {
      // Silently returning a short squad is worse than saying what happened.
      say(`${saved - s.players.length} of ${saved} picks are no longer in the league and were dropped.`, true);
    }
    if (s.players.length !== ((draft.squad && draft.squad.picks) || []).length) say("Some players in that draft are no longer in the database.", true);
    setSquad({ structure: s.structure, captain: s.captain, vice: s.vice, players: s.players });
    setIgnores(s.ignores); setMaybeIds(s.maybeIds); setLocks(s.locks); setFormationLocked(s.formationLocked);
    setUndoState(null);
    setTab("build");
    say(`${draft.name} loaded onto the pitch.`);
  };

  const deleteDraft = async (draft) => {
    const r = await fetch(`/api/drafts?id=${draft.id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (r.ok) { setCompare((c) => c.filter((x) => x !== draft.id)); loadDrafts(); say(`${draft.name} deleted.`); }
    else say("That draft could not be deleted.", true);
  };
  const setPlan = async (draft) => {
    const r = await fetch("/api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", id: draft.id }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (r.ok) { loadDrafts(); say(`${draft.name} is the plan of record.`); } else say("That could not be set.", true);
  };

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || !ctx) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: S.gap }}>
        <Skeleton h={560} /><Skeleton h={560} />
      </div>
    );
  }

  const slotPos = activeSlot;


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <TabBar tab={tab} setTab={setTab} draftCount={drafts.length} />
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <button onClick={undo} disabled={!undoState} className="fb-press"
            style={{ height: 42, padding: "0 16px", borderRadius: 999, background: T.card,
              border: `1px solid ${T.line}`, ...lang(14, 700), opacity: undoState ? 1 : 0.45 }}>
            UNDO
          </button>
          <button onClick={doBestXI} className="fb-press"
            style={{ height: 42, padding: "0 18px", borderRadius: 999, background: T.green, display: "flex", alignItems: "center", gap: 8, ...lang(14, 700, "#04130A") }}>
            <Wand2 size={15} color="#04130A" /> BEST XI{locks.length ? ` · ${locks.length} LOCKED` : ""}
          </button>
          <button onClick={() => { setSquad(emptySquad(squad.structure || "3-5-2")); setLocks([]); say("Squad cleared."); }} className="fb-press"
            style={{ height: 42, padding: "0 16px", borderRadius: 999, background: T.card, border: `1px solid ${T.line}`, ...lang(14, 700) }}>
            CLEAR SQUAD
          </button>
          <button onClick={doRebuild} className="fb-press"
            style={{ height: 42, padding: "0 16px", borderRadius: 999, background: T.card, border: `1px solid ${T.line}`, ...lang(14, 700) }}>
            REBUILD ALL
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 42, padding: "0 8px", borderRadius: 999, background: T.card, border: `1px solid ${T.line}` }}>
            <button onClick={() => setHorizon((h) => Math.max(1, h - 1))} className="fb-press" style={{ width: 26, height: 26, borderRadius: 999, background: T.plate, ...lang(15, 700) }}>−</button>
            <span style={val(14)}>{horizon} GW{horizon === 1 ? "" : "s"}</span>
            <button onClick={() => setHorizon((h) => Math.min(8, h + 1))} className="fb-press" style={{ width: 26, height: 26, borderRadius: 999, background: T.plate, ...lang(15, 700) }}>+</button>
          </div>
          <input value={planName || draftName} onChange={(e) => { setPlanName(e.target.value); setDraftName(e.target.value); }} placeholder={planId ? "Plan name" : "Name this plan"}
            style={{ height: 42, width: 150, borderRadius: 12, background: T.card, border: `1px solid ${T.line}`, padding: "0 14px", outline: "none", ...lang(14) }} />
          <button onClick={copyPayload} className="fb-press"
            style={{ display: "flex", alignItems: "center", gap: 8, height: S.btn, padding: "0 18px", borderRadius: 999,
              background: T.row, border: `1px solid ${T.line}`, ...lang(14.5, 700) }}>
            Copy payload
          </button>
          <button onClick={savePlan} disabled={saving} className="fb-press"
            style={{ height: 42, padding: "0 18px", borderRadius: 999, background: T.green, display: "flex", alignItems: "center", gap: 8, ...lang(14, 700, "#04130A") }}>
            <Save size={15} /> {saving ? "SAVING" : "SAVE PLAN"}
          </button>
          <Plate w={104} h={42} size={15} color={bank(squad) < 0 ? T.pink : T.green}>{bank(squad).toFixed(1)} left</Plate>
        </div>
      </div>

      {tab === "drafts" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
          {!drafts.length ? (
            <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 30, maxWidth: 620, display: "flex", flexDirection: "column", gap: 12 }}>
              <Label color={draftsError ? T.pink : T.green}>{draftsError ? "Drafts unavailable" : "No drafts yet"}</Label>
              <p style={{ ...lang(16), lineHeight: 1.6, margin: 0 }}>
                {draftsError
                  ? `${draftsError} The server route is missing its database credentials in the Vercel project environment.`
                  : "Save a draft to compare it here."}
              </p>
              <button onClick={generateVariants} disabled={makingVariants} className="fb-press"
                style={{ alignSelf: "flex-start", height: S.btn, padding: "0 24px", borderRadius: 999, background: T.green, ...lang(15, 700, "#04130A"), opacity: makingVariants ? 0.5 : 1 }}>
                {makingVariants ? "Building" : "Build three GW1 variants"}
              </button>
              <button onClick={() => setTab("build")} className="fb-press" style={{ alignSelf: "flex-start", height: S.btn, padding: "0 24px", borderRadius: 999, background: T.green, ...lang(15, 700, "#04130A") }}>
                START BUILDING
              </button>
            </section>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: S.gap }}>
                {drafts.map((d) => {
                  const s = hydrate(d);
                  const readout = s.players.length ? evaluateSquad(s, 1, ctx) : null;
                  return (
                    <DraftCard key={d.id} draft={d} readout={readout} onLoad={loadDraft} onDelete={deleteDraft} onPlan={setPlan}
                      selected={compare.includes(d.id)}
                      onSelect={(id) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]))} />
                  );
                })}
              </div>
              {compare.length >= 2 && (
                <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <Label color={T.tag}>Side by side</Label>
                    <h2 style={{ margin: "5px 0 0", ...lang(24, 700) }}>Draft comparison</h2>
                  </div>
                  {(() => {
                    const rows = compare
                      .map((id) => drafts.find((d) => d.id === id))
                      .filter(Boolean)
                      .map((d) => { const s = hydrate(d); return { d, s, e: evaluateSquad(s, horizon, ctx) }; });
                    const metrics = [
                      ["Projected points", (r) => r.e.points.mean, (x) => x.toFixed(1), true],
                      ["Captain ceiling", (r) => (r.e.captaincy ? r.e.captaincy.best.ev : 0), (x) => x.toFixed(1), true],
                      ["Risk flags", (r) => r.e.risk.count, (x) => String(x), false],
                      ["Bank", (r) => r.e.structure.bank, (x) => x.toFixed(1), true],
                      ["Bench floor", (r) => r.e.structure.benchQuality, (x) => x.toFixed(1), true],
                      ["Squad cost", (r) => r.e.structure.spend, (x) => x.toFixed(1), false],
                    ];
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: `200px repeat(${rows.length}, 1fr)`, gap: 8 }}>
                        <span />
                        {rows.map((r) => (
                          <div key={r.d.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <span style={lang(15, 700)}>{r.d.name}</span>
                            <span style={code(13)}>{r.s.structure}</span>
                          </div>
                        ))}
                        {metrics.map(([label, get, fmt, higherBetter]) => {
                          const vals = rows.map(get);
                          const best = higherBetter ? Math.max(...vals) : Math.min(...vals);
                          return (
                            <React.Fragment key={label}>
                              <span style={{ ...lang(14.5, 600), display: "flex", alignItems: "center" }}>{label}</span>
                              {rows.map((r, i) => (
                                <div key={r.d.id} style={{ display: "flex", justifyContent: "center" }}>
                                  <Value color={vals[i] === best ? T.green : "#FFFFFF"}>{fmt(vals[i])}</Value>
                                </div>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    );
                  })()}
                </section>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: S.gap, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
            {(

              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <Label color={T.green}>Formation</Label>
                  <span style={lang(13.5, 600)}>Best possible eleven in each shape, from your fifteen.</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setFormationLocked((v) => !v)} className="fb-press"
                    style={{ height: 40, padding: "0 14px", borderRadius: 999,
                      background: formationLocked ? T.tag : T.card,
                      border: `1px solid ${formationLocked ? T.tag : T.line}`, ...lang(13.5, 700) }}>
                    {formationLocked ? "SHAPE LOCKED" : "LOCK SHAPE"}
                  </button>
                  {STRUCTURES.map((st) => {
                    const on = squad.structure === st.key;
                    const sc = structureScores.find((s) => s.key === st.key);
                    return (
                      <button key={st.key} onClick={() => setStructure(st.key)} className="fb-press"
                        style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: 999,
                          background: on ? T.green : T.card, border: `1px solid ${on ? T.green : T.line}` }}>
                        <span style={lang(14, 700, on ? "#04130A" : "#FFFFFF")}>{st.key}</span>
                        {sc && sc.score !== null && (
                          <span style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                            <span style={val(13, on ? "#04130A" : "#FFFFFF", 500)}>{sc.score.toFixed(1)}</span>
                            <span style={lang(13, 600, on ? "#04130A" : "#FFFFFF")}>{metricName(model.gateOpen)}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                </div>

                <ShortlistPanel maybes={maybes} ignored={ignoredPlayers} xpOf={xpOf}
                  onRemoveMaybe={toggleMaybe} onRemoveIgnore={toggleIgnore} />
                <BuilderPitch locks={locks} squad={squad} scoreOf={ctx.scoreOf} metricName={metricName(model.gateOpen)} oppOf={oppOf} scale={scale}
                  activeSlot={slotPos}
                  onSlotClick={setActiveSlot}
                  onOpenPlayer={(p) => setMenuFor(p)} onSwap={swap} />

                {slotPos ? (
                  <Candidates pos={slotPos} pool={pool} squad={squad} scoreOf={ctx.scoreOf} bandOf={ctx.bandOf}
                    gateOpen={model.gateOpen} onAdd={add} max={maxScore} oppOf={oppOf} scale={scale} xpOf={xpOf} run5Of={run5Of} />
                ) : (
                  <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 24 }}>
                    <Label color={T.green}>{isComplete(squad) ? "Squad complete" : "Next move"}</Label>
                    <p style={{ ...lang(16), lineHeight: 1.6, margin: "10px 0 0" }}>
                      {isComplete(squad)
                        ? "Fifteen players, every limit respected."
                        : ""}
                    </p>
                  </section>
                )}
              </>
            )}
          </div>

          {evaluation && (
            <Feedback evaluation={evaluation} horizon={horizon} setHorizon={setHorizon} gateOpen={model.gateOpen}
              provenance={provenanceLine(model)} scores={scores}
              onPickCaptain={(p) => setSquad((s) => ({ ...s, captain: p.fpl_id, vice: s.vice === p.fpl_id ? null : s.vice }))} />
          )}
        </div>
      )}

      {menuFor && (
        <div onClick={() => setMenuFor(null)} style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(6,0,10,0.62)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.row, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 22, width: 344, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Kit team={menuFor.team} size={26} />
                <div>
                  <div style={lang(18, 700)}>{menuFor.web_name}</div>
                  <div style={{ marginTop: 3, ...code(13) }}>{menuFor.team} · {POS_LABEL[menuFor.position]}</div>
                </div>
              </div>
              <button onClick={() => setMenuFor(null)} className="fb-press" style={{ width: 34, height: 34, borderRadius: 17, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={15} color="#FFFFFF" />
              </button>
            </div>
            <FixtureRun fixtures={nextFixtures(core.fixtures, core.teamById, menuFor.team_id, 5)} scale={scale} n={5}
              xpOf={(gw) => model.scoreForGw(menuFor, gw)} />
            <button onClick={() => { setSquad((s) => ({ ...s, captain: menuFor.fpl_id, vice: s.vice === menuFor.fpl_id ? null : s.vice })); setMenuFor(null); say(`${menuFor.web_name} is captain.`); }}
              className="fb-press" style={{ height: S.btn, borderRadius: 999, background: T.tag, ...lang(14.5, 700) }}>
              MAKE CAPTAIN
            </button>
            <button onClick={() => { setSquad((s) => ({ ...s, vice: menuFor.fpl_id, captain: s.captain === menuFor.fpl_id ? null : s.captain })); setMenuFor(null); say(`${menuFor.web_name} is vice.`); }}
              className="fb-press" style={{ height: S.btn, borderRadius: 999, background: T.card, border: `1px solid ${T.line}`, ...lang(14.5, 700) }}>
              MAKE VICE
            </button>
            <button onClick={() => { toggleLock(menuFor); setMenuFor(null); }} className="fb-press"
              style={{ height: S.btn, borderRadius: 999, background: locks.includes(menuFor.fpl_id) ? T.tag : T.card,
                border: `1px solid ${locks.includes(menuFor.fpl_id) ? T.tag : T.line}`, ...lang(14.5, 700) }}>
              {locks.includes(menuFor.fpl_id) ? "UNLOCK" : "LOCK INTO XI"}
            </button>
            <button onClick={() => { toggleMaybe(menuFor); setMenuFor(null); }} className="fb-press"
              style={{ height: S.btn, borderRadius: 999, background: T.card, border: `1px solid ${maybeIds.includes(menuFor.fpl_id) ? T.cyan : T.line}`, ...lang(14.5, 700) }}>
              {maybeIds.includes(menuFor.fpl_id) ? "REMOVE FROM SHORTLIST" : "ADD TO SHORTLIST"}
            </button>
            <button onClick={() => { toggleIgnore(menuFor); setMenuFor(null); }} className="fb-press"
              style={{ height: S.btn, borderRadius: 999, background: ignores.includes(menuFor.fpl_id) ? T.pink : T.card,
                border: `1px solid ${ignores.includes(menuFor.fpl_id) ? T.pink : T.line}`, ...lang(14.5, 700) }}>
              {ignores.includes(menuFor.fpl_id) ? "STOP IGNORING" : "IGNORE IN AUTO-BUILD"}
            </button>
            <button onClick={() => remove(menuFor)} className="fb-press"
              style={{ height: S.btn, borderRadius: 999, background: "#3A0217", ...lang(14.5, 700, T.pink) }}>
              REMOVE FROM SQUAD
            </button>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
