import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  LayoutGrid, Shirt as ShirtIcon, Hammer, Users, BarChart3, Newspaper,
  RefreshCw, Sparkles, X, Copy, Plus, Star, Trash2, Save, Search, Wand2,
} from "lucide-react";

/* ————— LOCKED SYSTEM — Michroma (identity) · Outfit 600+ (body) · Martian Mono 800 (data)
   White text only. 12px floor. Green = projections/actions · pink = risk · neon pink #FF2ECC = captain/TOP/value ·
   neon magenta = value score. Nav rail on the right. ————— */
const FB = "'Outfit',sans-serif";
const FN = "'Martian Mono',monospace";
const FNW = 800;
const D = { fontFamily: "'Michroma',sans-serif", fontWeight: 400 };

const T = {
  bg: "#0D0014", bgRaise: "#16021F", card: "#1E0630", line: "#3A1150",
  text: "#FFFFFF", dim: "rgba(255,255,255,0.85)", faint: "rgba(255,255,255,0.62)",
  green: "#00FF85", cyan: "#04F5FF", pink: "#E90052", cap: "#FF2ECC", value: "#FF2ECC",
};
const GRASS = "repeating-linear-gradient(0deg, #0B5A2E 0px, #0B5A2E 40px, #0A5029 40px, #0A5029 80px)";

const KITS = {
  ARS: ["#EF0107", "#FFFFFF"], LIV: ["#C8102E", "#8E0C20"], MUN: ["#DA291C", "#1A1A1A"],
  NFO: ["#E53233", "#E53233"], BOU: ["#B50E12", "#000000"], BRE: ["#E30613", "#FFFFFF"],
  MCI: ["#6CABDD", "#6CABDD"], CHE: ["#034694", "#034694"], EVE: ["#003399", "#003399"],
  BHA: ["#0057B8", "#FFFFFF"], CRY: ["#1B458F", "#C4122E"], TOT: ["#FFFFFF", "#132257"],
  NEW: ["#241F20", "#FFFFFF"], FUL: ["#FFFFFF", "#000000"], WOL: ["#FDB913", "#FDB913"],
  AVL: ["#670E36", "#95BFE5"], WHU: ["#7A263A", "#1BB1E7"], SUN: ["#EB172B", "#FFFFFF"],
  BUR: ["#6C1D45", "#99D6EA"], LEE: ["#FFFFFF", "#1D428A"],
};

/* GW8 fixtures (consistent everywhere): BOU–ARS · MCI–WOL · LIV–EVE · MUN–NEW · CHE–CRY ·
   AVL–BRE · TOT–FUL · NFO–BHA · WHU–BUR · SUN–LEE. Uppercase = home, lowercase = away. */
const TEAM_NEXT = {
  BOU: "ARS (H)", ARS: "bou (A)", MCI: "WOL (H)", WOL: "mci (A)",
  LIV: "EVE (H)", EVE: "liv (A)", MUN: "NEW (H)", NEW: "mun (A)",
  CHE: "CRY (H)", CRY: "che (A)", AVL: "BRE (H)", BRE: "avl (A)",
  TOT: "FUL (H)", FUL: "tot (A)", NFO: "BHA (H)", BHA: "nfo (A)",
  WHU: "BUR (H)", BUR: "whu (A)", SUN: "LEE (H)", LEE: "sun (A)",
};

function Kit({ team, size = 30, captain = false, vice = false }) {
  const [body, sleeve] = KITS[team] || ["#31114A", "#31114A"];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size * 0.9 }}>
      <svg viewBox="0 0 40 36" width={size} height={size * 0.9}>
        <path d="M13 2 L16 4 Q20 6.5 24 4 L27 2 L38 8 L34 16 L28 12.5 L28 34 L12 34 L12 12.5 L6 16 L2 8 Z"
          fill={body} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
        <path d="M13 2 L2 8 L6 16 L12 12.5 L12 5 Z" fill={sleeve} />
        <path d="M27 2 L38 8 L34 16 L28 12.5 L28 5 Z" fill={sleeve} />
        <path d="M16 4 Q20 6.5 24 4" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.4" />
      </svg>
      {captain && (
        <span className="absolute flex items-center justify-center rounded-full"
          style={{ top: -5, right: -5, width: 17, height: 17, fontSize: 12, fontWeight: 800, lineHeight: 1, background: T.green, color: "#04130A", fontFamily: FB }}>C</span>
      )}
      {vice && !captain && (
        <span className="absolute flex items-center justify-center rounded-full"
          style={{ top: -5, right: -5, width: 17, height: 17, fontSize: 12, fontWeight: 800, lineHeight: 1, background: "#FFFFFF", color: "#0D0014", fontFamily: FB }}>V</span>
      )}
    </div>
  );
}

