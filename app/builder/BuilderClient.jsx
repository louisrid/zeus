"use client";
import React from "react";
import { Wand2, Save, Trash2, Star, Upload, ChevronRight, ChevronLeft, X, Search, Check } from "lucide-react";
import { T, S, D, Kit, Label, Plate, POS_LABEL, SkeletonRows, Skeleton, ErrorCard, lang, val, code, Value } from "../../lib/ui";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel, provenanceLine } from "../../lib/projections";
import { metricName, interimChip } from "../../lib/solver/score.mjs";
import {
  RULES, STRUCTURES, structureByKey, emptySquad, bank, addPlayer, removePlayer, swapStarter,
  applyStructure, autoComplete, squadCountPos, clubCount, isComplete,
} from "../../lib/solver/squad";
import { evaluateSquad } from "../../lib/solver/evaluate";
import BuilderPitch from "../../components/BuilderPitch";
import Feedback from "../../components/Feedback";
import Fan from "../../components/Fan";
import Opp from "../../components/Opp";
import { buildOpponentScale } from "../../lib/opponent";
import FITTED from "../../config/fitted-params.json";
import SCHEDULE from "../../config/schedule.js";
import { scoreSquad } from "../../lib/scoring";
import { templateSquad } from "../../lib/data";

const TABS = [["guided", "Guided"], ["build", "Build"], ["drafts", "Drafts"]];
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
function Candidates({ pos, pool, squad, scoreOf, bandOf, gateOpen, onAdd, max, oppOf, scale }) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("SCORE");
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

  const list = React.useMemo(() => {
    const owned = new Set(squad.players.map((p) => p.fpl_id));
    let l = pool.filter((p) => p.position === pos && !owned.has(p.fpl_id));
    if (q) l = l.filter((p) => (p.web_name + " " + p.team).toLowerCase().includes(q.toLowerCase()));
    if (hideFlagged) l = l.filter((p) => p.status === "a");
    if (maxPrice !== "ALL") l = l.filter((p) => Number(p.price) <= Number(maxPrice));
    const by = {
      SCORE: (a, b) => scoreOf(b) - scoreOf(a),
      VALUE: (a, b) => scoreOf(b) / Number(b.price) - scoreOf(a) / Number(a.price),
      PRICE: (a, b) => Number(b.price) - Number(a.price),
      NAME: (a, b) => a.web_name.localeCompare(b.web_name),
    }[sort];
    return [...l].sort(by).slice(0, 60);
  }, [pool, pos, q, sort, hideFlagged, maxPrice, squad, scoreOf]);

  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Label color={T.green}>Ranked for {squad.structure} · {POS_LABEL[pos]}</Label>
          <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>
            {left > 0 ? `Pick ${left} more` : "Position filled"}
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
        {[["SCORE", metricName(gateOpen)], ["VALUE", "Value"], ["PRICE", "Price"], ["NAME", "Name"]].map(([k, label]) => (
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
            <div key={p.fpl_id} style={{ display: "grid", gridTemplateColumns: "minmax(150px,1fr) 78px 70px 124px 58px 92px", gap: 10, alignItems: "center",
              height: S.row, padding: "0 12px", borderRadius: S.radiusSm, background: T.row, opacity: blocked ? 0.5 : 1 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Kit team={p.team} size={22} />
                <span style={{ ...lang(S.name, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                <span style={{ ...code(), flexShrink: 0 }}>{p.team}</span>
              </span>
              <span style={{ display: "flex", justifyContent: "center" }}><Opp fx={oppOf ? oppOf(p) : null} scale={scale} size="sm" /></span>
              <Value>{Number(p.price).toFixed(1)}</Value>
              <span style={{ display: "flex", justifyContent: "center" }}><Fan band={bandOf(p)} max={max} width={118} /></span>
              <span style={{ ...val(S.data, T.green), textAlign: "center" }}>{scoreOf(p).toFixed(1)}</span>
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
      <span style={val(12, "#FFFFFF", 500)}>HISTORIC FITTED ON 9 SEASONS · VALUE FROM TODAY&apos;S MARKET</span>
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
                <span style={{ display: "flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: 999, background: T.tag, ...val(12, "#FFFFFF", 500) }}>TOP</span>
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

/* GUIDED STEP MAP — DECISIONS 6.8, 6.9, 6.14.
   Every step is named and visible from the start, so "2 of 5" never appears without saying what
   3, 4 and 5 are. Any step already reached is one click away and jumping never alters the squad,
   because the step index only decides which candidate list is shown. */
/* GUIDED FLOW — DECISIONS 6.8 to 6.14.
   Every strategic decision is made before the pitch appears, each with the evidence attached.
   Then players, in the order that actually constrains the build: the armband position and the
   premiums first, the cheap enablers last, because early picks spend the budget the late ones need. */
const GUIDED_STEPS = [
  { key: "shape",  kind: "plan", name: "Shape", detail: "Formation" },
  { key: "budget", kind: "plan", name: "Budget shape", detail: "Stars and scrubs, or spread" },
  { key: "bench",  kind: "plan", name: "Bench", detail: "Playing bench or fodder" },
  { key: "invest", kind: "plan", name: "Where to invest", detail: "Which line earns the money" },
  { key: "risk",   kind: "plan", name: "Risk posture", detail: "Template or differential" },
  { key: "anchor", kind: "plan", name: "Captain anchor", detail: "The armband the squad is built around" },
  { key: "MID",    kind: "pick", name: "Midfielders", detail: "Five" },
  { key: "FWD",    kind: "pick", name: "Forwards", detail: "Three" },
  { key: "DEF",    kind: "pick", name: "Defenders", detail: "Five" },
  { key: "GKP",    kind: "pick", name: "Goalkeepers", detail: "Two" },
];
const PLAN_STEPS = GUIDED_STEPS.filter((s) => s.kind === "plan").length; // 6
const PICK_ORDER = GUIDED_STEPS.filter((s) => s.kind === "pick").map((s) => s.key);
const NEED = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };

const PLAN_LABEL = {
  stars: "Stars and scrubs", spread: "Balanced spread",
  playing: "Playing bench", fodder: "Cheap fodder",
  DEF: "Defence", MID: "Midfield", FWD: "Attack",
  template: "Template leaning", balanced: "Balanced", differential: "Differential leaning",
};

/* One plan step. Options sit side by side, each with its own evidence line. An option whose
   evidence cannot be computed says so rather than showing a number, per DECISIONS 2.1. */
function PlanStep({ eyebrow, title, options, value, onPick, note }) {
  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: S.pad,
      display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Label color={T.green}>{eyebrow}</Label>
        <h2 style={{ margin: "5px 0 0", ...lang(S.cardTitle, 700) }}>{title}</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(230px, 1fr))`, gap: 12 }}>
        {options.map((o) => {
          const on = value === o.key;
          return (
            <button key={o.key} onClick={() => onPick(o.key)} className="fb-press"
              style={{ textAlign: "left", padding: "14px 16px", borderRadius: S.radiusSm, display: "flex", flexDirection: "column", gap: 8,
                background: on ? "#06331D" : T.row, border: `1px solid ${on ? T.green : T.line}` }}>
              <span style={lang(17, 700, on ? T.green : "#FFFFFF")}>{o.name}</span>
              {o.figures && o.figures.length > 0 && (
                <span style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {o.figures.map((f) => (
                    <span key={f.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={lang(12.5, 600)}>{f.label}</span>
                      <span style={val(15, f.tone || "#FFFFFF")}>{f.value}</span>
                    </span>
                  ))}
                </span>
              )}
              <span style={{ ...lang(13.5, 600), lineHeight: 1.45 }}>{o.why}</span>
            </button>
          );
        })}
      </div>
      {note && <span style={val(12, "#FFFFFF", 500)}>{note}</span>}
    </section>
  );
}

function StepMap({ step, squad, plan, onJump }) {
  const have = (pos) => squad.players.filter((p) => p.position === pos).length;
  const current = step + 1; // step -1 is the shape step, index 0 in the map
  const planDone = (key) => (key === "shape" ? Boolean(squad.structure) : plan[key] !== null && plan[key] !== undefined);
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 14,
      display: "flex", gap: 8, flexWrap: "wrap" }}>
      {GUIDED_STEPS.map((st, i) => {
        const reached = i <= Math.max(current, 0);
        const isNow = i === current;
        const filled = st.kind === "plan" ? planDone(st.key) : have(st.key) >= NEED[st.key];
        const tone = isNow ? T.green : filled ? T.cyan : "#FFFFFF";
        return (
          <button key={st.key} onClick={() => reached && onJump(i - 1)} disabled={!reached}
            className={reached ? "fb-press" : undefined}
            style={{ flex: "1 1 150px", minWidth: 150, textAlign: "left", padding: "10px 12px", borderRadius: S.radiusSm,
              background: isNow ? "#06331D" : T.row, border: `1px solid ${isNow ? T.green : T.line}`,
              cursor: reached ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={val(12, tone, 500)}>{i + 1}</span>
              <span style={lang(14.5, 700, tone)}>{st.name}</span>
              {filled && <Check size={13} color={T.cyan} />}
            </span>
            <span style={lang(13, 600)}>
              {st.kind === "plan"
                ? (st.key === "shape" ? (squad.structure || st.detail) : (PLAN_LABEL[plan[st.key]] || st.detail))
                : `${have(st.key)} of ${NEED[st.key]}`}
            </span>
          </button>
        );
      })}
    </div>
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
            <span style={val(12, done === RULES.size ? T.green : "#FFFFFF", 500)}>{done}/{RULES.size}</span>
            <span style={val(12, "#FFFFFF", 500)}>{new Date(draft.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
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
              <span style={lang(11.5, 700)}>{l}</span>
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
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [tab, setTab] = React.useState("guided");
  const [squad, setSquad] = React.useState(() => emptySquad("3-5-2"));
  const [horizon, setHorizon] = React.useState(1);
  const [activeSlot, setActiveSlot] = React.useState(null);
  const [guidedStep, setGuidedStep] = React.useState(-1);
  const [plan, setPlan_] = React.useState({ budget: null, bench: null, invest: null, risk: null, anchor: null });
  const setPlanKey = (k, v) => setPlan_((p) => ({ ...p, [k]: v }));
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
  const templateFifteen = React.useMemo(() => {
    if (!core) return [];
    const t = templateSquad(core.players);
    return t ? [...t.xi, ...t.bench] : [];
  }, [core]);
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
    return scoreSquad({ squad, pool, scoreOf: ctx.scoreOf, bestCaptainEv: bestCap, templateFifteen });
  }, [ctx, pool, squad, evaluation, templateFifteen]);


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

  // DECISIONS 6.10: the anchor is chosen before any player, so it takes the armband on arrival.
  React.useEffect(() => {
    if (!plan.anchor) return;
    if (!squad.players.some((p) => p.fpl_id === plan.anchor)) return;
    if (squad.captain === plan.anchor) return;
    setSquad((sq) => ({ ...sq, captain: plan.anchor, vice: sq.vice === plan.anchor ? null : sq.vice }));
  }, [plan.anchor, squad.players, squad.captain]);

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

  const doAutoComplete = () => {
    if (!ctx) return;
    const before = squad.players.length;
    const next = autoComplete(squad, pool, ctx.scoreOf);
    setSquad(next);
    const added = next.players.length - before;
    say(added > 0 ? `${added} slot${added === 1 ? "" : "s"} filled.` : "Nothing left to fill.", added === 0);
  };

  const saveDraft = async () => {
    // DECISIONS 6.15: no completeness requirement, no blocking validation. An empty draft saves.
    setSaving(true);
    const payload = {
      name: draftName || `${squad.structure} draft`,
      mode: tab === "guided" ? "guided" : "free",
      squad: {
        structure: squad.structure, captain: squad.captain, vice: squad.vice,
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
    return { structure: s.structure || "3-5-2", captain: s.captain ?? null, vice: s.vice ?? null, players };
  }, [pool]);

  const loadDraft = (draft) => {
    const s = hydrate(draft);
    if (s.players.length !== ((draft.squad && draft.squad.picks) || []).length) say("Some players in that draft are no longer in the database.", true);
    setSquad(s);
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

  // guidedStep -1 is the shape step (map index 0). Plan steps occupy map indices 0..5, then the
  // four pick steps in constraint order. slotPos is only set once the plan steps are behind us.
  const mapIndex = guidedStep + 1;
  const currentStep = GUIDED_STEPS[Math.min(Math.max(mapIndex, 0), GUIDED_STEPS.length - 1)];
  const guidedPos = currentStep && currentStep.kind === "pick" ? currentStep.key : null;
  const slotPos = tab === "guided" ? guidedPos : activeSlot;

  /* Evidence for the plan steps. Every figure below is computed from the live pool or from the
     parameters fitted on nine seasons. Where a claim would need data we do not ingest, the option
     says so instead of showing a number. */
  const planEvidence = React.useMemo(() => {
    if (!ctx || !pool.length) return null;
    const perM = (p) => ctx.scoreOf(p) / Math.max(3, Number(p.price));
    const byPos = {};
    for (const pos of POS_ORDER) {
      const list = pool.filter((x) => x.position === pos);
      byPos[pos] = {
        bestPerM: list.length ? Math.max(...list.map(perM)) : 0,
        meanPerM: list.length ? list.reduce((a, x) => a + perM(x), 0) / list.length : 0,
        cheapest: list.length ? Math.min(...list.map((x) => Number(x.price))) : 0,
        hist: FITTED.position_points_per_start[pos],
      };
    }
    // Bench cost: four cheapest legal bench players against four that would actually start.
    const cheapFour = POS_ORDER.flatMap((pos) => pool.filter((x) => x.position === pos).sort((a, b) => a.price - b.price).slice(0, 1));
    const playFour = POS_ORDER.flatMap((pos) => pool.filter((x) => x.position === pos).sort((a, b) => ctx.scoreOf(b) - ctx.scoreOf(a)).slice(0, 1));
    const fodderCost = cheapFour.reduce((a, x) => a + Number(x.price), 0);
    const playingCost = playFour.reduce((a, x) => a + Number(x.price), 0);
    // Premium count reachable: how many players above 9.0 fit inside the budget with legal fodder.
    const premiums = pool.filter((x) => Number(x.price) >= 9).sort((a, b) => ctx.scoreOf(b) - ctx.scoreOf(a));
    const investBest = POS_ORDER.filter((x) => x !== "GKP").sort((a, b) => byPos[b].bestPerM - byPos[a].bestPerM)[0];
    return { byPos, fodderCost, playingCost, premiums, investBest };
  }, [ctx, pool]);

  const anchorOptions = React.useMemo(() => {
    if (!ctx || !pool.length) return [];
    return pool.slice().sort((a, b) => ctx.scoreOf(b) - ctx.scoreOf(a)).slice(0, 6);
  }, [ctx, pool]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.gap }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <TabBar tab={tab} setTab={setTab} draftCount={drafts.length} />
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <button onClick={doAutoComplete} className="fb-press"
            style={{ height: 42, padding: "0 18px", borderRadius: 999, background: T.card, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 8, ...lang(14, 700) }}>
            <Wand2 size={15} color={T.green} /> AUTO-COMPLETE
          </button>
          <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Draft name"
            style={{ height: 42, width: 150, borderRadius: 12, background: T.card, border: `1px solid ${T.line}`, padding: "0 14px", outline: "none", ...lang(14) }} />
          <button onClick={saveDraft} disabled={saving} className="fb-press"
            style={{ height: 42, padding: "0 18px", borderRadius: 999, background: T.green, display: "flex", alignItems: "center", gap: 8, ...lang(14, 700, "#04130A") }}>
            <Save size={15} /> {saving ? "SAVING" : "SAVE AS DRAFT"}
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
                  : "Build a squad on the pitch and press Save as draft. Two or three saved drafts compare side by side on the same four readouts."}
              </p>
              <button onClick={() => setTab("guided")} className="fb-press" style={{ alignSelf: "flex-start", height: S.btn, padding: "0 24px", borderRadius: 999, background: T.green, ...lang(15, 700, "#04130A") }}>
                START IN GUIDED
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
            {tab === "guided" && currentStep && currentStep.kind === "plan" ? (
              <>
                <StepMap step={guidedStep} squad={squad} plan={plan} onJump={setGuidedStep} />
                {currentStep.key === "shape" && (
                  <StructureCards scores={structureScores} chosen={squad.structure}
                    onPick={(key) => { setStructure(key); setGuidedStep(0); say(`${key} selected.`); }} />
                )}
                {currentStep.key === "budget" && planEvidence && (
                  <PlanStep eyebrow="Step two" title="How is the money shaped?"
                    value={plan.budget} onPick={(v) => { setPlanKey("budget", v); setGuidedStep(1); }}
                    note={`PREMIUM DEFINED AS £9.0 AND ABOVE · ${planEvidence.premiums.length} AVAILABLE`}
                    options={[
                      { key: "stars", name: "Stars and scrubs",
                        figures: [
                          { label: "Top premium", value: Number(planEvidence.premiums[0]?.price ?? 0).toFixed(1) },
                          { label: "Its score", value: ctx.scoreOf(planEvidence.premiums[0] || {}).toFixed(1), tone: T.green },
                        ],
                        why: "Three or four of the most expensive players, funded by the cheapest legal bench. Concentrates points in the eleven and leaves little cover." },
                      { key: "spread", name: "Balanced spread",
                        figures: [
                          { label: "Mean value, midfield", value: planEvidence.byPos.MID.meanPerM.toFixed(2) },
                          { label: "Best value, midfield", value: planEvidence.byPos.MID.bestPerM.toFixed(2), tone: T.green },
                        ],
                        why: "Money spread across the eleven. Fewer ceiling weeks, more weeks where nothing in the squad is dead." },
                    ]} />
                )}
                {currentStep.key === "bench" && planEvidence && (
                  <PlanStep eyebrow="Step three" title="What is the bench for?"
                    value={plan.bench} onPick={(v) => { setPlanKey("bench", v); setGuidedStep(2); }}
                    options={[
                      { key: "fodder", name: "Cheap fodder",
                        figures: [
                          { label: "Four cheapest cost", value: planEvidence.fodderCost.toFixed(1) },
                          { label: "Freed for the eleven", value: (planEvidence.playingCost - planEvidence.fodderCost).toFixed(1), tone: T.green },
                        ],
                        why: "The bench never plays. Every pound saved goes into the starting eleven, and an injury means playing a man down." },
                      { key: "playing", name: "Playing bench",
                        figures: [
                          { label: "Four playing cost", value: planEvidence.playingCost.toFixed(1) },
                          { label: "Taken from the eleven", value: (planEvidence.playingCost - planEvidence.fodderCost).toFixed(1), tone: T.pink },
                        ],
                        why: "Bench players who start for their clubs. Cover for injuries and blanks, paid for out of the eleven." },
                    ]} />
                )}
                {currentStep.key === "invest" && planEvidence && (
                  <PlanStep eyebrow="Step four" title="Which line earns the money?"
                    value={plan.invest} onPick={(v) => { setPlanKey("invest", v); setGuidedStep(3); }}
                    note="VALUE FROM TODAY'S POOL · HISTORIC POINTS PER START FITTED ON NINE SEASONS"
                    options={["DEF", "MID", "FWD"].map((pos) => ({
                      key: pos, name: PLAN_LABEL[pos],
                      figures: [
                        { label: "Best value now", value: planEvidence.byPos[pos].bestPerM.toFixed(2), tone: pos === planEvidence.investBest ? T.green : "#FFFFFF" },
                        { label: "Historic per start", value: planEvidence.byPos[pos].hist.toFixed(2) },
                      ],
                      why: pos === planEvidence.investBest
                        ? "Highest return per pound in the pool as it stands today."
                        : "Lower return per pound than the best line right now, which can invert once odds arrive.",
                    }))} />
                )}
                {currentStep.key === "risk" && (
                  <PlanStep eyebrow="Step five" title="Template or differential?"
                    value={plan.risk} onPick={(v) => { setPlanKey("risk", v); setGuidedStep(4); }}
                    note={`WHAT EACH POSTURE DOES TO THE RANK DISTRIBUTION NEEDS MANAGER PICK DATA WE DO NOT INGEST · ARRIVES WITH THE STRATEGY STUDY BY ${SCHEDULE.complete.label}`}
                    options={[
                      { key: "template", name: "Template leaning", figures: [],
                        why: "Own what the field owns. Protects against falling behind and makes overtaking the field arithmetically hard." },
                      { key: "balanced", name: "Balanced", figures: [],
                        why: "The template core plus a few of your own. Neither protected nor exposed." },
                      { key: "differential", name: "Differential leaning", figures: [],
                        why: "Deliberately unlike the field. The only way to gain large rank, and the fastest way to lose it." },
                    ]} />
                )}
                {currentStep.key === "anchor" && (
                  <PlanStep eyebrow="Step six" title="Which armband is the squad built around?"
                    value={plan.anchor} onPick={(v) => { setPlanKey("anchor", v); setGuidedStep(5); say("Anchor set. Midfielders first, then forwards."); }}
                    note="THE ANCHOR CONSTRAINS PREMIUM SPEND, SO IT IS CHOSEN BEFORE ANY PLAYER IS PICKED"
                    options={anchorOptions.map((p) => ({
                      key: p.fpl_id, name: p.web_name,
                      figures: [
                        { label: "Price", value: Number(p.price).toFixed(1) },
                        { label: metricName(model.gateOpen), value: ctx.scoreOf(p).toFixed(1), tone: T.green },
                        { label: "Owned", value: `${p.own.toFixed(0)}%` },
                      ],
                      why: `${p.team} · ${POS_LABEL[p.position]}. Committing here reserves ${Number(p.price).toFixed(1)} of the budget before anything else is bought.`,
                    }))} />
                )}
              </>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <Label color={T.green}>Formation</Label>
                  <span style={lang(13.5, 600)}>Switch any time. Same fifteen, eleven rearranged, feedback re-scores.</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {STRUCTURES.map((st) => {
                    const on = squad.structure === st.key;
                    const sc = structureScores.find((s) => s.key === st.key);
                    const top = structureScores.length > 0 && structureScores[0].key === st.key;
                    return (
                      <button key={st.key} onClick={() => setStructure(st.key)} className="fb-press"
                        style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: 999,
                          background: on ? T.green : T.card, border: `1px solid ${on ? T.green : T.line}` }}>
                        <span style={lang(14, 700, on ? "#04130A" : "#FFFFFF")}>{st.key}</span>
                        {sc && sc.score !== null && <span style={val(12.5, on ? "#04130A" : T.green, 500)}>{sc.score.toFixed(1)}</span>}
                        {top && structureScores[0].score !== null && <span style={{ display: "flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: 999, background: T.tag, ...val(11.5, "#FFFFFF", 500) }}>TOP</span>}
                      </button>
                    );
                  })}
                </div>
                </div>

                <BuilderPitch squad={squad} scoreOf={ctx.scoreOf} metricName={metricName(model.gateOpen)} oppOf={oppOf} scale={scale}
                  activeSlot={slotPos}
                  onSlotClick={(pos) => (tab === "guided" ? setGuidedStep(GUIDED_STEPS.findIndex((x) => x.key === pos) - 1) : setActiveSlot(pos))}
                  onOpenPlayer={(p) => setMenuFor(p)} onSwap={swap} />

                {tab === "guided" && (
                  <StepMap step={guidedStep} squad={squad} plan={plan} onJump={setGuidedStep} />
                )}

                {slotPos ? (
                  <Candidates pos={slotPos} pool={pool} squad={squad} scoreOf={ctx.scoreOf} bandOf={ctx.bandOf}
                    gateOpen={model.gateOpen} onAdd={add} max={maxScore} oppOf={oppOf} scale={scale} />
                ) : (
                  <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 24 }}>
                    <Label color={T.green}>{isComplete(squad) ? "Squad complete" : "Next move"}</Label>
                    <p style={{ ...lang(16), lineHeight: 1.6, margin: "10px 0 0" }}>
                      {isComplete(squad)
                        ? "Fifteen players, every limit respected. Save it as a draft, or click a shirt to set the armband."
                        : "Click any empty slot on the pitch for ranked candidates, or press Auto-complete to fill everything at once."}
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
            <Fan band={ctx.bandOf(menuFor)} max={maxScore} width={298} height={26} />
            <button onClick={() => { setSquad((s) => ({ ...s, captain: menuFor.fpl_id, vice: s.vice === menuFor.fpl_id ? null : s.vice })); setMenuFor(null); say(`${menuFor.web_name} is captain.`); }}
              className="fb-press" style={{ height: S.btn, borderRadius: 999, background: T.tag, ...lang(14.5, 700) }}>
              MAKE CAPTAIN
            </button>
            <button onClick={() => { setSquad((s) => ({ ...s, vice: menuFor.fpl_id, captain: s.captain === menuFor.fpl_id ? null : s.captain })); setMenuFor(null); say(`${menuFor.web_name} is vice.`); }}
              className="fb-press" style={{ height: S.btn, borderRadius: 999, background: T.card, border: `1px solid ${T.line}`, ...lang(14.5, 700) }}>
              MAKE VICE
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