/* ————— PLAYER POOL — the mock universe (~70). The real build queries the full FPL DB. ————— */
const POOL = {
  GK: [
    { n: "Raya", team: "ARS", price: 5.7, xp: 4.9 },
    { n: "Pope", team: "NEW", price: 5.4, xp: 4.3 },
    { n: "Sels", team: "NFO", price: 5.2, xp: 4.0 },
    { n: "Sánchez", team: "CHE", price: 5.0, xp: 3.9 },
    { n: "Verbruggen", team: "BHA", price: 4.6, xp: 3.4 },
    { n: "Vicario", team: "TOT", price: 5.0, xp: 3.5 },
    { n: "Petrović", team: "BOU", price: 4.7, xp: 3.3 },
    { n: "Areola", team: "WHU", price: 4.4, xp: 3.0 },
    { n: "Dúbravka", team: "BUR", price: 4.0, xp: 2.9 },
    { n: "Darlow", team: "LEE", price: 4.0, xp: 2.5 },
  ],
  DEF: [
    { n: "Gabriel", team: "ARS", price: 6.3, xp: 5.0 },
    { n: "Timber", team: "ARS", price: 6.0, xp: 4.8 },
    { n: "Saliba", team: "ARS", price: 6.2, xp: 4.7 },
    { n: "Van Dijk", team: "LIV", price: 6.4, xp: 4.6 },
    { n: "Gvardiol", team: "MCI", price: 6.1, xp: 4.5 },
    { n: "Hall", team: "NEW", price: 5.8, xp: 4.3, risk: "Knock — doubt 0.7" },
    { n: "Kerkez", team: "LIV", price: 5.8, xp: 4.2 },
    { n: "Ait-Nouri", team: "MCI", price: 5.9, xp: 4.1 },
    { n: "Porro", team: "TOT", price: 5.7, xp: 4.1 },
    { n: "Robertson", team: "LIV", price: 5.9, xp: 4.0 },
    { n: "Milenković", team: "NFO", price: 5.3, xp: 4.0 },
    { n: "Aina", team: "NFO", price: 5.1, xp: 4.0 },
    { n: "Colwill", team: "CHE", price: 5.5, xp: 3.8 },
    { n: "Muñoz", team: "CRY", price: 5.6, xp: 3.7 },
    { n: "Guéhi", team: "CRY", price: 5.2, xp: 3.6 },
    { n: "O'Brien", team: "EVE", price: 4.8, xp: 3.6 },
    { n: "Tarkowski", team: "EVE", price: 5.0, xp: 3.5 },
    { n: "Senesi", team: "BOU", price: 4.7, xp: 3.4 },
    { n: "Andersen", team: "FUL", price: 4.9, xp: 3.3 },
    { n: "Rodon", team: "LEE", price: 4.3, xp: 3.0 },
    { n: "Estève", team: "BUR", price: 4.2, xp: 2.8 },
  ],
  MID: [
    { n: "Salah", team: "LIV", price: 14.3, xp: 6.6 },
    { n: "Saka", team: "ARS", price: 10.8, xp: 6.1 },
    { n: "Wirtz", team: "LIV", price: 9.8, xp: 5.8 },
    { n: "Mbeumo", team: "MUN", price: 8.4, xp: 5.6 },
    { n: "Ødegaard", team: "ARS", price: 9.6, xp: 5.2 },
    { n: "Eze", team: "ARS", price: 8.8, xp: 5.1 },
    { n: "Fernandes", team: "MUN", price: 9.0, xp: 5.0 },
    { n: "Semenyo", team: "BOU", price: 7.3, xp: 4.6 },
    { n: "Gordon", team: "NEW", price: 7.6, xp: 4.7, risk: "Rotation — minutes risk" },
    { n: "Doku", team: "MCI", price: 7.2, xp: 4.6 },
    { n: "Schade", team: "BRE", price: 6.9, xp: 4.6 },
    { n: "Sávio", team: "MCI", price: 7.0, xp: 4.5 },
    { n: "Palmer", team: "CHE", price: 10.6, xp: 4.5 },
    { n: "Rogers", team: "AVL", price: 7.1, xp: 4.4 },
    { n: "Bruno G.", team: "NEW", price: 6.9, xp: 4.3 },
    { n: "Ndiaye", team: "EVE", price: 6.6, xp: 4.3 },
    { n: "Kudus", team: "TOT", price: 6.8, xp: 4.2 },
    { n: "Enzo", team: "CHE", price: 6.7, xp: 4.2 },
    { n: "Iwobi", team: "FUL", price: 6.2, xp: 4.1 },
    { n: "Anthony", team: "BUR", price: 5.9, xp: 4.0 },
    { n: "McNeil", team: "EVE", price: 5.4, xp: 3.6 },
    { n: "Le Fée", team: "SUN", price: 5.0, xp: 3.2 },
  ],
  FWD: [
    { n: "Haaland", team: "MCI", price: 14.2, xp: 7.8 },
    { n: "Gyökeres", team: "ARS", price: 9.4, xp: 6.4 },
    { n: "Isak", team: "LIV", price: 10.6, xp: 6.0 },
    { n: "Ekitiké", team: "LIV", price: 8.9, xp: 5.4 },
    { n: "Šeško", team: "MUN", price: 8.2, xp: 4.8 },
    { n: "João Pedro", team: "CHE", price: 7.9, xp: 4.7 },
    { n: "Wood", team: "NFO", price: 7.6, xp: 4.4, risk: "Rested flag — 0.5" },
    { n: "Watkins", team: "AVL", price: 8.7, xp: 4.4 },
    { n: "Mateta", team: "CRY", price: 7.4, xp: 4.3 },
    { n: "Strand Larsen", team: "WOL", price: 7.2, xp: 4.3 },
    { n: "Thiago", team: "BRE", price: 6.8, xp: 4.2 },
    { n: "Evanilson", team: "BOU", price: 6.9, xp: 4.1 },
    { n: "Muniz", team: "FUL", price: 6.6, xp: 3.9 },
    { n: "Füllkrug", team: "WHU", price: 6.4, xp: 3.8 },
    { n: "Awoniyi", team: "NFO", price: 5.9, xp: 3.4 },
  ],
};
const LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const BUDGET = 100.0;
const MIN_PRICE = Object.fromEntries(Object.entries(POOL).map(([pos, arr]) => [pos, Math.min(...arr.map((p) => p.price))]));

/* All 7 valid formations, ranked by the strategy study (mock evidence) */
const STRUCTURES = [
  { id: "3-5-2", ev: 8.4, xi: { DEF: 3, MID: 5, FWD: 2 } },
  { id: "4-4-2", ev: 7.9, xi: { DEF: 4, MID: 4, FWD: 2 } },
  { id: "3-4-3", ev: 7.1, xi: { DEF: 3, MID: 4, FWD: 3 } },
  { id: "4-3-3", ev: 6.8, xi: { DEF: 4, MID: 3, FWD: 3 } },
  { id: "5-3-2", ev: 6.2, xi: { DEF: 5, MID: 3, FWD: 2 } },
  { id: "4-5-1", ev: 5.9, xi: { DEF: 4, MID: 5, FWD: 1 } },
  { id: "5-4-1", ev: 5.1, xi: { DEF: 5, MID: 4, FWD: 1 } },
];
const TOP_EV = Math.max(...STRUCTURES.map((s) => s.ev));

/* ————— Evaluation — pure arithmetic (zero-AI rule) ————— */
function evaluate(squad, H, captainN) {
  const cost = squad.reduce((s, p) => s + p.price, 0);
  const bank = BUDGET - cost;
  const proj = Math.round(squad.reduce((s, p) => s + p.xp, 0) * H * (1 - 0.012 * (H - 1)));
  const best = squad.length ? squad.reduce((a, b) => (b.xp > a.xp ? b : a)) : null;
  const chosen = captainN ? squad.find((p) => p.n === captainN) : null;
  const cap = chosen || best;
  const capMode = chosen ? "SET" : "AUTO";
  const capP = cap ? Math.min(45, Math.round(cap.xp * 5.3)) : 0;
  const capLabel = !cap ? "—" : cap.xp >= 7.5 ? "ELITE" : cap.xp >= 6 ? "STRONG" : cap.xp >= 5 ? "FAIR" : "WEAK";
  const risks = squad.filter((p) => p.risk);
  const spend = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  squad.forEach((p) => { spend[p.pos] += p.price; });
  const cheapest = [...squad].sort((a, b) => a.price - b.price).slice(0, 4);
  const bench = cheapest.length === 4 ? Math.min(10, (cheapest.reduce((s, p) => s + p.xp, 0) / 4) * 2.1) : 0;
  return { cost, bank, proj, cap, capMode, capP, capLabel, risks, spend, bench };
}
const clubCount = (sq, team) => sq.filter((p) => p.team === team).length;
const posCount = (sq, pos) => sq.filter((p) => p.pos === pos).length;

const Label = ({ children, color = T.dim }) => (
  <div className="font-bold uppercase" style={{ color, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.08em" }}>{children}</div>
);

/* ————— Filters — the full FPL set plus flag/ownership toggles ————— */
const CLUBS = ["ALL", ...Array.from(new Set(Object.values(POOL).flat().map((p) => p.team))).sort()];
const PRICES = ["ALL", 5.0, 6.0, 7.5, 9.0, 11.0];
const SORTS = ["xP", "PRICE ↑", "PRICE ↓", "VALUE", "NAME"];
const DEFAULT_F = { club: "ALL", maxP: "ALL", sort: "xP", hideRisk: false, hideOwned: false };

function filterPlayers(pos, squad, q, f) {
  let list = POOL[pos].map((p) => ({ ...p, pos }));
  if (q) list = list.filter((p) => (p.n + " " + p.team).toLowerCase().includes(q.toLowerCase()));
  if (f.club !== "ALL") list = list.filter((p) => p.team === f.club);
  if (f.maxP !== "ALL") list = list.filter((p) => p.price <= f.maxP);
  if (f.hideRisk) list = list.filter((p) => !p.risk);
  if (f.hideOwned) list = list.filter((p) => !squad.some((x) => x.n === p.n));
  const by = {
    "xP": (a, b) => b.xp - a.xp,
    "PRICE ↑": (a, b) => a.price - b.price,
    "PRICE ↓": (a, b) => b.price - a.price,
    "VALUE": (a, b) => b.xp / b.price - a.xp / a.price,
    "NAME": (a, b) => a.n.localeCompare(b.n),
  }[f.sort];
  return [...list].sort(by);
}

function Sel({ value, onChange, options, label }) {
  return (
    <label className="flex items-center gap-2 rounded-lg px-2.5 border" style={{ background: T.card, borderColor: T.line, height: 38 }}>
      <span className="font-bold uppercase" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none font-bold cursor-pointer"
        style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 13.5 }}>
        {options.map((o) => <option key={o} value={o} style={{ background: T.bgRaise, color: "#FFFFFF" }}>{o}</option>)}
      </select>
    </label>
  );
}

function Toggle({ on, onClick, children }) {
  return (
    <button onClick={onClick} className="px-3 h-9 rounded-full font-bold border"
      style={{ background: on ? T.green : T.card, color: on ? "#04130A" : T.dim, borderColor: on ? T.green : T.line, fontFamily: FB, fontSize: 12.5 }}>
      {children}
    </button>
  );
}

function FilterBar({ f, setF }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Sel label="Club" value={f.club} options={CLUBS} onChange={(v) => setF({ ...f, club: v })} />
      <Sel label="Max £" value={f.maxP} options={PRICES} onChange={(v) => setF({ ...f, maxP: v === "ALL" ? "ALL" : +v })} />
      <Sel label="Sort" value={f.sort} options={SORTS} onChange={(v) => setF({ ...f, sort: v })} />
      <Toggle on={f.hideRisk} onClick={() => setF({ ...f, hideRisk: !f.hideRisk })}>HIDE FLAGGED</Toggle>
      <Toggle on={f.hideOwned} onClick={() => setF({ ...f, hideOwned: !f.hideOwned })}>HIDE IN SQUAD</Toggle>
    </div>
  );
}

function PlayerRow({ p, squad, addP }) {
  const added = squad.some((x) => x.n === p.n);
  const full = posCount(squad, p.pos) >= LIMITS[p.pos];
  const NumPlate = ({ children, color = "#FFFFFF", w }) => (
    <div className="flex items-center justify-center rounded-lg px-1.5 font-bold leading-none whitespace-nowrap"
      style={{ background: "#0D0014", height: 30, minWidth: w, color, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
      {children}
    </div>
  );
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3 shrink-0" style={{ background: T.card, height: 54, opacity: full && !added ? 0.45 : 1 }}>
      <Kit team={p.team} size={22} />
      <div className="flex-1 min-w-0">
        <div className="font-bold leading-none truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15 }}>{p.n}</div>
        <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team} · £{p.price.toFixed(1)}</div>
      </div>
      <NumPlate w={74}>{TEAM_NEXT[p.team]}</NumPlate>
      <NumPlate w={58} color={T.green}>xP {p.xp.toFixed(1)}</NumPlate>
      <span className="rounded-lg px-2 flex items-center font-bold" style={{ background: T.value, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 30 }}>
        VAL {(p.xp / p.price * 10).toFixed(1)}
      </span>
      {p.risk && <span className="font-bold" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }} title={p.risk}>⚑</span>}
      {added ? (
        <span className="rounded-full px-3 h-8 flex items-center font-bold" style={{ background: "#06331D", color: T.green, fontFamily: FB, fontSize: 12.5 }}>IN SQUAD</span>
      ) : (
        <button onClick={() => addP(p)} className="flex items-center gap-1 rounded-full px-3.5 h-8 font-bold"
          style={{ background: full ? T.bgRaise : T.green, color: full ? T.faint : "#04130A", border: full ? `1px solid ${T.line}` : "none", fontFamily: FB, fontSize: 12.5 }}>
          <Plus size={13} /> ADD
        </button>
      )}
    </div>
  );
}

/* ————— Player chooser modal — search + full filter set + every player ————— */
function PlayerModal({ pos, squad, addP, onClose }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState(DEFAULT_F);
  const list = filterPlayers(pos, squad, q, f);
  const picked = posCount(squad, pos);
  const bank = BUDGET - squad.reduce((s, p) => s + p.price, 0);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(6,0,10,0.7)" }} onClick={onClose}>
      <div className="rounded-2xl border flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ background: T.bgRaise, borderColor: T.line, width: 640, maxHeight: "80vh" }}>
        <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: T.line }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>Add {pos}</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
              {picked}/{LIMITS[pos]} PICKED · £{bank.toFixed(1)} LEFT · {list.length} SHOWN
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: T.line }}>
            <X size={16} color={T.dim} />
          </button>
        </header>
        <div className="px-5 pt-4 pb-3 flex flex-col gap-2.5 border-b" style={{ borderColor: T.line }}>
          <div className="flex items-center gap-2.5 rounded-xl px-3.5" style={{ background: T.card, border: `1px solid ${T.line}`, height: 42 }}>
            <Search size={15} color={T.dim} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or club…"
              className="flex-1 bg-transparent outline-none font-semibold"
              style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15 }} />
          </div>
          <FilterBar f={f} setF={setF} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
          {list.map((p) => <PlayerRow key={p.n} p={p} squad={squad} addP={addP} />)}
          {list.length === 0 && (
            <div className="py-8 text-center font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 15 }}>No players match.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ————— Player database browser — bottom of the Build tab ————— */
function Browser({ squad, addP }) {
  const [pos, setPos] = useState("MID");
  const [q, setQ] = useState("");
  const [f, setF] = useState(DEFAULT_F);
  const list = filterPlayers(pos, squad, q, f);
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: T.bgRaise, borderColor: T.line }}>
      <div className="flex items-center justify-between">
        <Label color={T.green}>Player database — quick add</Label>
        <span className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{list.length} SHOWN · SORTED {f.sort}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {Object.keys(POOL).map((k) => (
          <button key={k} onClick={() => setPos(k)} className="px-4 h-9 rounded-full font-bold"
            style={{ background: pos === k ? T.green : T.card, color: pos === k ? "#04130A" : T.dim, border: `1px solid ${pos === k ? T.green : T.line}`, fontFamily: FB, fontSize: 13 }}>
            {k}
          </button>
        ))}
        <div className="flex items-center gap-2 rounded-xl px-3 flex-1 min-w-40" style={{ background: T.card, border: `1px solid ${T.line}`, height: 38 }}>
          <Search size={14} color={T.dim} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
            className="flex-1 bg-transparent outline-none font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14 }} />
        </div>
      </div>
      <FilterBar f={f} setF={setF} />
      <div className="overflow-y-auto flex flex-col gap-2" style={{ maxHeight: 380 }}>
        {list.map((p) => <PlayerRow key={p.n} p={p} squad={squad} addP={addP} />)}
        {list.length === 0 && (
          <div className="py-8 text-center font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 15 }}>No players match.</div>
        )}
      </div>
    </div>
  );
}

/* ————— Feedback panel — exactly four readouts ————— */
function FeedbackPanel({ squad, H, setH, captainN }) {
  const e = useMemo(() => evaluate(squad, H, captainN), [squad, H, captainN]);
  const total = Object.values(e.spend).reduce((a, b) => a + b, 0) || 1;
  const empty = squad.length === 0;
  return (
    <aside className="rounded-2xl border p-5 flex flex-col gap-4 sticky top-6 self-start" style={{ background: T.card, borderColor: T.line, width: 320 }}>
      <div className="flex items-center justify-between">
        <Label color={T.green}>Live feedback</Label>
        <span className="flex items-center justify-center rounded-lg px-2.5 font-bold leading-none" style={{ background: T.bgRaise, height: 28, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{squad.length}/15 · £{e.bank.toFixed(1)}</span>
      </div>
      <div>
        <Label>① Projected points</Label>
        <div className="flex items-end gap-3 mt-1.5">
          <span className="leading-none" style={{ ...D, color: empty ? T.faint : T.green, fontSize: 42 }}>{empty ? "—" : e.proj}</span>
          <span className="pb-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>OVER {H} GW{H > 1 ? "S" : ""}</span>
        </div>
        <input type="range" min={1} max={12} value={H} onChange={(ev) => setH(+ev.target.value)} className="w-full mt-2.5" style={{ accentColor: T.green }} />
        <div className="flex justify-between font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          <span>THIS GW</span><span>12 GWS</span>
        </div>
      </div>
      <div>
        <Label>② Captaincy strength</Label>
        {empty ? <div className="mt-1.5 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 14 }}>—</div> : (
          <div className="flex items-center gap-3 mt-2">
            <Kit team={e.cap.team} size={26} captain />
            <div>
              <div className="font-bold leading-none" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 16 }}>{e.cap.n}
                <span className="ml-2 rounded px-1.5 py-0.5 font-bold" style={{ background: e.capMode === "SET" ? T.cap : T.bgRaise, color: e.capMode === "SET" ? "#FFFFFF" : T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{e.capMode}</span>
              </div>
              <div className="mt-1 font-bold" style={{ fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>
                <span style={{ color: T.green }}>{e.capLabel}</span>
                <span style={{ color: T.dim }}> · P(12+) {e.capP}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div>
        <Label>③ Risk flags</Label>
        {empty || e.risks.length === 0 ? (
          <div className="mt-1.5 font-semibold" style={{ color: empty ? T.dim : T.green, fontFamily: FB, fontSize: 14.5 }}>{empty ? "—" : "None — clean squad."}</div>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            {e.risks.map((p) => (
              <div key={p.n} className="flex items-center gap-2">
                <span style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>⚑</span>
                <span className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14 }}>{p.n}</span>
                <span className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 13 }}>{p.risk}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <Label>④ Structure</Label>
        <div className="mt-2 flex flex-col gap-1.5">
          {["GK", "DEF", "MID", "FWD"].map((pos) => (
            <div key={pos} className="flex items-center gap-2">
              <span className="w-9 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{pos}</span>
              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: "#2A0B3D" }}>
                <div style={{ height: 8, width: `${(e.spend[pos] / total) * 100}%`, background: T.green, opacity: 0.9 }} />
              </div>
              <span className="w-12 text-right font-bold" style={{ color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>£{e.spend[pos].toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <span className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>BENCH QUALITY</span>
          <span className="font-bold" style={{ color: e.bench >= 6.5 ? T.green : "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 14 }}>{empty ? "—" : `${e.bench.toFixed(1)}/10`}</span>
        </div>
      </div>
    </aside>
  );
}

/* ————— Drafts — YOUR saved squads only ————— */
function Drafts({ drafts, por, setPor, loadDraft, deleteDraft, toast }) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl border p-10 flex flex-col items-center gap-3 text-center" style={{ background: T.card, borderColor: T.line }}>
        <Save size={28} color={T.dim} />
        <div className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 18 }}>No drafts saved yet</div>
        <div className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 15, maxWidth: 420 }}>
          Build a squad on the pitch and press SAVE AS DRAFT. Saved versions appear here for side-by-side comparison. Your GW1 pure/moderate/spicy variants land here on 7 Aug.
        </div>
      </div>
    );
  }
  const evals = drafts.map((d) => evaluate(d.squad, 6, d.captainN));
  const best = {
    proj: Math.max(...evals.map((e) => e.proj)),
    bench: Math.max(...evals.map((e) => e.bench)),
    risks: Math.min(...evals.map((e) => e.risks.length)),
  };
  return (
    <div className="grid grid-cols-3 gap-3">
      {drafts.map((d, i) => {
        const e = evals[i];
        const isPor = por === d.id;
        return (
          <div key={d.id} className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: T.card, borderColor: isPor ? T.green : T.line }}>
            <div className="flex items-center justify-between">
              <span className="leading-none uppercase" style={{ ...D, color: "#FFFFFF", fontSize: 15 }}>{d.name}</span>
              {isPor
                ? <span className="flex items-center gap-1 rounded-full px-2.5 h-7 font-bold" style={{ background: "#06331D", color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}><Star size={11} /> PLAN</span>
                : <button onClick={() => { setPor(d.id); toast(`${d.name} set as plan of record`); }} className="rounded-full px-2.5 h-7 border font-bold" style={{ borderColor: T.line, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>SET PLAN</button>}
            </div>
            <div className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{d.structure} · £{e.cost.toFixed(1)} · {d.squad.length}/15</div>
            {[
              ["① PROJECTED · 6 GWS", e.proj, e.proj === best.proj],
              ["② CAPTAINCY", e.cap ? `${e.cap.n} · ${e.capP}%` : "—", e.capP >= 40],
              ["③ RISK FLAGS", e.risks.length, e.risks.length === best.risks],
              ["④ BENCH QUALITY", `${e.bench.toFixed(1)}/10`, e.bench === best.bench],
            ].map(([label, val, good]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{label}</span>
                <span className="font-bold" style={{ color: good ? T.green : "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 15 }}>{val}</span>
              </div>
            ))}
            <div className="flex gap-2 mt-1">
              <button onClick={() => loadDraft(d)} className="flex-1 h-9 rounded-full font-bold" style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 12.5 }}>LOAD</button>
              <button onClick={() => deleteDraft(d.id)} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: T.line }}><Trash2 size={14} color={T.dim} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ————— Analyst drawer (Builder context) ————— */
function AnalystDrawer({ onClose, toast }) {
  const [fired, setFired] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(6,0,10,0.6)" }} onClick={onClose}>
      <aside className="h-full flex flex-col border-l" onClick={(e) => e.stopPropagation()} style={{ width: 560, background: T.bgRaise, borderColor: T.line }}>
        <header className="flex items-center justify-between px-7 py-6 border-b" style={{ borderColor: T.line }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>✦ The Analyst</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>Builder · GW1 draft · 14 memory records</div>
          </div>
          <button onClick={onClose}><X size={20} color={T.dim} /></button>
        </header>
        <div className="px-7 py-5 flex gap-3 border-b" style={{ borderColor: T.line }}>
          <button onClick={() => setFired(true)} className="flex items-center gap-2 px-5 h-11 rounded-full font-bold"
            style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
            <Sparkles size={16} /> ASK · ~$0.10
          </button>
          <button onClick={() => toast("Analyst payload copied — paste into your Claude Project")}
            className="flex items-center gap-2 px-5 h-11 rounded-full font-bold border"
            style={{ color: T.cyan, borderColor: T.line, background: T.card, fontFamily: FB, fontSize: 14 }}>
            <Copy size={15} /> COPY ANALYST PAYLOAD
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-7 py-6 flex flex-col gap-4">
          {!fired ? (
            <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 15.5, lineHeight: 1.6 }}>
              The payload includes the squad on the pitch, its four readouts, structure evidence, and memory. Mock response — nothing connected, nothing charged.
            </p>
          ) : (
            <>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                Your draft spends £27.4 on defence for 21.2 xP6 — the 3-5-2 evidence (8.4) was built on DefCon CB pricing that weakens after the Hall flag (doubt 0.7). Hall → O'Brien frees £1.0 and clears the only defensive risk for −0.7 xP6, inside noise.
              </p>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                Disagreement with the ranking: Palmer (10.6, xP 4.5) sits above Rogers (7.1, xP 4.4) on price-band weighting alone; on this payload's numbers Rogers is strictly better per pound at this horizon.
              </p>
              <p className="font-bold" style={{ color: T.green, fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                THE LEVER: Hall → O'Brien — risk to zero, £1.0 banked, −0.7 xP6.
              </p>
            </>
          )}
        </div>
        <footer className="px-7 py-4 border-t flex justify-between font-bold" style={{ borderColor: T.line, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          <span>{fired ? "THIS CALL · $0.09" : "NO CALL FIRED"}</span>
          <span>AUG SPEND · $2.84 OF $8.00 CAP</span>
        </footer>
      </aside>
    </div>
  );
}

const NAV = [
  { id: "Dashboard", icon: LayoutGrid },
  { id: "Squad", icon: ShirtIcon },
  { id: "Builder", icon: Hammer },
  { id: "Players", icon: Users },
  { id: "Analysis", icon: BarChart3 },
  { id: "News", icon: Newspaper },
];

function Stub({ name, back }) {
  const approved = name === "Dashboard";
  return (
    <div className="flex flex-col items-start gap-5 pt-20 max-w-xl">
      <h2 className="uppercase" style={{ ...D, color: "#FFFFFF", fontSize: 42 }}>{name}</h2>
      <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 17, lineHeight: 1.6 }}>
        {approved ? "Approved — final version lives in dashboard-mockup.jsx." : "Built after the Builder is approved. Spec lives in 03-ui.md §3."}
      </p>
      <button onClick={back} className="px-6 h-12 rounded-full font-bold" style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
        BACK TO BUILDER
      </button>
    </div>
  );
}

/* ————— Auto-complete — greedy solver: best xP affordable while reserving
   minimum prices for every remaining slot. Pure arithmetic, free, instant. ————— */
function Slot({ p, pos, captainN, viceN, onEmpty, onMenu, dragRef, onSwap }) {
  if (!p) return (
    <button onClick={onEmpty} className="flex flex-col items-center justify-center rounded-xl transition-transform active:scale-95"
      style={{ width: 70, height: 74, background: "rgba(6,0,12,0.55)", border: "1.5px dashed rgba(255,255,255,0.4)" }}>
      <Plus size={16} color="rgba(255,255,255,0.85)" />
      <span className="mt-1 font-bold" style={{ color: "rgba(255,255,255,0.85)", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{pos}</span>
    </button>
  );
  return (
    <button draggable onClick={onMenu}
      onDragStart={() => { dragRef.current = p.n; }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (dragRef.current && dragRef.current !== p.n) onSwap(dragRef.current, p.n); dragRef.current = null; }}
      className="flex flex-col items-center transition-transform active:scale-95" style={{ width: 70 }}>
      <Kit team={p.team} size={38} captain={captainN === p.n} vice={viceN === p.n} />
      <div className="mt-1 rounded px-1.5 py-0.5 w-full text-center truncate font-bold leading-tight" style={{ background: "rgba(6,0,12,0.78)", color: "#FFFFFF", fontFamily: FB, fontSize: 13 }}>{p.n}</div>
      <div className="rounded-b px-1.5 pb-0.5 w-full text-center font-bold leading-tight" style={{ background: "rgba(6,0,12,0.78)", color: "rgba(255,255,255,0.85)", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>£{p.price.toFixed(1)}</div>
    </button>
  );
}
function Pitch({ squad, structure, captainN, viceN, openModal, openMenu, onSwap }) {
  const dragRef = useRef(null);
  const plan = { GK: 1, ...structure.xi };
  const xi = []; const bench = [];
  ["GK", "DEF", "MID", "FWD"].forEach((pos) => {
    const ps = squad.filter((p) => p.pos === pos);
    xi.push({ pos, slots: plan[pos], players: ps.slice(0, plan[pos]) });
    bench.push(...ps.slice(plan[pos]));
  });
  const rows = [...xi].reverse();
  return (
    <div className="rounded-2xl overflow-hidden px-4 pt-5 pb-4 flex flex-col gap-3" style={{ background: GRASS, border: `1px solid ${T.line}` }}>
      <div className="relative flex flex-col gap-4 pb-2 overflow-hidden">
        <div className="absolute rounded-full" style={{ top: -60, left: "50%", transform: "translateX(-50%)", width: 170, height: 120, border: "2px solid rgba(255,255,255,0.25)" }} />
        <div className="absolute" style={{ bottom: 0, left: "50%", transform: "translateX(-50%)", width: 280, height: 52, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        <div className="absolute" style={{ bottom: 0, left: "50%", transform: "translateX(-50%)", width: 120, height: 22, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        {rows.map(({ pos, slots, players }) => (
          <div key={pos} className="flex justify-center gap-3 relative">
            {Array.from({ length: slots }).map((_, i) => (
              <Slot key={pos + i} p={players[i]} pos={pos} captainN={captainN} viceN={viceN}
                onEmpty={() => openModal(pos)} onMenu={() => players[i] && openMenu(players[i])} dragRef={dragRef} onSwap={onSwap} />
            ))}
          </div>
        ))}
      </div>
      <div className="rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap" style={{ background: "rgba(5,0,10,0.94)" }}>
        <Label>Bench</Label>
        {bench.map((p) => (
          <button key={p.n} draggable onClick={() => openMenu(p)}
            onDragStart={() => { dragRef.current = p.n; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragRef.current && dragRef.current !== p.n) onSwap(dragRef.current, p.n); dragRef.current = null; }}
            className="flex items-center gap-2 rounded-lg px-2.5 h-9 border" style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.2)" }}>
            <Kit team={p.team} size={17} />
            <span className="font-bold truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 13.5, maxWidth: 92 }}>{p.n}</span>
            <span className="font-bold" style={{ color: "rgba(255,255,255,0.85)", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>£{p.price.toFixed(1)}</span>
          </button>
        ))}
        {squad.length < 15 && <span className="font-bold" style={{ color: "rgba(255,255,255,0.62)", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{15 - squad.length} SLOTS OPEN</span>}
        <span className="ml-auto font-bold" style={{ color: "rgba(255,255,255,0.62)", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>DRAG TO SWAP · CLICK FOR MENU</span>
      </div>
    </div>
  );
}
function SlotMenu({ p, captainN, viceN, setCap, setVice, removeP, onClose }) {
  const Btn = ({ onClick, children, accent }) => (
    <button onClick={onClick} className="h-11 rounded-xl font-bold px-4 text-left"
      style={{ background: T.card, color: accent || "#FFFFFF", border: `1px solid ${T.line}`, fontFamily: FB, fontSize: 14.5 }}>{children}</button>
  );
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(6,0,10,0.7)" }} onClick={onClose}>
      <div className="rounded-2xl border p-5 flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()} style={{ background: T.bgRaise, borderColor: T.line, width: 330 }}>
        <div className="flex items-center gap-3 pb-2">
          <Kit team={p.team} size={30} captain={captainN === p.n} vice={viceN === p.n} />
          <div>
            <div className="font-bold leading-none" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 17 }}>{p.n}</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{p.team} · {p.pos} · £{p.price.toFixed(1)} · NEXT {TEAM_NEXT[p.team]}</div>
            {p.risk && <div className="mt-1 font-bold" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>⚑ {p.risk}</div>}
          </div>
        </div>
        {captainN === p.n
          ? <Btn onClick={() => { setCap(null); onClose(); }}>Remove captaincy</Btn>
          : <Btn onClick={() => { setCap(p.n); onClose(); }}>Make captain <span style={{ color: T.green }}>C</span></Btn>}
        {viceN === p.n
          ? <Btn onClick={() => { setVice(null); onClose(); }}>Remove vice</Btn>
          : <Btn onClick={() => { setVice(p.n); onClose(); }}>Make vice-captain <span style={{ color: T.dim }}>V</span></Btn>}
        <Btn accent={T.pink} onClick={() => { removeP(p); onClose(); }}>Remove from squad</Btn>
      </div>
    </div>
  );
}
function autoComplete(squad) {
  let next = [...squad];
  const cost = () => next.reduce((s, p) => s + p.price, 0);
  const sortedElig = (ps) => POOL[ps]
    .filter((p) => !next.some((x) => x.n === p.n) && clubCount(next, p.team) < 3)
    .map((p) => p.price).sort((a, b) => a - b);
  const reserveFor = (curPos) => {
    let r = 0;
    ["GK", "DEF", "MID", "FWD"].forEach((ps) => {
      let k = LIMITS[ps] - posCount(next, ps);
      if (ps === curPos) k -= 1;
      if (k <= 0) return;
      const prices = sortedElig(ps);
      const start = ps === curPos ? 1 : 0;
      for (let i = 0; i < k; i++) r += prices[start + i] ?? 99;
    });
    return r;
  };
  ["FWD", "MID", "DEF", "GK"].forEach((pos) => {
    while (posCount(next, pos) < LIMITS[pos]) {
      const cap = BUDGET - cost() - reserveFor(pos);
      const cand = POOL[pos]
        .filter((p) => !next.some((x) => x.n === p.n) && clubCount(next, p.team) < 3 && p.price <= cap)
        .sort((a, b) => b.xp - a.xp)[0];
      if (!cand) break;
      next.push(cand);
    }
  });
  return next;
}

/* ————— App ————— */
export default function App() {
  const [page, setPage] = useState("Builder");
  const [tab, setTab] = useState("BUILD");
  const [squad, setSquad] = useState([]);
  const [structId, setStructId] = useState("3-5-2");
  const [captainN, setCaptainN] = useState(null);
  const [viceN, setViceN] = useState(null);
  const [modalPos, setModalPos] = useState(null);
  const [menuP, setMenuP] = useState(null);
  const [H, setH] = useState(6);
  const [drafts, setDrafts] = useState([]);
  const [por, setPor] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const structure = STRUCTURES.find((s) => s.id === structId);
  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400); }, []);

  const addP = useCallback((p) => {
    setSquad((sq) => {
      if (sq.some((q) => q.n === p.n)) return sq;
      if (posCount(sq, p.pos) >= LIMITS[p.pos]) { toast(`${p.pos} is full (${LIMITS[p.pos]})`); return sq; }
      if (clubCount(sq, p.team) >= 3) { toast(`Max 3 per club — ${p.team} is full`); return sq; }
      const cost = sq.reduce((s, q) => s + q.price, 0) + p.price;
      if (cost > BUDGET) { toast(`Over budget — £${(cost - BUDGET).toFixed(1)} past £100.0`); return sq; }
      return [...sq, p];
    });
  }, [toast]);

  const removeP = useCallback((p) => {
    setSquad((sq) => sq.filter((q) => q.n !== p.n));
    setCaptainN((c) => (c === p.n ? null : c));
    setViceN((v) => (v === p.n ? null : v));
  }, []);

  const setCap = useCallback((n) => {
    setCaptainN(n);
    setViceN((v) => (v === n ? null : v));
    if (n) toast(`${n} is captain`);
  }, [toast]);
  const setVice = useCallback((n) => {
    setViceN(n);
    setCaptainN((c) => (c === n ? null : c));
    if (n) toast(`${n} is vice-captain`);
  }, [toast]);

  const onSwap = useCallback((aN, bN) => {
    setSquad((sq) => {
      const i = sq.findIndex((p) => p.n === aN);
      const j = sq.findIndex((p) => p.n === bN);
      if (i < 0 || j < 0) return sq;
      if (sq[i].pos !== sq[j].pos) { toast("Swap within the same position"); return sq; }
      const next = [...sq];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, [toast]);

  const runAutoComplete = useCallback(() => {
    setSquad((sq) => {
      if (sq.length >= 15) { toast("Squad already complete"); return sq; }
      const filled = autoComplete(sq);
      toast(`Auto-completed — ${filled.length - sq.length} added, £${(BUDGET - filled.reduce((s, p) => s + p.price, 0)).toFixed(1)} left`);
      return filled;
    });
  }, [toast]);

  const saveDraft = useCallback(() => {
    if (squad.length === 0) { toast("Nothing to save — add players first"); return; }
    setDrafts((ds) => {
      const d = { id: Date.now(), name: `Draft ${ds.length + 1}`, squad: [...squad], structure: structId, captainN };
      toast(`${d.name} saved (${squad.length}/15)`);
      return [...ds, d].slice(-3);
    });
  }, [squad, structId, captainN, toast]);
  const loadDraft = useCallback((d) => {
    setSquad([...d.squad]); setStructId(d.structure); setCaptainN(d.captainN || null); setViceN(null);
    setTab("BUILD"); toast(`${d.name} loaded onto the pitch`);
  }, [toast]);
  const deleteDraft = useCallback((id) => setDrafts((ds) => ds.filter((d) => d.id !== id)), []);

  const refresh = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => { setSpinning(false); toast("Refreshed — prices, injuries, ownership and fixtures updated"); }, 900);
  }, [spinning, toast]);


  return (
    <div className="min-h-screen w-full flex flex-row-reverse" style={{ background: T.bg, fontFamily: FB, fontWeight: 600 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Michroma&family=Martian+Mono:wght@700;800&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ————— Right rail ————— */}
      <nav className="h-screen sticky top-0 flex flex-col border-l px-5 py-7" style={{ width: 240, background: T.bgRaise, borderColor: T.line }}>
        <div className="px-3 mb-7">
          <div className="leading-none" style={{ ...D, color: "#FFFFFF", fontSize: 20 }}>FPL<span style={{ color: T.green }}>.</span></div>
          <div className="mt-1.5 uppercase font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.18em" }}>Rank one</div>
        </div>
        <div className="flex flex-col gap-1">
          {NAV.map(({ id, icon: Icon }) => {
            const active = page === id;
            return (
              <button key={id} onClick={() => setPage(id)}
                className="flex items-center gap-3 px-4 h-11 rounded-xl text-left font-bold"
                style={{ background: active ? T.card : "transparent", color: active ? T.green : T.dim, border: `1px solid ${active ? T.line : "transparent"}`, fontFamily: FB, fontSize: 15 }}>
                <Icon size={18} strokeWidth={active ? 2.6 : 2.2} /> {id}
              </button>
            );
          })}
        </div>
        <div className="mt-7 flex flex-col gap-2">
          <button onClick={refresh} className="flex items-center justify-center gap-2 h-11 rounded-full font-bold"
            style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
            <RefreshCw size={15} style={spinning ? { animation: "spin 0.9s linear infinite" } : undefined} />
            {spinning ? "REFRESHING" : "REFRESH"}
          </button>
          <button onClick={() => setAskOpen(true)} className="flex items-center justify-center gap-2 h-11 rounded-full font-bold border"
            style={{ background: T.card, color: T.green, borderColor: T.line, fontFamily: FB, fontSize: 14 }}>
            <Sparkles size={14} /> ASK · ~$0.10
          </button>
        </div>
        <div className="mt-auto px-3 py-2.5">
          <div className="flex items-center gap-2 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.green }} /> ALL DATA FRESH
          </div>
          <div className="mt-1 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Updated 2 min ago</div>
        </div>
      </nav>

      {/* ————— Content ————— */}
      <main className="flex-1">
        <div className="mx-auto px-10 pb-14" style={{ maxWidth: 1480 }}>
          <header className="pt-8 pb-6 flex items-end justify-between">
            <div>
              <div className="font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.18em" }}>FPL 2026/27 · Campaign</div>
              <h1 className="leading-none mt-2 uppercase" style={{ ...D, color: "#FFFFFF", fontSize: 40 }}>{page === "Builder" ? "Squad Builder" : page}</h1>
            </div>
            <span className="flex items-center px-4 rounded-full font-bold leading-none mb-1"
              style={{ background: T.card, color: "#FFFFFF", border: `1px solid ${T.line}`, fontFamily: FN, fontWeight: FNW, fontSize: 13, height: 34 }}>
              GW1 DEADLINE · FRI 18:30 · <span style={{ color: T.green, marginLeft: 5 }}>15D 20H</span>
            </span>
          </header>

          {page === "Builder" ? (
            <div className="flex gap-5 items-start">
              <div className="flex-1 flex flex-col gap-4">
                {/* Row 1 — tabs + actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {["BUILD", "DRAFTS"].map((m) => (
                    <button key={m} onClick={() => setTab(m)} className="px-5 h-10 rounded-full font-bold"
                      style={{
                        background: tab === m ? T.green : T.card, color: tab === m ? "#04130A" : T.dim,
                        border: `1px solid ${tab === m ? T.green : T.line}`, fontFamily: FB, fontSize: 14,
                      }}>
                      {m}{m === "DRAFTS" ? ` (${drafts.length})` : ""}
                    </button>
                  ))}
                  {tab === "BUILD" && (
                    <>
                      <button onClick={runAutoComplete} className="ml-auto flex items-center gap-2 px-4 h-10 rounded-full font-bold"
                        style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 13.5 }}>
                        <Wand2 size={14} /> AUTO-COMPLETE
                      </button>
                      <button onClick={saveDraft} className="flex items-center gap-2 px-4 h-10 rounded-full font-bold border"
                        style={{ background: T.card, color: "#FFFFFF", borderColor: T.line, fontFamily: FB, fontSize: 13.5 }}>
                        <Save size={14} /> SAVE AS DRAFT
                      </button>
                    </>
                  )}
                </div>

                {tab === "BUILD" ? (
                  <>
                    {/* Row 2 — all 7 formations, evidence-ranked */}
                    <div className="flex gap-1">
                      {STRUCTURES.map((s) => (
                        <button key={s.id} onClick={() => { setStructId(s.id); toast(`Structure ${s.id} — evidence ${s.ev.toFixed(1)}`); }}
                          className="relative flex items-center gap-1.5 px-2.5 h-9 rounded-lg border"
                          style={{ background: structId === s.id ? T.bgRaise : T.card, borderColor: structId === s.id ? T.green : T.line }}>
                          <span className="leading-none" style={{ ...D, color: "#FFFFFF", fontSize: 12.5 }}>{s.id}</span>
                          <span className="font-bold leading-none" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{s.ev.toFixed(1)}</span>
                          {s.ev === TOP_EV && (
                            <span className="absolute -top-2 -right-2 rounded-full px-1.5 h-4.5 flex items-center font-bold"
                              style={{ background: T.cap, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 20 }}>TOP</span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Row 3 — THE PITCH */}
                    <Pitch squad={squad} structure={structure} captainN={captainN} viceN={viceN}
                      openModal={setModalPos} openMenu={setMenuP} onSwap={onSwap} />

                    {/* Row 4 — full database browser */}
                    <Browser squad={squad} addP={addP} />
                  </>
                ) : (
                  <Drafts drafts={drafts} por={por} setPor={setPor} loadDraft={loadDraft} deleteDraft={deleteDraft} toast={toast} />
                )}
              </div>
              <FeedbackPanel squad={squad} H={H} setH={setH} captainN={captainN} />
            </div>
          ) : (
            <Stub name={page} back={() => setPage("Builder")} />
          )}
        </div>
      </main>

      {modalPos && <PlayerModal pos={modalPos} squad={squad} addP={addP} onClose={() => setModalPos(null)} />}
      {menuP && <SlotMenu p={menuP} captainN={captainN} viceN={viceN} setCap={setCap} setVice={setVice} removeP={removeP} onClose={() => setMenuP(null)} />}
      {askOpen && <AnalystDrawer onClose={() => setAskOpen(false)} toast={toast} />}

      {toastMsg && (
        <div className="fixed left-1/2 bottom-8 -translate-x-1/2 px-6 h-11 flex items-center rounded-full font-bold z-50"
          style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
