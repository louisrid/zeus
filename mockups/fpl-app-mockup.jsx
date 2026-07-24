import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  LayoutGrid, Shirt as ShirtIcon, Hammer, Users, BarChart3, Newspaper,
  RefreshCw, Sparkles, TrendingUp, TrendingDown, ChevronRight, X, Copy,
  Plus, Star, Trash2, Save, Search, Wand2, RotateCcw, ArrowRight, Lock,
} from "lucide-react";

/* ═════════ FPL. RANK ONE — FULLY LINKED PROTOTYPE (all six screens, one app) ═════════
   LOCKED SYSTEM — Michroma (identity) · Outfit 600+ (body) · Martian Mono 800 (data).
   White text only · 12px floor · numbers centred on dark plates · green = projections/actions ·
   #E90052 = risk · #FF2ECC (white text) = captain/×2 + TOP + value · form bands red/amber/green/blue ·
   FPL green pitch, GK bottom, bench bar on grass · nav rail RIGHT · xP terminology. */
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
const SHADOW = "0 1px 3px rgba(0,0,0,0.85)";

const KITS = {
  ARS: ["#EF0107", "#FFFFFF"], LIV: ["#C8102E", "#8E0C20"], MUN: ["#DA291C", "#1A1A1A"],
  NFO: ["#E53233", "#E53233"], BOU: ["#B50E12", "#000000"], BRE: ["#E30613", "#FFFFFF"],
  MCI: ["#6CABDD", "#6CABDD"], CHE: ["#034694", "#034694"], EVE: ["#003399", "#003399"],
  BHA: ["#0057B8", "#FFFFFF"], CRY: ["#1B458F", "#C4122E"], TOT: ["#FFFFFF", "#132257"],
  NEW: ["#241F20", "#FFFFFF"], FUL: ["#FFFFFF", "#000000"], WOL: ["#FDB913", "#FDB913"],
  AVL: ["#670E36", "#95BFE5"], WHU: ["#7A263A", "#1BB1E7"], SUN: ["#EB172B", "#FFFFFF"],
  BUR: ["#6C1D45", "#99D6EA"], LEE: ["#FFFFFF", "#1D428A"],
};

function Kit({ team, size = 26, captain = false, vice = false }) {
  const [body, sleeve] = KITS[team] || ["#31114A", "#31114A"];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size * 0.9 }}>
      <svg viewBox="0 0 40 36" width={size} height={size * 0.9}>
        <path d="M13 2 L16 4 Q20 6.5 24 4 L27 2 L38 8 L34 16 L28 12.5 L28 34 L12 34 L12 12.5 L6 16 L2 8 Z" fill={body} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
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

const Label = ({ children, color = T.dim }) => (
  <div className="font-bold uppercase" style={{ color, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.08em" }}>{children}</div>
);
const Plate = ({ children, color = "#FFFFFF", w, h = 30, bg = "#0D0014", size = 12.5 }) => (
  <div className="flex items-center justify-center rounded-lg px-2 font-bold leading-none whitespace-nowrap"
    style={{ background: bg, height: h, minWidth: w, color, fontFamily: FN, fontWeight: FNW, fontSize: size }}>
    {children}
  </div>
);
function Sel({ value, onChange, options, label }) {
  return (
    <label className="flex items-center gap-2 rounded-lg px-2.5 border" style={{ background: T.card, borderColor: T.line, height: 38 }}>
      <span className="font-bold uppercase" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent outline-none font-bold cursor-pointer"
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

/* ————— Fixture engine — 6 pairwise-consistent rounds; round 1 = the real GW8 list ————— */
const ORDER = ["BOU", "MCI", "LIV", "MUN", "CHE", "AVL", "TOT", "NFO", "WHU", "SUN", "LEE", "BUR", "BHA", "FUL", "BRE", "CRY", "NEW", "EVE", "WOL", "ARS"];
const STRENGTH = { ARS: 5, LIV: 5, MCI: 5, CHE: 4, NEW: 4, AVL: 4, MUN: 3, TOT: 3, NFO: 3, CRY: 3, BOU: 3, BHA: 3, EVE: 3, FUL: 3, BRE: 3, WHU: 2, WOL: 2, SUN: 2, BUR: 2, LEE: 2 };
const FIX = (() => {
  const out = Object.fromEntries(ORDER.map((t) => [t, []]));
  let rest = ORDER.slice(1);
  for (let r = 0; r < 6; r++) {
    const arr = [ORDER[0], ...rest];
    for (let i = 0; i < 10; i++) {
      const a = arr[i], b = arr[19 - i];
      const aHome = r % 2 === 0;
      out[a].push({ op: b, home: aHome, fdr: STRENGTH[b] });
      out[b].push({ op: a, home: !aHome, fdr: STRENGTH[a] });
    }
    rest = [rest[rest.length - 1], ...rest.slice(0, rest.length - 1)];
  }
  return out;
})();
const nextLabel = (team) => { const f = FIX[team][0]; return f.home ? `${f.op} (H)` : `${f.op.toLowerCase()} (A)`; };

/* ————— Player universe (~70 mock; the real build queries the full FPL DB) ————— */
const RAW = {
  GK: [
    ["Raya", "ARS", 5.7, 4.9], ["Pope", "NEW", 5.4, 4.3], ["Sels", "NFO", 5.2, 4.0],
    ["Sánchez", "CHE", 5.0, 3.9], ["Verbruggen", "BHA", 4.6, 3.4], ["Vicario", "TOT", 5.0, 3.5],
    ["Petrović", "BOU", 4.7, 3.3], ["Areola", "WHU", 4.4, 3.0], ["Dúbravka", "BUR", 4.0, 2.9], ["Darlow", "LEE", 4.0, 2.5],
  ],
  DEF: [
    ["Gabriel", "ARS", 6.3, 5.0], ["Timber", "ARS", 6.0, 4.8], ["Saliba", "ARS", 6.2, 4.7],
    ["Van Dijk", "LIV", 6.4, 4.6], ["Gvardiol", "MCI", 6.1, 4.5], ["Hall", "NEW", 5.8, 4.3, "Knock — doubt 0.7"],
    ["Kerkez", "LIV", 5.8, 4.2], ["Ait-Nouri", "MCI", 5.9, 4.1], ["Porro", "TOT", 5.7, 4.1],
    ["Robertson", "LIV", 5.9, 4.0], ["Milenković", "NFO", 5.3, 4.0], ["Aina", "NFO", 5.1, 4.0],
    ["Colwill", "CHE", 5.5, 3.8], ["Muñoz", "CRY", 5.6, 3.7], ["Guéhi", "CRY", 5.2, 3.6],
    ["O'Brien", "EVE", 4.8, 3.6], ["Tarkowski", "EVE", 5.0, 3.5], ["Senesi", "BOU", 4.7, 3.4],
    ["Andersen", "FUL", 4.9, 3.3], ["Rodon", "LEE", 4.3, 3.0], ["Estève", "BUR", 4.2, 2.8],
  ],
  MID: [
    ["Salah", "LIV", 14.3, 6.6], ["Saka", "ARS", 10.8, 6.1], ["Wirtz", "LIV", 9.8, 5.8],
    ["Mbeumo", "MUN", 8.4, 5.6], ["Ødegaard", "ARS", 9.6, 5.2], ["Eze", "ARS", 8.8, 5.1],
    ["Fernandes", "MUN", 9.0, 5.0], ["Gordon", "NEW", 7.6, 4.7, "Rotation — minutes risk"],
    ["Semenyo", "BOU", 7.3, 4.6], ["Doku", "MCI", 7.2, 4.6], ["Schade", "BRE", 6.9, 4.6],
    ["Sávio", "MCI", 7.0, 4.5], ["Palmer", "CHE", 10.6, 4.5], ["Rogers", "AVL", 7.1, 4.4],
    ["Bruno G.", "NEW", 6.9, 4.3], ["Ndiaye", "EVE", 6.6, 4.3], ["Kudus", "TOT", 6.8, 4.2],
    ["Enzo", "CHE", 6.7, 4.2], ["Iwobi", "FUL", 6.2, 4.1], ["Anthony", "BUR", 5.9, 4.0],
    ["McNeil", "EVE", 5.4, 3.6], ["Le Fée", "SUN", 5.0, 3.2],
  ],
  FWD: [
    ["Haaland", "MCI", 14.2, 7.8], ["Gyökeres", "ARS", 9.4, 6.4], ["Isak", "LIV", 10.6, 6.0],
    ["Ekitiké", "LIV", 8.9, 5.4], ["Šeško", "MUN", 8.2, 4.8], ["João Pedro", "CHE", 7.9, 4.7],
    ["Wood", "NFO", 7.6, 4.4, "Rested flag — 0.5"], ["Watkins", "AVL", 8.7, 4.4], ["Mateta", "CRY", 7.4, 4.3],
    ["Strand Larsen", "WOL", 7.2, 4.3], ["Thiago", "BRE", 6.8, 4.2], ["Evanilson", "BOU", 6.9, 4.1],
    ["Muniz", "FUL", 6.6, 3.9], ["Füllkrug", "WHU", 6.4, 3.8], ["Awoniyi", "NFO", 5.9, 3.4],
  ],
};
const KNOWN = {
  pts: { Haaland: 61, Semenyo: 57, Saka: 54, Palmer: 52, Gyökeres: 49, Mbeumo: 46, Salah: 45, Isak: 44, Muñoz: 41, Gabriel: 39, Wood: 38, Timber: 36, Raya: 34, "Van Dijk": 33 },
  own: { Haaland: 82, Saka: 44, Salah: 41, Semenyo: 38, Gabriel: 34, Gyökeres: 25, Palmer: 22, Mbeumo: 28, Isak: 24, "Van Dijk": 19, Muñoz: 17, Wood: 15 },
};
const MY_NAMES = ["Raya", "Gabriel", "Van Dijk", "Muñoz", "Saka", "Palmer", "Semenyo", "Mbeumo", "Rogers", "Haaland", "Wood", "Sels", "Timber", "O'Brien", "Strand Larsen"];
const MY_SQUAD = new Set(MY_NAMES);

function seeded(name) {
  let s = 0;
  for (const c of name) s = (s * 31 + c.charCodeAt(0)) % 100000;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
const PLAYERS = [];
Object.entries(RAW).forEach(([pos, arr]) => {
  arr.forEach(([n, team, price, xp, risk]) => {
    const r = seeded(n);
    const apps = 6 + Math.round(r());
    const pts = KNOWN.pts[n] ?? Math.max(6, Math.round(xp * 7 + (r() * 8 - 4)));
    const g = pos === "GK" ? 0 : pos === "DEF" ? Math.round(r() * 2) : pos === "MID" ? Math.round(pts * 0.05 + r() * 2) : Math.round(pts * 0.09 + r() * 2);
    const a = pos === "GK" ? 0 : Math.round(pts * 0.04 + r() * 2);
    const cs = pos === "FWD" ? Math.round(r() * 2) : Math.round(2 + r() * 3);
    const own = KNOWN.own[n] ?? Math.max(1, Math.round(2 + xp * 2.5 + r() * 8));
    const base = pts / 7;
    const form5 = Array.from({ length: 5 }, () => Math.max(0, Math.round(base + (r() * 8 - 3.2))));
    if (xp >= 6 && form5.every((v) => v < 13)) form5[3] = 13 + Math.round(r() * 4);
    const pstart = risk ? 55 : 84 + Math.round(r() * 14);
    const mins = Math.round(64 + (pstart - 55) * 0.6);
    const xg = +(pos === "GK" ? 0 : pos === "DEF" ? g * 0.7 + r() * 0.5 : pos === "MID" ? g * 0.85 + r() * 1.1 : g * 0.8 + r() * 1.6).toFixed(1);
    const xa = +(pos === "GK" ? 0.2 : a * 0.85 + r() * 0.9).toFixed(1);
    const p0 = +(price - Math.round(r() * 6 - 2) / 10).toFixed(1);
    const hb = 1.06 + r() * 0.1;
    const hxp = +(xp * hb).toFixed(1);
    const axp = +Math.max(0.5, xp * 2 - xp * hb).toFixed(1);
    PLAYERS.push({ n, team, pos, price, xp, risk, apps, pts, g, a, cs, own, form5, pstart, mins, val: xp / price * 10, xg, xa, p0, hxp, axp });
  });
});
const PROMOTED = new Set(["SUN", "LEE", "BUR"]);
function ShotMap({ p }) {
  const r = seeded(p.n + "s");
  const shots = Math.max(4, Math.round((p.xg || 0.5) * 6 + r() * 5));
  const dots = Array.from({ length: shots }, (_, i) => {
    const goal = i < p.g;
    return { x: Math.min(160, 22 + r() * 138), y: Math.min(94, 14 + r() * 66 + (goal ? 0 : 16)), goal };
  });
  return (
    <svg width="180" height="112" viewBox="0 0 180 112">
      <rect x="1" y="1" width="178" height="110" rx="8" fill="#0D0014" />
      <rect x="40" y="1" width="100" height="42" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <rect x="66" y="1" width="48" height="18" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.goal ? 4 : 3} fill={d.goal ? "#00FF85" : "rgba(255,255,255,0.45)"} />)}
    </svg>
  );
}
const byName = (n) => PLAYERS.find((p) => p.n === n);
const POOL = { GK: [], DEF: [], MID: [], FWD: [] };
PLAYERS.forEach((p) => POOL[p.pos].push(p));
const LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const BUDGET = 100.0;
const MIN_PRICE = Object.fromEntries(Object.entries(POOL).map(([pos, arr]) => [pos, Math.min(...arr.map((p) => p.price))]));

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

const clubCount = (sq, team) => sq.filter((p) => p.team === team).length;
const posCount = (sq, pos) => sq.filter((p) => p.pos === pos).length;
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
const barColor = (v) => (v >= 13 ? "#4DD6FF" : v >= 8 ? T.green : v >= 4 ? "#FFC94D" : "#FF5A5A");
const teamBand = (v) => (v >= 66 ? "#4DD6FF" : v >= 58 ? T.green : v >= 50 ? "#FFC94D" : "#FF5A5A");
const fdrBg = (f) => (f <= 2 ? T.green : f === 3 ? "#6B5585" : f === 4 ? T.pink : "#B3003F");

/* ═════════ DASHBOARD ═════════ */
const XI = [
  { n: "Raya", team: "ARS", pos: "GK", pts: 6, mins: 90 },
  { n: "Gabriel", team: "ARS", pos: "DEF", pts: 8, mins: 90 },
  { n: "Van Dijk", team: "LIV", pos: "DEF", pts: 0, mins: 0 },
  { n: "Muñoz", team: "CRY", pos: "DEF", pts: 9, mins: 90 },
  { n: "Saka", team: "ARS", pos: "MID", pts: 3, mins: 78 },
  { n: "Palmer", team: "CHE", pos: "MID", pts: 3, mins: 64 },
  { n: "Semenyo", team: "BOU", pos: "MID", pts: 11, mins: 90 },
  { n: "Mbeumo", team: "MUN", pos: "MID", pts: 14, mins: 90 },
  { n: "Rogers", team: "AVL", pos: "MID", pts: 2, mins: 61 },
  { n: "Haaland", team: "MCI", pos: "FWD", pts: 2, mins: 90, c: true },
  { n: "Wood", team: "NFO", pos: "FWD", pts: 5, mins: 83 },
];
const BENCH = [
  { n: "Sels", team: "NFO", pos: "GK", pts: 3, mins: 90 },
  { n: "Timber", team: "ARS", pos: "DEF", pts: 6, mins: 90 },
  { n: "O'Brien", team: "EVE", pos: "DEF", pts: 2, mins: 90 },
  { n: "Larsen", team: "WOL", pos: "FWD", pts: 1, mins: 12 },
];
const PROJECTED = 58;
const LIVE = { projected: 61, played: { Raya: 2, Gabriel: 6, "Van Dijk": 1, Saka: 8, Semenyo: 2 }, score: 19 };
const SEASON = [[1, 52, 49], [2, 55, 61], [3, 60, 54], [4, 57, 58], [5, 54, 47], [6, 59, 66], [7, 58, 71]];
function applyAutosubs(xi, bench) {
  const disp = (p) => (p.c ? p.pts * 2 : p.pts);
  const counts = { DEF: 0, MID: 0, FWD: 0 };
  xi.forEach((p) => { if (p.pos !== "GK" && p.mins > 0) counts[p.pos] += 1; });
  const mins = { DEF: 3, MID: 2, FWD: 1 };
  const subs = []; const used = new Set();
  xi.filter((p) => p.mins === 0).forEach((out) => {
    const pool = out.pos === "GK" ? bench.filter((b) => b.pos === "GK") : bench.filter((b) => b.pos !== "GK");
    for (const cand of pool) {
      if (used.has(cand.n) || cand.mins === 0) continue;
      const ok = out.pos === "GK" || cand.pos === out.pos || counts[out.pos] >= mins[out.pos];
      if (ok) { subs.push({ out: out.n, in: cand.n, pts: cand.pts }); used.add(cand.n); break; }
    }
  });
  const xiTotal = xi.reduce((s, p) => s + (p.mins > 0 ? disp(p) : 0), 0);
  const actual = xiTotal + subs.reduce((s, x) => s + x.pts, 0);
  return { subs, actual, subbedOut: new Set(subs.map((s) => s.out)), subbedIn: new Set(subs.map((s) => s.in)) };
}
const TRENDING = [
  { n: "Semenyo", last3: [12, 15, 11] },
  { n: "Gyökeres", last3: [13, 9, 16] },
  { n: "Mbeumo", last3: [10, 7, 14] },
  { n: "Muñoz", last3: [8, 12, 9] },
  { n: "Isak", last3: [9, 11, 8] },
].map((t) => ({ ...byName(t.n), last3: t.last3 }));
const SWINGS = [
  { team: "ARS", dir: "EASING", from: 3.8, to: 2.4, own: "Raya · Gabriel · Saka" },
  { team: "CHE", dir: "BRUTAL", from: 2.6, to: 4.4, own: "Palmer" },
  { team: "NEW", dir: "EASING", from: 3.6, to: 2.4, own: "—" },
  { team: "AVL", dir: "BRUTAL", from: 2.9, to: 4.1, own: "Rogers" },
].map((s) => ({ ...s, next: FIX[s.team].slice(0, 5) }));
const DBPREV = { ALL: [...PLAYERS].sort((a, b) => b.pts - a.pts).slice(0, 5) };
["GK", "DEF", "MID", "FWD"].forEach((k) => { DBPREV[k] = [...POOL[k]].sort((a, b) => b.pts - a.pts).slice(0, 5); });

function Card({ eyebrow, title, accent, children, right }) {
  return (
    <section className="rounded-2xl border p-5 flex flex-col gap-4" style={{ background: T.card, borderColor: T.line }}>
      <header className="flex items-end justify-between">
        <div>
          <div className="font-bold uppercase" style={{ color: accent, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.14em" }}>{eyebrow}</div>
          <h2 className="mt-1 font-bold" style={{ fontFamily: FB, fontSize: 22, color: T.text }}>{title}</h2>
        </div>
        {right}
      </header>
      <div className="flex-1 flex flex-col gap-2.5">{children}</div>
    </section>
  );
}
function SeasonBar({ goSquad, openSeason }) {
  const stats = [
    ["BANK", "£1.3", goSquad], ["TEAM VALUE", "£101.2", goSquad], ["FREE TRANSFERS", "2", goSquad],
    ["CHIPS · SET 1", "4/4 → GW19", goSquad], ["GW7 AVERAGE", "54", openSeason],
    ["OVERALL RANK", <>214,381 <span style={{ color: T.green, marginLeft: 4 }}>▲96k</span></>, openSeason],
  ];
  return (
    <div className="rounded-2xl border grid grid-cols-6 gap-2 p-2" style={{ background: T.card, borderColor: T.line }}>
      {stats.map(([label, value, onClick]) => (
        <button key={label} onClick={onClick} className="flex flex-col items-center gap-1.5 pt-2 pb-1 rounded-xl transition-transform active:scale-95">
          <div className="font-bold uppercase text-center leading-none" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.06em" }}>{label}</div>
          <div className="flex items-center justify-center rounded-lg w-full leading-none whitespace-nowrap"
            style={{ background: T.bgRaise, height: 38, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 16 }}>{value}</div>
        </button>
      ))}
    </div>
  );
}
function Trending({ openProfile }) {
  const max = 17;
  return (
    <Card eyebrow="Trending players" title="Back-to-back form" accent={T.green}>
      {TRENDING.map((p) => {
        const tot = p.last3.reduce((a, b) => a + b, 0);
        return (
          <button key={p.n} onClick={() => openProfile(p.n)} className="flex items-center gap-3.5 rounded-xl px-3.5 text-left transition-transform active:scale-[0.99]"
            style={{ background: T.bgRaise, height: 62 }}>
            <Kit team={p.team} size={26} />
            <div className="w-36">
              <div className="font-bold leading-none" style={{ color: T.text, fontFamily: FB, fontSize: 16 }}>{p.n}</div>
              <div className="mt-1.5 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{p.team} · {p.pos} · £{p.price.toFixed(1)}</div>
            </div>
            <div className="flex items-end gap-1.5" style={{ height: 48 }}>
              {p.last3.map((v, i) => (
                <div key={i} className="flex flex-col items-center justify-end gap-1" style={{ width: 20, height: 48 }}>
                  <span className="leading-none font-bold" style={{ color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{v}</span>
                  <div className="rounded-sm w-full" style={{ height: Math.max(10, (v / max) * 30), background: barColor(v) }} />
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg" style={{ background: "#0D0014", width: 52, height: 46, fontFamily: FN }}>
              <span className="font-bold leading-none" style={{ color: T.green, fontSize: 15, fontWeight: FNW }}>{tot}</span>
              <span className="mt-1 font-bold leading-none" style={{ color: T.faint, fontSize: 12, fontWeight: FNW }}>3GW</span>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1" style={{ fontFamily: FN }}>
              <div className="font-bold uppercase" style={{ color: T.faint, fontSize: 12, fontWeight: FNW, letterSpacing: "0.1em" }}>Next</div>
              <div className="flex items-center justify-center rounded-lg px-2.5 font-bold leading-none" style={{ background: "#0D0014", height: 30, color: "#FFFFFF", fontSize: 12.5, fontWeight: FNW }}>
                {nextLabel(p.team)} ·<span style={{ color: T.green, marginLeft: 5 }}>xP {p.xp.toFixed(1)}</span>
              </div>
            </div>
          </button>
        );
      })}
    </Card>
  );
}
function PitchPlayer({ p, out, liveMode }) {
  const played = liveMode ? LIVE.played[p.n] !== undefined : true;
  const raw = liveMode ? (played ? LIVE.played[p.n] : null) : p.pts;
  const disp = p.c && raw !== null ? raw * 2 : raw;
  const captain = p.c && !out;
  return (
    <div className="flex flex-col items-center" style={{ width: 64, opacity: out ? 0.35 : 1 }}>
      <Kit team={p.team} size={30} captain={p.c} />
      <div className="mt-1 truncate w-full text-center font-bold leading-tight" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 12, textShadow: SHADOW }}>{p.n}</div>
      {captain ? (
        <div className="rounded px-1.5 font-bold leading-none flex items-center justify-center gap-0.5"
          style={{ background: T.cap, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 13, height: 20 }}>
          {disp === null ? "–" : disp}<span style={{ fontSize: 12, marginLeft: 2 }}>×2</span>
        </div>
      ) : (
        <div className="font-bold leading-none" style={{ color: out || disp === null ? "rgba(255,255,255,0.55)" : "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 13, textShadow: SHADOW }}>
          {out ? "0′" : disp === null ? "–" : disp}
        </div>
      )}
    </div>
  );
}
function MyTeam({ live, setLive, openSeason }) {
  const { subs, actual, subbedOut } = useMemo(() => applyAutosubs(XI, BENCH), []);
  const shownActual = live ? LIVE.score : actual;
  const shownProj = live ? LIVE.projected : PROJECTED;
  const delta = shownActual - shownProj;
  const rows = ["FWD", "MID", "DEF", "GK"].map((pos) => XI.filter((p) => p.pos === pos));
  const toPlay = XI.length - Object.keys(LIVE.played).length;
  return (
    <Card eyebrow={live ? "My team · GW8 live" : "My team · GW7 final"} title="Projected vs actual" accent={T.green}
      right={
        <div className="flex gap-1.5">
          {["FINAL", "LIVE"].map((m) => (
            <button key={m} onClick={() => setLive(m === "LIVE")} className="px-3 h-8 rounded-full font-bold"
              style={{ background: (m === "LIVE") === live ? T.green : T.bgRaise, color: (m === "LIVE") === live ? "#04130A" : T.dim, border: `1px solid ${(m === "LIVE") === live ? T.green : T.line}`, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
              {m}
            </button>
          ))}
        </div>
      }>
      <button onClick={openSeason} className="flex items-end justify-center gap-5 pb-1 transition-transform active:scale-[0.99]">
        <div className="text-center">
          <div className="uppercase font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.14em" }}>Projected</div>
          <div className="leading-none mt-1" style={{ ...D, color: T.dim, fontSize: 46 }}>{shownProj}</div>
        </div>
        <div className="pb-2 text-xl leading-none" style={{ color: T.faint }}>→</div>
        <div className="text-center">
          <div className="uppercase font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.14em" }}>{live ? "Live" : "Actual"}</div>
          <div className="leading-none mt-1" style={{ ...D, color: T.green, fontSize: 46 }}>{shownActual}</div>
        </div>
        {live ? (
          <div className="mb-1.5 flex items-center justify-center rounded-full font-bold leading-none"
            style={{ background: T.bgRaise, color: "#FFFFFF", border: `1px solid ${T.line}`, fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 26, padding: "0 10px" }}>
            {toPlay} TO PLAY
          </div>
        ) : (
          <div className="mb-1.5 flex items-center justify-center rounded-full font-bold leading-none"
            style={{ background: delta >= 0 ? "#06331D" : "#3A0217", color: delta >= 0 ? T.green : T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 14, height: 26, minWidth: 44, padding: "0 9px" }}>
            {delta >= 0 ? `+${delta}` : delta}
          </div>
        )}
      </button>
      <div className="rounded-xl px-2 pt-3 pb-2.5 flex flex-col gap-2 overflow-hidden" style={{ background: GRASS }}>
        <div className="relative flex flex-col gap-2 pb-1 overflow-hidden">
          <div className="absolute rounded-full" style={{ top: -46, left: "50%", transform: "translateX(-50%)", width: 130, height: 92, border: "2px solid rgba(255,255,255,0.22)" }} />
          <div className="absolute" style={{ bottom: 0, left: "50%", transform: "translateX(-50%)", width: 210, height: 42, border: "2px solid rgba(255,255,255,0.22)", borderBottom: "none" }} />
          <div className="absolute" style={{ bottom: 0, left: "50%", transform: "translateX(-50%)", width: 92, height: 18, border: "2px solid rgba(255,255,255,0.22)", borderBottom: "none" }} />
          {rows.map((row, i) => (
            <div key={i} className="flex justify-center gap-2 relative">
              {row.map((p) => <PitchPlayer key={p.n} p={p} out={!live && subbedOut.has(p.n)} liveMode={live} />)}
            </div>
          ))}
        </div>
        <div className="mt-1 px-2.5 py-2 flex items-center gap-2.5 rounded-lg flex-wrap" style={{ background: "rgba(5,0,10,0.94)" }}>
          <span className="font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>Bench</span>
          {BENCH.map((b, i) => {
            const isIn = !live && subs.some((s) => s.in === b.n);
            return (
              <div key={b.n} className="flex items-center gap-2 rounded-lg px-2.5" style={{ height: 34, background: isIn ? "#06331D" : "rgba(255,255,255,0.05)", border: `1px solid ${isIn ? T.green : "rgba(255,255,255,0.18)"}` }}>
                <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{b.pos === "GK" ? "GK" : i}</span>
                <Kit team={b.team} size={17} />
                <span className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 13 }}>{b.n}</span>
                <span className="font-bold" style={{ color: isIn ? T.green : T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>{live ? "–" : b.pts}</span>
              </div>
            );
          })}
          {!live && subs.map((s) => (
            <span key={s.in} className="ml-auto font-bold" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
              AUTO-SUB {s.in} ▸ {s.out} 0′
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
function SeasonModal({ onClose }) {
  const totP = SEASON.reduce((s, [, p]) => s + p, 0);
  const totA = SEASON.reduce((s, [, , a]) => s + a, 0);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(6,0,10,0.7)" }} onClick={onClose}>
      <div className="rounded-2xl border p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}
        style={{ background: T.bgRaise, borderColor: T.line, width: 560 }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.12em" }}>My team · Season</div>
            <div className="mt-1 font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 20 }}>Predicted vs actual, every GW</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: T.line }}><X size={16} color={T.dim} /></button>
        </div>
        <div className="grid grid-cols-4 gap-2 px-3 font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          <span>GW</span><span className="text-right">Predicted</span><span className="text-right">Actual</span><span className="text-right">Δ</span>
        </div>
        {SEASON.map(([gw, p, a]) => (
          <div key={gw} className="grid grid-cols-4 gap-2 items-center rounded-lg px-3" style={{ background: gw % 2 ? T.card : "transparent", height: 36, fontFamily: FN, fontWeight: FNW }}>
            <span className="font-bold" style={{ color: "#FFFFFF", fontSize: 14 }}>{gw}</span>
            <span className="text-right font-bold" style={{ color: T.dim, fontSize: 14 }}>{p}</span>
            <span className="text-right font-bold" style={{ color: "#FFFFFF", fontSize: 14 }}>{a}</span>
            <span className="text-right font-bold" style={{ color: a - p >= 0 ? T.green : T.pink, fontSize: 14 }}>{a - p >= 0 ? `+${a - p}` : a - p}</span>
          </div>
        ))}
        <div className="grid grid-cols-4 gap-2 items-center rounded-lg px-3 border" style={{ borderColor: T.line, height: 40, fontFamily: FN, fontWeight: FNW }}>
          <span className="font-bold" style={{ color: "#FFFFFF", fontSize: 14 }}>TOTAL</span>
          <span className="text-right font-bold" style={{ color: T.dim, fontSize: 14 }}>{totP}</span>
          <span className="text-right font-bold" style={{ color: "#FFFFFF", fontSize: 14 }}>{totA}</span>
          <span className="text-right font-bold" style={{ color: T.green, fontSize: 14 }}>+{totA - totP}</span>
        </div>
        <div className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
          OVERALL RANK 214,381 <span style={{ color: T.green }}>▲96k</span> · #1 PACE LINE: 41K AHEAD NEEDED BY GW19 GATE
        </div>
      </div>
    </div>
  );
}
function Swings({ goClub }) {
  return (
    <Card eyebrow="Fixture swings" title="Runs opening up" accent={T.pink}>
      {SWINGS.map((s) => {
        const easing = s.dir === "EASING";
        return (
          <button key={s.team} onClick={() => goClub(s.team)} className="flex items-center gap-3.5 rounded-xl px-3.5 text-left transition-transform active:scale-[0.99]" style={{ background: T.bgRaise, height: 60 }}>
            <span className="w-14 leading-none" style={{ ...D, color: T.text, fontSize: 16 }}>{s.team}</span>
            <span className="flex items-center justify-center gap-1 font-bold rounded-full leading-none"
              style={{ background: easing ? "#06331D" : "#3A0217", color: easing ? T.green : T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 26, padding: "0 10px" }}>
              {easing ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {s.dir}
            </span>
            <div className="flex gap-1.5">
              {s.next.map((f, i) => (
                <span key={i} className="flex items-center justify-center font-bold rounded leading-none"
                  style={{ background: fdrBg(f.fdr), color: f.fdr <= 2 ? "#04130A" : "#FFF", fontFamily: FN, fontWeight: FNW, fontSize: 13, height: 26, minWidth: 38 }}>
                  {f.home ? f.op : f.op.toLowerCase()}
                </span>
              ))}
            </div>
            <div className="ml-auto flex flex-col items-end gap-1">
              <div className="flex items-center justify-center rounded-lg px-2.5 font-bold leading-none"
                style={{ background: "#0D0014", height: 30, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>
                {s.from.toFixed(1)} →<span style={{ color: easing ? T.green : T.pink, marginLeft: 5 }}>{s.to.toFixed(1)}</span>
              </div>
              <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
                OWN <span style={{ color: s.own === "—" ? T.faint : "#FFFFFF" }}>{s.own}</span>
              </div>
            </div>
          </button>
        );
      })}
    </Card>
  );
}
function DbPreview({ goPlayers, openProfile }) {
  const [pos, setPos] = useState("ALL");
  return (
    <Card eyebrow="Players" title="Top scorers" accent={T.cyan}
      right={
        <button onClick={goPlayers} className="flex items-center gap-1 font-bold rounded-full px-4 h-9"
          style={{ color: T.cyan, background: T.bgRaise, fontFamily: FB, fontSize: 13 }}>
          OPEN PLAYERS <ChevronRight size={14} />
        </button>
      }>
      <div className="flex gap-2">
        {Object.keys(DBPREV).map((k) => (
          <button key={k} onClick={() => setPos(k)} className="px-4 h-8 rounded-full font-bold transition-transform active:scale-95"
            style={{ background: pos === k ? T.green : T.bgRaise, color: pos === k ? "#04130A" : T.dim, border: `1px solid ${pos === k ? T.green : T.line}`, fontFamily: FB, fontSize: 12.5 }}>
            {k}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="items-center px-2 uppercase font-bold" style={{ display: "grid", gridTemplateColumns: "1fr 64px 56px 56px 64px", gap: 6, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.06em" }}>
          <span>Player</span><span className="text-center">GW8 xP</span><span className="text-center">Pts</span><span className="text-center">£m</span><span className="text-center">Pts/£</span>
        </div>
        {DBPREV[pos].map((p) => (
          <button key={p.n} onClick={() => openProfile(p.n)} className="items-center rounded-xl px-2 text-left transition-transform active:scale-[0.995]"
            style={{ display: "grid", gridTemplateColumns: "1fr 64px 56px 56px 64px", gap: 6, background: T.bgRaise, height: 44 }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <Kit team={p.team} size={19} />
              <span className="font-bold truncate" style={{ color: T.text, fontFamily: FB, fontSize: 15 }}>{p.n}</span>
              <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team}</span>
            </div>
            {[[p.xp.toFixed(1), T.green], [p.pts, "#FFFFFF"], [p.price.toFixed(1), T.dim], [(p.pts / p.price).toFixed(1), T.dim]].map(([v, c], i) => (
              <div key={i} className="flex items-center justify-center rounded-lg font-bold leading-none"
                style={{ background: "#0D0014", height: 30, color: c, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>{v}</div>
            ))}
          </button>
        ))}
      </div>
    </Card>
  );
}
function DashboardPage({ go, openSeason, openProfile, live, setLive, goClub }) {
  return (
    <div className="flex flex-col gap-4">
      <SeasonBar goSquad={() => go("Squad")} openSeason={openSeason} />
      <div className="grid grid-cols-2 gap-4">
        <Trending openProfile={openProfile} />
        <MyTeam live={live} setLive={setLive} openSeason={openSeason} />
        <Swings goClub={goClub} />
        <DbPreview goPlayers={() => go("Players")} openProfile={openProfile} />
      </div>
    </div>
  );
}

/* ═════════ BUILDER ═════════ */
const CLUBS = ["ALL", ...ORDER.slice().sort()];
const PRICES = ["ALL", 5.0, 6.0, 7.5, 9.0, 11.0];
const SORTS = ["xP", "PRICE", "VALUE", "NAME"];
const DEFAULT_F = { club: "ALL", maxP: "ALL", sort: "xP", hideRisk: false, hideOwned: false };
function filterPlayers(pos, f, squad, q = "") {
  let l = POOL[pos].slice();
  if (q) l = l.filter((p) => (p.n + " " + p.team).toLowerCase().includes(q.toLowerCase()));
  if (f.club !== "ALL") l = l.filter((p) => p.team === f.club);
  if (f.maxP !== "ALL") l = l.filter((p) => p.price <= +f.maxP);
  if (f.hideRisk) l = l.filter((p) => !p.risk);
  if (f.hideOwned) l = l.filter((p) => !squad.some((x) => x.n === p.n));
  const by = { "xP": (a, b) => b.xp - a.xp, "PRICE": (a, b) => a.price - b.price, "VALUE": (a, b) => b.val - a.val, "NAME": (a, b) => a.n.localeCompare(b.n) }[f.sort];
  return l.sort(by);
}
function FilterBar({ f, setF }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Sel label="Club" value={f.club} options={CLUBS} onChange={(v) => setF({ ...f, club: v })} />
      <Sel label="Max £" value={f.maxP} options={PRICES} onChange={(v) => setF({ ...f, maxP: v })} />
      <Sel label="Sort" value={f.sort} options={SORTS} onChange={(v) => setF({ ...f, sort: v })} />
      <Toggle on={f.hideRisk} onClick={() => setF({ ...f, hideRisk: !f.hideRisk })}>HIDE FLAGGED</Toggle>
      <Toggle on={f.hideOwned} onClick={() => setF({ ...f, hideOwned: !f.hideOwned })}>HIDE IN SQUAD</Toggle>
    </div>
  );
}
function PlayerRowB({ p, squad, addP }) {
  const added = squad.some((x) => x.n === p.n);
  const full = posCount(squad, p.pos) >= LIMITS[p.pos];
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3 shrink-0" style={{ background: T.card, height: 54, opacity: full && !added ? 0.45 : 1 }}>
      <Kit team={p.team} size={22} />
      <div className="flex-1 min-w-0">
        <div className="font-bold leading-none truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15 }}>{p.n}</div>
        <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team} · £{p.price.toFixed(1)}</div>
      </div>
      <Plate w={74}>{nextLabel(p.team)}</Plate>
      <Plate w={58} color={T.green}>xP {p.xp.toFixed(1)}</Plate>
      <span className="rounded-lg px-2 flex items-center font-bold" style={{ background: T.value, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 30 }}>
        VAL {p.val.toFixed(1)}
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
function PlayerModal({ pos, squad, addP, onClose }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState({ ...DEFAULT_F, hideOwned: true });
  const list = filterPlayers(pos, f, squad, q);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(6,0,10,0.7)" }} onClick={onClose}>
      <div className="rounded-2xl border flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ background: T.bgRaise, borderColor: T.line, width: 680, maxHeight: "80vh" }}>
        <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: T.line }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>Add {pos}</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
              {posCount(squad, pos)}/{LIMITS[pos]} PICKED · £{(BUDGET - squad.reduce((s, p) => s + p.price, 0)).toFixed(1)} LEFT
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: T.line }}><X size={16} color={T.dim} /></button>
        </header>
        <div className="px-5 pt-4 pb-3 border-b flex flex-col gap-2.5" style={{ borderColor: T.line }}>
          <div className="flex items-center gap-2.5 rounded-xl px-3.5" style={{ background: T.card, border: `1px solid ${T.line}`, height: 42 }}>
            <Search size={15} color={T.dim} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or club…"
              className="flex-1 bg-transparent outline-none font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15 }} />
          </div>
          <FilterBar f={f} setF={setF} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
          {list.map((p) => <PlayerRowB key={p.n} p={p} squad={squad} addP={(x) => { addP(x); }} />)}
          {list.length === 0 && <div className="py-8 text-center font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 15 }}>No players match.</div>}
        </div>
      </div>
    </div>
  );
}
function BSlot({ p, pos, captainN, viceN, onEmpty, onMenu, dragRef, onSwap }) {
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
function splitXI(squad, struct) {
  const xi = [], bench = [];
  const plan = { GK: 1, ...struct.xi };
  ["GK", "DEF", "MID", "FWD"].forEach((pos) => {
    const ps = squad.filter((p) => p.pos === pos);
    xi.push({ pos, slots: plan[pos], players: ps.slice(0, plan[pos]) });
    bench.push(...ps.slice(plan[pos]));
  });
  return { xi, bench };
}
function BPitch({ squad, struct, captainN, viceN, openModal, openMenu, onSwap }) {
  const dragRef = useRef(null);
  const { xi, bench } = splitXI(squad, struct);
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
              <BSlot key={pos + i} p={players[i]} pos={pos} captainN={captainN} viceN={viceN}
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
function BMenu({ p, captainN, viceN, setCap, setVice, removeP, onClose }) {
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
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{p.team} · {p.pos} · £{p.price.toFixed(1)} · NEXT {nextLabel(p.team)}</div>
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
function FeedbackPanel({ squad, H, setH, captainN }) {
  const e = evaluate(squad, H, captainN);
  const posSpend = Object.entries(e.spend);
  const maxSpend = Math.max(1, ...posSpend.map(([, v]) => v));
  return (
    <aside className="flex flex-col gap-3 rounded-2xl border p-4" style={{ background: T.card, borderColor: T.line, width: 320 }}>
      <div>
        <div className="flex items-center justify-between">
          <Label color={T.green}>① Projected</Label>
          <Plate h={28} bg={T.bgRaise}>{squad.length}/15 · £{e.bank.toFixed(1)}</Plate>
        </div>
        <div className="flex items-end gap-2 mt-1.5">
          <span className="leading-none" style={{ ...D, color: T.green, fontSize: 40 }}>{squad.length ? e.proj : "—"}</span>
          <span className="pb-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>xP · {H} GW{H > 1 ? "S" : ""}</span>
        </div>
        <input type="range" min={1} max={12} value={H} onChange={(ev) => setH(+ev.target.value)} className="w-full mt-2" style={{ accentColor: T.green }} />
        <div className="flex justify-between font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}><span>1 GW</span><span>12 GWS</span></div>
      </div>
      <div className="border-t pt-3" style={{ borderColor: T.line }}>
        <div className="flex items-center justify-between">
          <Label>② Captaincy</Label>
          {e.cap && <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: e.capMode === "SET" ? T.cap : T.bgRaise, color: e.capMode === "SET" ? "#FFFFFF" : T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{e.capMode}</span>}
        </div>
        {e.cap ? (
          <div className="flex items-center gap-2.5 mt-2">
            <Kit team={e.cap.team} size={22} captain />
            <span className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15 }}>{e.cap.n}</span>
            <span className="ml-auto font-bold" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>{e.capLabel} · P(12+) {e.capP}%</span>
          </div>
        ) : <div className="mt-2 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>—</div>}
      </div>
      <div className="border-t pt-3" style={{ borderColor: T.line }}>
        <Label color={T.pink}>③ Risk flags</Label>
        {e.risks.length === 0 ? (
          <div className="mt-2 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>—</div>
        ) : e.risks.map((p) => (
          <div key={p.n} className="flex items-center gap-2 mt-2">
            <span className="font-bold" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>⚑</span>
            <span className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 13.5 }}>{p.n}</span>
            <span className="font-semibold truncate" style={{ color: T.dim, fontFamily: FB, fontSize: 12.5 }}>{p.risk}</span>
          </div>
        ))}
      </div>
      <div className="border-t pt-3" style={{ borderColor: T.line }}>
        <Label>④ Spend & bench</Label>
        <div className="flex flex-col gap-1.5 mt-2">
          {posSpend.map(([pos, v]) => (
            <div key={pos} className="flex items-center gap-2">
              <span className="w-9 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{pos}</span>
              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 7, background: "#2A0B3D" }}>
                <div style={{ height: 7, width: `${(v / maxSpend) * 100}%`, background: T.green, opacity: 0.85 }} />
              </div>
              <span className="w-12 text-right font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>£{v.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>BENCH QUALITY</span>
          <Plate h={28} w={56} bg={T.bgRaise} color={T.green}>{squad.length === 15 ? e.bench.toFixed(1) : "—"}</Plate>
        </div>
      </div>
    </aside>
  );
}
function autoComplete(squad, struct) {
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

/* ═════════ SQUAD ═════════ */
const START_SQUAD = MY_NAMES.map((n) => byName(n));
const XI_PLAN = { GK: 1, DEF: 3, MID: 5, FWD: 2 };
const START_BANK = 1.3;
const FT = 2;
function SeasonStrip({ openSeason, bank }) {
  const vals = SEASON.map(([gw, , a]) => [gw, a]);
  const max = Math.max(...vals.map(([, v]) => v));
  const tot = vals.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="rounded-2xl border p-4 flex items-end gap-4" style={{ background: T.card, borderColor: T.line }}>
      <div className="flex flex-col gap-1.5">
        <Label color={T.green}>Season · actual by GW</Label>
        <div className="flex items-end gap-2.5" style={{ height: 64 }}>
          {vals.map(([gw, v]) => (
            <div key={gw} className="flex flex-col items-center justify-end gap-1" style={{ width: 26, height: 64 }}>
              <span className="leading-none font-bold" style={{ color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{v}</span>
              <div className="rounded-sm w-full" style={{ height: Math.max(10, ((v - 40) / (max - 40)) * 34), background: teamBand(v) }} />
              <span className="leading-none font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{gw}</span>
            </div>
          ))}
        </div>
      </div>
      <button onClick={openSeason} className="ml-auto flex items-center gap-2 pb-1 transition-transform active:scale-95">
        <div className="flex flex-col items-center gap-1"><Label>Total</Label><Plate h={34} w={64} bg={T.bgRaise}>{tot}</Plate></div>
        <div className="flex flex-col items-center gap-1"><Label>Rank</Label><Plate h={34} w={120} bg={T.bgRaise}>214,381 <span style={{ color: T.green, marginLeft: 4 }}>▲96k</span></Plate></div>
        <div className="flex flex-col items-center gap-1"><Label>Bank</Label><Plate h={34} w={64} bg={T.bgRaise}>£{bank.toFixed(1)}</Plate></div>
      </button>
    </div>
  );
}
function SPitchSlot({ p, captain, vice, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center transition-transform active:scale-95" style={{ width: 70 }}>
      <Kit team={p.team} size={38} captain={captain} vice={vice} />
      <div className="mt-1 rounded px-1.5 py-0.5 w-full text-center truncate font-bold leading-tight" style={{ background: "rgba(6,0,12,0.78)", color: "#FFFFFF", fontFamily: FB, fontSize: 13 }}>{p.n}</div>
      <div className="rounded-b px-1.5 pb-0.5 w-full text-center font-bold leading-tight flex items-center justify-center gap-1"
        style={{ background: "rgba(6,0,12,0.78)", color: "rgba(255,255,255,0.85)", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
        xP {p.xp.toFixed(1)}{p.risk && <span style={{ color: T.pink }}>⚑</span>}
      </div>
    </button>
  );
}
function SPitch({ squad, captainN, viceN, openMenu }) {
  const xi = []; const benchList = [];
  ["GK", "DEF", "MID", "FWD"].forEach((pos) => {
    const players = squad.filter((p) => p.pos === pos);
    xi.push({ pos, players: players.slice(0, XI_PLAN[pos]) });
    benchList.push(...players.slice(XI_PLAN[pos]));
  });
  const rows = [...xi].reverse();
  return (
    <div className="rounded-2xl overflow-hidden px-4 pt-5 pb-4 flex flex-col gap-3" style={{ background: GRASS, border: `1px solid ${T.line}` }}>
      <div className="relative flex flex-col gap-4 pb-2 overflow-hidden">
        <div className="absolute rounded-full" style={{ top: -60, left: "50%", transform: "translateX(-50%)", width: 170, height: 120, border: "2px solid rgba(255,255,255,0.25)" }} />
        <div className="absolute" style={{ bottom: 0, left: "50%", transform: "translateX(-50%)", width: 280, height: 52, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        <div className="absolute" style={{ bottom: 0, left: "50%", transform: "translateX(-50%)", width: 120, height: 22, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        {rows.map(({ pos, players }) => (
          <div key={pos} className="flex justify-center gap-3 relative">
            {players.map((p) => <SPitchSlot key={p.n} p={p} captain={captainN === p.n} vice={viceN === p.n} onClick={() => openMenu(p, false)} />)}
          </div>
        ))}
      </div>
      <div className="rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap" style={{ background: "rgba(5,0,10,0.94)" }}>
        <Label>Bench</Label>
        {benchList.map((p, i) => (
          <button key={p.n} onClick={() => openMenu(p, true)} className="flex items-center gap-2 rounded-lg px-2.5 h-9 border"
            style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.2)" }}>
            <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.pos === "GK" ? "GK" : i}</span>
            <Kit team={p.team} size={17} />
            <span className="font-bold truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 13.5, maxWidth: 92 }}>{p.n}</span>
            <span className="font-bold" style={{ color: "rgba(255,255,255,0.85)", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.xp.toFixed(1)}</span>
          </button>
        ))}
        <span className="ml-auto font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>CLICK A SHIRT TO ACT</span>
      </div>
    </div>
  );
}
function SMenu({ p, isBench, captainN, viceN, setCap, setVice, startReplace, onClose }) {
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
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{p.team} · {p.pos} · £{p.price.toFixed(1)} · NEXT {nextLabel(p.team)}</div>
            {p.risk && <div className="mt-1 font-bold" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>⚑ {p.risk}</div>}
          </div>
        </div>
        {!isBench && (captainN === p.n
          ? <Btn onClick={() => { setCap(null); onClose(); }}>Remove captaincy</Btn>
          : <Btn onClick={() => { setCap(p.n); onClose(); }}>Make captain <span style={{ color: T.green }}>C</span></Btn>)}
        {!isBench && (viceN === p.n
          ? <Btn onClick={() => { setVice(null); onClose(); }}>Remove vice</Btn>
          : <Btn onClick={() => { setVice(p.n); onClose(); }}>Make vice-captain <span style={{ color: T.dim }}>V</span></Btn>)}
        {isBench && <div className="font-bold px-1" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>CAPTAINCY IS XI ONLY</div>}
        <Btn accent={T.green} onClick={() => { startReplace(p); onClose(); }}>Sell & replace <ArrowRight size={14} style={{ display: "inline", marginLeft: 4 }} /></Btn>
      </div>
    </div>
  );
}
function ReplaceModal({ out, squad, bank, doReplace, onClose }) {
  const [q, setQ] = useState("");
  const budget = bank + out.price;
  const list = POOL[out.pos]
    .filter((p) => !squad.some((x) => x.n === p.n))
    .filter((p) => (p.n + " " + p.team).toLowerCase().includes(q.toLowerCase()))
    .map((p) => ({ ...p, d6: (p.xp - out.xp) * 6 }))
    .sort((a, b) => b.d6 - a.d6);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(6,0,10,0.7)" }} onClick={onClose}>
      <div className="rounded-2xl border flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ background: T.bgRaise, borderColor: T.line, width: 680, maxHeight: "80vh" }}>
        <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: T.line }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>Sell {out.n} · buy {out.pos}</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
              SELLS £{out.price.toFixed(1)} · BUDGET £{budget.toFixed(1)} · RANKED BY NET Δ OVER 6 GWS
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: T.line }}><X size={16} color={T.dim} /></button>
        </header>
        <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: T.line }}>
          <div className="flex items-center gap-2.5 rounded-xl px-3.5" style={{ background: T.card, border: `1px solid ${T.line}`, height: 42 }}>
            <Search size={15} color={T.dim} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or club…"
              className="flex-1 bg-transparent outline-none font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15 }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
          {list.map((p) => {
            const afford = p.price <= budget;
            const clubOk = p.team === out.team || clubCount(squad.filter((x) => x.n !== out.n), p.team) < 3;
            const ok = afford && clubOk;
            return (
              <div key={p.n} className="flex items-center gap-3 rounded-xl px-3 shrink-0" style={{ background: T.card, height: 54, opacity: ok ? 1 : 0.4 }}>
                <Kit team={p.team} size={22} />
                <div className="w-36">
                  <div className="font-bold leading-none truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15 }}>{p.n}</div>
                  <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team} · £{p.price.toFixed(1)}</div>
                </div>
                <Plate w={78}>{nextLabel(p.team)}</Plate>
                <Plate w={64} color={T.green}>xP {p.xp.toFixed(1)}</Plate>
                <Plate w={70} color={p.d6 >= 0 ? T.green : T.pink}>{p.d6 >= 0 ? "+" : ""}{p.d6.toFixed(1)} /6GW</Plate>
                <span className="rounded-lg px-2 flex items-center font-bold" style={{ background: T.value, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 30 }}>
                  VAL {p.val.toFixed(1)}
                </span>
                {p.risk && <span className="font-bold" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }} title={p.risk}>⚑</span>}
                <button disabled={!ok} onClick={() => doReplace(out, p)} className="ml-auto flex items-center gap-1 rounded-full px-3.5 h-8 font-bold"
                  style={{ background: ok ? T.green : T.bgRaise, color: ok ? "#04130A" : T.faint, border: ok ? "none" : `1px solid ${T.line}`, fontFamily: FB, fontSize: 12.5 }}>
                  SWAP IN
                </button>
              </div>
            );
          })}
          {list.length === 0 && <div className="py-8 text-center font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 15 }}>No players match.</div>}
        </div>
        <footer className="px-5 py-3 border-t font-bold" style={{ borderColor: T.line, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          INFORMATIONAL ONLY — TRANSFERS ARE MADE IN THE OFFICIAL FPL APP
        </footer>
      </div>
    </div>
  );
}
function Captaincy({ squad, captainN, setCap }) {
  const xiOnly = [];
  ["GK", "DEF", "MID", "FWD"].forEach((pos) => { xiOnly.push(...squad.filter((p) => p.pos === pos).slice(0, XI_PLAN[pos])); });
  const opts = [...xiOnly].sort((a, b) => b.xp - a.xp).slice(0, 4).map((p) => ({
    ...p, e2: p.xp * 2, p12: Math.min(45, Math.round(p.xp * 5.3)),
    eo: { Haaland: 82, Saka: 44, Mbeumo: 28, Gabriel: 31 }[p.n] ?? Math.round(p.xp * 3),
  }));
  const maxE2 = Math.max(...opts.map((o) => o.e2));
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: T.card, borderColor: T.line }}>
      <Label color={T.green}>Captaincy · GW8</Label>
      {opts.map((o) => {
        const isC = captainN === o.n;
        return (
          <button key={o.n} onClick={() => setCap(o.n)} className="flex items-center gap-2.5 rounded-xl px-2.5 text-left"
            style={{ background: T.bgRaise, height: 56, border: `1px solid ${isC ? T.cap : "transparent"}` }}>
            <Kit team={o.team} size={22} captain={isC} />
            <div className="w-20">
              <div className="font-bold leading-none truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14 }}>{o.n}</div>
              <div className="mt-1 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>EO {o.eo}%</div>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <div className="rounded-full overflow-hidden" style={{ height: 7, background: "#2A0B3D" }}>
                <div style={{ height: 7, width: `${(o.e2 / maxE2) * 100}%`, background: isC ? T.cap : T.green, opacity: 0.9 }} />
              </div>
              <div className="flex justify-between font-bold" style={{ fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
                <span style={{ color: T.dim }}>E×2 {o.e2.toFixed(1)}</span>
                <span style={{ color: T.faint }}>P(12+) {o.p12}%</span>
              </div>
            </div>
          </button>
        );
      })}
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>CLICK TO SET CAPTAIN · PINK = CURRENT · XI ONLY</div>
    </div>
  );
}
function TransferPlan({ transfers, bank, undo, reset }) {
  const hits = Math.max(0, transfers.length - FT) * 4;
  const net6 = transfers.reduce((s, t) => s + (t.inP.xp - t.outP.xp) * 6, 0);
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: T.card, borderColor: T.line }}>
      <div className="flex items-center justify-between">
        <Label color={T.green}>Transfer plan</Label>
        {transfers.length > 0 && (
          <button onClick={reset} className="flex items-center gap-1 font-bold rounded-full px-2.5 h-7 border"
            style={{ borderColor: T.line, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
            <RotateCcw size={11} /> RESET
          </button>
        )}
      </div>
      {transfers.length === 0 ? (
        <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 14 }}>—</div>
      ) : transfers.map((t) => (
        <button key={t.inP.n} onClick={() => undo(t)} className="flex items-center gap-2 rounded-xl px-2.5 text-left" style={{ background: T.bgRaise, height: 44 }}>
          <span className="font-bold truncate" style={{ color: T.dim, fontFamily: FB, fontSize: 13.5, width: 82 }}>{t.outP.n}</span>
          <ArrowRight size={13} color={T.faint} />
          <span className="font-bold truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 13.5, flex: 1 }}>{t.inP.n}</span>
          <Plate w={58} color={(t.inP.xp - t.outP.xp) >= 0 ? T.green : T.pink}>
            {(t.inP.xp - t.outP.xp) >= 0 ? "+" : ""}{((t.inP.xp - t.outP.xp) * 6).toFixed(1)}
          </Plate>
        </button>
      ))}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="flex flex-col items-center gap-1"><Label>FT used</Label><Plate h={30} w={54} bg={T.bgRaise}>{Math.min(transfers.length, FT)}/{FT}</Plate></div>
        <div className="flex flex-col items-center gap-1"><Label>Hits</Label><Plate h={30} w={54} bg={T.bgRaise} color={hits ? T.pink : "#FFFFFF"}>{hits ? `-${hits}` : "0"}</Plate></div>
        <div className="flex flex-col items-center gap-1"><Label>Net Δ6</Label><Plate h={30} w={54} bg={T.bgRaise} color={net6 - hits >= 0 ? T.green : T.pink}>{(net6 - hits) >= 0 ? "+" : ""}{(net6 - hits).toFixed(1)}</Plate></div>
      </div>
      <div className="flex flex-col items-center gap-1"><Label>Bank after</Label><Plate h={30} w={80} bg={T.bgRaise}>£{bank.toFixed(1)}</Plate></div>
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
        INFORMATIONAL — ACT IN THE OFFICIAL APP · CLICK A ROW TO UNDO
      </div>
    </div>
  );
}
function ChipsCard() {
  const chips = ["WILDCARD", "FREE HIT", "TRIPLE CAPTAIN", "BENCH BOOST"];
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: T.card, borderColor: T.line }}>
      <Label color={T.green}>Chips</Label>
      <div className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>SET 1 · ALL FOUR PLAYED</div>
      <div className="grid grid-cols-2 gap-2">
        {chips.map((c) => (
          <div key={c} className="flex items-center gap-2 rounded-xl px-3" style={{ background: T.bgRaise, height: 40, opacity: 0.7 }}>
            <Lock size={13} color={T.faint} />
            <span className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{c}²</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>SET 2 UNLOCKS</span>
        <Plate h={30} w={70} bg={T.bgRaise} color={T.green}>GW19</Plate>
      </div>
    </div>
  );
}

/* ═════════ BUILDER + SQUAD PAGE ASSEMBLIES ═════════ */
function Drafts({ drafts, setDrafts, por, setPor, loadDraft, toast }) {
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: T.card, borderColor: T.line }}>
      <Label color={T.green}>Saved drafts</Label>
      {drafts.length === 0 && (
        <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 14.5, lineHeight: 1.55 }}>
          Nothing saved yet — build a squad and press SAVE AS DRAFT. Model variants (pure / moderate / spicy) land automatically with ticket B-16.
        </p>
      )}
      {drafts.map((d) => (
        <div key={d.id} className="rounded-xl px-3.5 py-3 flex items-center gap-3" style={{ background: T.bgRaise, border: `1px solid ${por === d.id ? T.green : "transparent"}` }}>
          <div className="w-40">
            <div className="font-bold leading-none truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15 }}>{d.name}</div>
            <div className="mt-1 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{d.struct} · {d.n}/15</div>
          </div>
          <Plate w={58} color={T.green}>{d.proj}</Plate>
          <Plate w={58}>£{d.bank}</Plate>
          <Plate w={70} color={T.dim}>{d.cap || "—"}</Plate>
          <Plate w={54} color={T.green}>{d.bench}</Plate>
          <div className="ml-auto flex items-center gap-1.5">
            {por === d.id
              ? <span className="flex items-center gap-1 rounded-full px-2.5 h-7 font-bold" style={{ background: "#06331D", color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}><Star size={11} /> PLAN</span>
              : <button onClick={() => { setPor(d.id); toast(`${d.name} set as plan of record`); }} className="rounded-full px-2.5 h-7 border font-bold" style={{ borderColor: T.line, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>SET PLAN</button>}
            <button onClick={() => loadDraft(d)} className="rounded-full px-2.5 h-7 font-bold" style={{ background: T.green, color: "#04130A", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>LOAD</button>
            <button onClick={() => { setDrafts(drafts.filter((x) => x.id !== d.id)); if (por === d.id) setPor(null); }} className="w-7 h-7 rounded-full border flex items-center justify-center" style={{ borderColor: T.line }}><Trash2 size={12} color={T.dim} /></button>
          </div>
        </div>
      ))}
      {drafts.length > 0 && (
        <div className="grid grid-cols-4 gap-2 px-1 font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          <span className="col-span-1" /><span>xP · £BANK</span><span>CAPTAIN</span><span>BENCH Q</span>
        </div>
      )}
    </div>
  );
}
function BuilderPage(props) {
  const { bTab, setBTab, squad, setSquad, structId, setStructId, cap, setCap, vice, setVice,
    modalPos, setModalPos, menuP, setMenuP, H, setH, drafts, setDrafts, por, setPor, toast } = props;
  const struct = STRUCTURES.find((s) => s.id === structId);
  const addP = (p) => {
    if (squad.some((x) => x.n === p.n)) return;
    if (posCount(squad, p.pos) >= LIMITS[p.pos]) { toast(`${p.pos} is full`); return; }
    if (clubCount(squad, p.team) >= 3) { toast(`Three ${p.team} players already — league limit`); return; }
    if (squad.reduce((s, x) => s + x.price, 0) + p.price > BUDGET) { toast("That breaks the £100.0 budget"); return; }
    setSquad([...squad, p]);
  };
  const removeP = (p) => {
    setSquad(squad.filter((x) => x.n !== p.n));
    if (cap === p.n) setCap(null);
    if (vice === p.n) setVice(null);
  };
  const onSwap = (nA, nB) => {
    const a = squad.findIndex((x) => x.n === nA), b = squad.findIndex((x) => x.n === nB);
    if (a < 0 || b < 0) return;
    if (squad[a].pos !== squad[b].pos) { toast("Same-position swaps only"); return; }
    const next = [...squad]; [next[a], next[b]] = [next[b], next[a]];
    setSquad(next);
  };
  const runAuto = () => {
    const next = autoComplete(squad, struct);
    setSquad(next);
    toast(next.length === 15 ? "Auto-completed — best xP within budget" : "Auto-complete could not fill every slot");
  };
  const saveDraft = () => {
    const e = evaluate(squad, H, cap);
    const d = { id: Date.now(), name: `Draft ${drafts.length + 1}`, struct: structId, n: squad.length, names: squad.map((p) => p.n), cap, vice, proj: squad.length ? e.proj : 0, bank: e.bank.toFixed(1), bench: squad.length === 15 ? e.bench.toFixed(1) : "—" };
    if (drafts.length >= 3) { toast("Three drafts max — delete one first"); return; }
    setDrafts([...drafts, d]);
    toast(`${d.name} saved`);
  };
  const loadDraft = (d) => {
    setSquad(d.names.map((n) => byName(n)));
    setStructId(d.struct); setCap(d.cap); setVice(d.vice); setBTab("BUILD");
    toast(`${d.name} loaded`);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {["BUILD", "DRAFTS"].map((t) => (
          <button key={t} onClick={() => setBTab(t)} className="px-5 h-10 rounded-full font-bold"
            style={{ background: bTab === t ? T.green : T.card, color: bTab === t ? "#04130A" : T.dim, border: `1px solid ${bTab === t ? T.green : T.line}`, fontFamily: FB, fontSize: 13.5 }}>
            {t}{t === "DRAFTS" ? ` · ${drafts.length}${por ? " ★" : ""}` : ""}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={runAuto} className="flex items-center gap-2 px-4 h-10 rounded-full font-bold" style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 13 }}>
            <Wand2 size={14} /> AUTO-COMPLETE
          </button>
          <button onClick={saveDraft} className="flex items-center gap-2 px-4 h-10 rounded-full font-bold border" style={{ background: T.card, color: T.green, borderColor: T.line, fontFamily: FB, fontSize: 13 }}>
            <Save size={14} /> SAVE AS DRAFT
          </button>
        </div>
      </div>
      {bTab === "DRAFTS" ? (
        <Drafts drafts={drafts} setDrafts={setDrafts} por={por} setPor={setPor} loadDraft={loadDraft} toast={toast} />
      ) : (
        <div className="flex gap-4 items-start">
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <div className="flex gap-1">
              {STRUCTURES.map((s) => (
                <button key={s.id} onClick={() => { setStructId(s.id); toast(`Structure ${s.id} — evidence ${s.ev.toFixed(1)}`); }}
                  className="relative flex items-center gap-1.5 px-2.5 h-9 rounded-lg border"
                  style={{ background: structId === s.id ? T.bgRaise : T.card, borderColor: structId === s.id ? T.green : T.line }}>
                  <span className="leading-none" style={{ ...D, color: "#FFFFFF", fontSize: 12.5 }}>{s.id}</span>
                  <span className="font-bold leading-none" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{s.ev.toFixed(1)}</span>
                  {s.ev === TOP_EV && (
                    <span className="absolute -top-2 -right-1.5 rounded-full px-1.5 flex items-center font-bold" style={{ background: T.cap, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 20 }}>TOP</span>
                  )}
                </button>
              ))}
            </div>
            <BPitch squad={squad} struct={struct} captainN={cap} viceN={vice}
              openModal={setModalPos} openMenu={setMenuP} onSwap={onSwap} />
          </div>
          <FeedbackPanel squad={squad} H={H} setH={setH} captainN={cap} />
        </div>
      )}
      {modalPos && <PlayerModal pos={modalPos} squad={squad} addP={addP} onClose={() => setModalPos(null)} />}
      {menuP && <BMenu p={menuP} captainN={cap} viceN={vice}
        setCap={(n) => { setCap(n); if (n && vice === n) setVice(null); if (n) toast(`${n} is captain`); }}
        setVice={(n) => { setVice(n); if (n && cap === n) setCap(null); if (n) toast(`${n} is vice-captain`); }}
        removeP={removeP} onClose={() => setMenuP(null)} />}
    </div>
  );
}
function SquadPage(props) {
  const { sTeam, transfers, sCap, sVice, setSCap, setSVice, sMenu, setSMenu, replaceOut, setReplaceOut,
    doReplace, undo, reset, bank, openSeason, toast } = props;
  return (
    <div className="flex gap-5 items-start">
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <SeasonStrip openSeason={openSeason} bank={bank} />
        <SPitch squad={sTeam} captainN={sCap} viceN={sVice} openMenu={(p, bench) => setSMenu({ player: p, bench })} />
      </div>
      <div className="flex flex-col gap-4" style={{ width: 340 }}>
        <Captaincy squad={sTeam} captainN={sCap} setCap={(n) => { setSCap(n); setSVice((v) => (v === n ? null : v)); if (n) toast(`${n} is captain`); }} />
        <TransferPlan transfers={transfers} bank={bank} undo={undo} reset={reset} />
        <ChipsCard />
      </div>
      {sMenu && <SMenu p={sMenu.player} isBench={sMenu.bench} captainN={sCap} viceN={sVice}
        setCap={(n) => { setSCap(n); setSVice((v) => (v === n ? null : v)); if (n) toast(`${n} is captain`); }}
        setVice={(n) => { setSVice(n); setSCap((c) => (c === n ? null : c)); if (n) toast(`${n} is vice-captain`); }}
        startReplace={setReplaceOut} onClose={() => setSMenu(null)} />}
      {replaceOut && <ReplaceModal out={replaceOut} squad={sTeam} bank={bank} doReplace={doReplace} onClose={() => setReplaceOut(null)} />}
    </div>
  );
}

/* ═════════ PLAYERS ═════════ */
const GRID = "minmax(180px,1fr) 76px 72px 60px 56px 44px 40px 40px 40px 52px 56px 64px";
const SORT_MAP = { Player: "NAME", Form: "FORM", "GW8 xP": "xP", Pts: "PTS", "Own%": "OWN%", Value: "VALUE" };
function HeaderRow({ sort, setSort }) {
  const cols = ["Player", "Next", "Form", "GW8 xP", "Price", "Apps", "G", "A", "CS", "Pts", "Own%", "Value"];
  return (
    <div className="items-center px-2 uppercase font-bold" style={{ display: "grid", gridTemplateColumns: GRID, gap: 6, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.04em", height: 28 }}>
      {cols.map((c, i) => {
        const sortable = c === "Price" || SORT_MAP[c];
        const active = sortable && (c === "Price" ? sort.startsWith("PRICE") : sort === SORT_MAP[c]);
        if (!sortable) return <span key={c} className="text-center">{c}</span>;
        return (
          <button key={c} className={i === 0 ? "text-left uppercase font-bold" : "text-center uppercase font-bold"}
            style={{ color: active ? T.green : T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.04em" }}
            onClick={() => setSort(c === "Price" ? (sort === "PRICE ↓" ? "PRICE ↑" : "PRICE ↓") : SORT_MAP[c])}>
            {c}{active ? (sort === "PRICE ↑" ? " ▴" : " ▾") : ""}
          </button>
        );
      })}
    </div>
  );
}
function PRow({ p, onOpen, selected }) {
  return (
    <button onClick={() => onOpen(p.n)} className="items-center rounded-xl px-2 text-left transition-transform active:scale-[0.995]"
      style={{ display: "grid", gridTemplateColumns: GRID, gap: 6, background: selected ? "#06331D" : T.bgRaise, height: 50, border: `1px solid ${selected ? T.green : "transparent"}` }}>
      <div className="flex items-center gap-2 min-w-0">
        <Kit team={p.team} size={20} />
        <span className="font-bold truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14.5 }}>{p.n}</span>
        <span className="font-bold shrink-0" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team} · {p.pos}</span>
        {MY_SQUAD.has(p.n) && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: T.green }} />}
        {p.risk && <span className="font-bold shrink-0" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }} title={p.risk}>⚑</span>}
      </div>
      <Plate>{nextLabel(p.team)}</Plate>
      <div className="flex items-end justify-center gap-0.5" style={{ height: 26 }}>
        {p.form5.map((v, i) => <div key={i} className="rounded-sm" style={{ width: 9, height: Math.max(5, (Math.min(v, 17) / 17) * 26), background: barColor(v) }} />)}
      </div>
      <Plate color={T.green}>{p.xp.toFixed(1)}</Plate>
      <Plate color={T.dim}>{p.price.toFixed(1)}</Plate>
      <Plate color={T.dim}>{p.apps}</Plate>
      <Plate color={T.dim}>{p.g}</Plate>
      <Plate color={T.dim}>{p.a}</Plate>
      <Plate color={T.dim}>{p.cs}</Plate>
      <Plate>{p.pts}</Plate>
      <Plate color={T.dim}>{p.own}%</Plate>
      <Plate bg={T.value}>{p.val.toFixed(1)}</Plate>
    </button>
  );
}
function CompareDrawer({ players, onClose }) {
  const colors = [T.green, T.cyan, T.cap];
  const maxP90 = Math.max(...players.map((p) => p.xp * 2.2));
  const rows = [
    ["PRICE", (p) => "£" + p.price.toFixed(1), "min", (p) => p.price],
    ["GW8 xP", (p) => p.xp.toFixed(1), "max", (p) => p.xp],
    ["NEXT", (p) => nextLabel(p.team), null],
    ["5GW PTS", (p) => p.form5.reduce((a, b) => a + b, 0), "max", (p) => p.form5.reduce((a, b) => a + b, 0)],
    ["SEASON PTS", (p) => p.pts, "max", (p) => p.pts],
    ["G · A", (p) => p.g + " · " + p.a, "max", (p) => p.g + p.a],
    ["xG · xA", (p) => p.xg.toFixed(1) + " · " + p.xa.toFixed(1), "max", (p) => p.xg + p.xa],
    ["FINISHING G−xG", (p) => (p.g - p.xg > 0 ? "+" : "") + (p.g - p.xg).toFixed(1), null],
    ["OWN%", (p) => p.own + "%", "min", (p) => p.own],
    ["P(START)", (p) => p.pstart + "%", "max", (p) => p.pstart],
    ["HOME / AWAY xP", (p) => p.hxp.toFixed(1) + " / " + p.axp.toFixed(1), null],
    ["VALUE", (p) => p.val.toFixed(1), "max", (p) => p.val],
  ];
  const best = (row) => {
    if (!row[2]) return -1;
    const vals = players.map(row[3]);
    const target = row[2] === "max" ? Math.max(...vals) : Math.min(...vals);
    return vals.indexOf(target);
  };
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(6,0,10,0.6)" }} onClick={onClose}>
      <aside className="h-full flex flex-col border-l overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ width: 300 + players.length * 170, maxWidth: 820, background: T.bgRaise, borderColor: T.line }}>
        <header className="flex items-center justify-between px-6 py-5 border-b sticky top-0 z-10" style={{ borderColor: T.line, background: T.bgRaise }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>Player comparison</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>GREEN PLATE = BEST IN ROW · OWN% BEST = LOWEST (DIFFERENTIAL EDGE)</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full border flex items-center justify-center shrink-0" style={{ borderColor: T.line }}><X size={16} color={T.dim} /></button>
        </header>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="grid gap-2" style={{ gridTemplateColumns: `130px repeat(${players.length}, 1fr)` }}>
            <span />
            {players.map((p, i) => (
              <div key={p.n} className="flex flex-col items-center gap-1.5 rounded-xl py-2.5" style={{ background: T.card, border: `1px solid ${colors[i]}` }}>
                <Kit team={p.team} size={26} />
                <span className="font-bold text-center px-1 leading-tight" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14 }}>{p.n}</span>
                <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team} · {p.pos}</span>
              </div>
            ))}
            {rows.map((row) => {
              const b = best(row);
              return (
                <React.Fragment key={row[0]}>
                  <span className="flex items-center font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{row[0]}</span>
                  {players.map((p, i) => (
                    <Plate key={p.n} h={34} bg={i === b ? "#06331D" : T.card} color={i === b ? T.green : "#FFFFFF"}>{row[1](p)}</Plate>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
          <div>
            <Label>Projection fans · GW8 · overlaid</Label>
            <svg width="100%" height={players.length * 34 + 26} viewBox={`0 0 560 ${players.length * 34 + 26}`} className="mt-2">
              {players.map((p, i) => {
                const x = (v) => 90 + (v / maxP90) * 440;
                const p10 = Math.max(0.5, p.xp * 0.3), p50 = p.xp, p90 = p.xp * 2.2;
                const y = 10 + i * 34;
                return (
                  <g key={p.n}>
                    <text x="0" y={y + 13} fill="rgba(255,255,255,0.85)" fontFamily="'Martian Mono',monospace" fontWeight="800" fontSize="12">{p.n.slice(0, 9)}</text>
                    <rect x={x(p10)} y={y} width={x(p90) - x(p10)} height={18} rx={9} fill={colors[i]} opacity="0.3" />
                    <rect x={x(p50) - 2} y={y - 1} width={4} height={20} rx={2} fill={colors[i]} />
                    <text x={x(p90) + 6} y={y + 13} fill="rgba(255,255,255,0.62)" fontFamily="'Martian Mono',monospace" fontWeight="800" fontSize="12">{p90.toFixed(0)}</text>
                  </g>
                );
              })}
              <text x="90" y={players.length * 34 + 22} fill="rgba(255,255,255,0.62)" fontFamily="'Martian Mono',monospace" fontWeight="800" fontSize="12">P10 ▸ MEDIAN ▸ P90</text>
            </svg>
          </div>
        </div>
      </aside>
    </div>
  );
}
function Profile({ p, onClose, onSell, onBuy }) {
  const fan = { p10: Math.max(1, p.xp * 0.3), p50: p.xp, p90: p.xp * 2.2 };
  const owned = MY_SQUAD.has(p.n);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(6,0,10,0.6)" }} onClick={onClose}>
      <aside className="h-full flex flex-col border-l overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ width: 480, background: T.bgRaise, borderColor: T.line }}>
        <header className="flex items-start justify-between px-6 py-5 border-b sticky top-0 z-10" style={{ borderColor: T.line, background: T.bgRaise }}>
          <div className="flex items-center gap-3">
            <Kit team={p.team} size={38} />
            <div>
              <div className="font-bold leading-none" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 21 }}>{p.n}</div>
              <div className="mt-1.5 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
                {p.team} · {p.pos} · £{p.price.toFixed(1)} · OWN {p.own}%{owned ? " · IN YOUR SQUAD" : ""}
              </div>
              {p.risk && <div className="mt-1 font-bold" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>⚑ {p.risk}</div>}
              {PROMOTED.has(p.team) && (
                <div className="mt-1.5 inline-flex items-center rounded-full px-2.5 font-bold" style={{ background: "#3A0217", color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 24 }}>
                  LOW SAMPLE · PROMOTED PRIORS ACTIVE UNTIL GW10
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full border flex items-center justify-center shrink-0" style={{ borderColor: T.line }}><X size={16} color={T.dim} /></button>
        </header>
        <div className="px-6 py-5 flex flex-col gap-6">
          <div>
            <Label color={T.green}>GW8 projection</Label>
            <div className="flex items-end gap-3 mt-2">
              <span className="leading-none" style={{ ...D, color: T.green, fontSize: 38 }}>{p.xp.toFixed(1)}</span>
              <span className="pb-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>xP · {nextLabel(p.team)}</span>
            </div>
            <div className="relative rounded-full overflow-hidden mt-3" style={{ height: 12, background: "#2A0B3D" }}>
              <div className="absolute inset-y-0" style={{ left: "8%", right: "12%", background: `linear-gradient(90deg, ${T.green}22, ${T.green}88, ${T.green}22)`, borderRadius: 999 }} />
              <div className="absolute inset-y-0" style={{ left: `${8 + (fan.p50 - fan.p10) / (fan.p90 - fan.p10) * 80}%`, width: 3, background: "#FFFFFF" }} />
            </div>
            <div className="flex justify-between mt-1.5 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
              <span>P10 {fan.p10.toFixed(1)}</span><span>MEDIAN {fan.p50.toFixed(1)}</span><span>P90 {fan.p90.toFixed(1)}</span>
            </div>
          </div>
          <div>
            <Label>Next 6 fixtures · per-fixture xP</Label>
            <div className="flex gap-1.5 mt-2">
              {FIX[p.team].map((f, i) => {
                const fxp = Math.max(0.8, p.xp * (1 + (3 - f.fdr) * 0.12));
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-center justify-center rounded font-bold leading-none"
                      style={{ background: fdrBg(f.fdr), color: f.fdr <= 2 ? "#04130A" : "#FFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 26 }}>
                      {f.home ? f.op : f.op.toLowerCase()}
                    </div>
                    <span className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{fxp.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Form · last 5 GWs</Label>
            <div className="flex items-end gap-3 mt-2" style={{ height: 66 }}>
              {p.form5.map((v, i) => (
                <div key={i} className="flex flex-col items-center justify-end gap-1" style={{ width: 30, height: 66 }}>
                  <span className="leading-none font-bold" style={{ color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{v}</span>
                  <div className="rounded-sm w-full" style={{ height: Math.max(8, (Math.min(v, 17) / 17) * 40), background: barColor(v) }} />
                  <span className="leading-none font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{3 + i}</span>
                </div>
              ))}
              <div className="ml-auto flex flex-col items-center gap-1">
                <Label>5GW</Label>
                <Plate h={34} w={56} bg={T.card} color={T.green}>{p.form5.reduce((a, b) => a + b, 0)}</Plate>
              </div>
            </div>
          </div>
          <div>
            <Label>Minutes</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="flex flex-col items-center gap-1"><span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>P(START)</span><Plate h={32} w={64} bg={T.card} color={p.pstart < 70 ? T.pink : "#FFFFFF"}>{p.pstart}%</Plate></div>
              <div className="flex flex-col items-center gap-1"><span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>AVG MINS</span><Plate h={32} w={64} bg={T.card}>{p.mins}</Plate></div>
              <div className="flex flex-col items-center gap-1"><span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>APPS</span><Plate h={32} w={64} bg={T.card}>{p.apps}/7</Plate></div>
            </div>
            {p.risk && (
              <div className="mt-2.5 font-semibold rounded-xl px-3 py-2.5" style={{ background: "#3A0217", color: "#FFFFFF", fontFamily: FB, fontSize: 13.5 }}>
                ⚑ {p.risk} — presser signal, priced into GW8 xP.
              </div>
            )}
          </div>
          <div>
            <div className="flex gap-5 items-start">
              <div className="flex-1">
                <Label>Underlying · season</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[["xG", p.xg], ["xA", p.xa], ["G−xG", +(p.g - p.xg).toFixed(1)]].map(([l, v]) => (
                    <div key={l} className="flex flex-col items-center gap-1">
                      <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{l}</span>
                      <Plate h={32} w={56} bg={T.card} color={l === "G−xG" ? (p.g - p.xg >= 1.2 ? T.pink : p.xg - p.g >= 1.2 ? T.green : "#FFFFFF") : "#FFFFFF"}>{l === "G−xG" && p.g - p.xg > 0 ? "+" : ""}{v}</Plate>
                    </div>
                  ))}
                </div>
                {Math.abs(p.g - p.xg) >= 1.2 && (
                  <div className="mt-2 font-bold" style={{ color: p.g - p.xg > 0 ? T.pink : T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
                    {p.g - p.xg > 0 ? "RUNNING HOT — REGRESSION RISK" : "UNDERLYING BEATS OUTPUT — BUY SIGNAL"}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>HOME xP</span>
                    <Plate h={32} w={64} bg={T.card} color={T.green}>{p.hxp.toFixed(1)}</Plate>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>AWAY xP</span>
                    <Plate h={32} w={64} bg={T.card}>{p.axp.toFixed(1)}</Plate>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>PRICE · SEASON</span>
                  <Plate h={30} bg={T.card} color={p.price - p.p0 > 0 ? T.green : p.price - p.p0 < 0 ? T.pink : "#FFFFFF"}>£{p.p0.toFixed(1)} → £{p.price.toFixed(1)}</Plate>
                </div>
              </div>
              <div className="shrink-0">
                <Label>Shot map · Understat</Label>
                <div className="mt-2"><ShotMap p={p} /></div>
                <div className="mt-1.5 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
                  <span style={{ color: T.green }}>●</span> GOAL · ● SHOT
                </div>
              </div>
            </div>
          </div>
          <div>
            <Label>Season</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {[["PTS", p.pts], ["G", p.g], ["A", p.a], ["CS", p.cs]].map(([l, v]) => (
                <div key={l} className="flex flex-col items-center gap-1">
                  <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{l}</span>
                  <Plate h={32} w={56} bg={T.card}>{v}</Plate>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>VALUE SCORE</span>
              <Plate h={30} w={70} bg={T.value}>{p.val.toFixed(1)}</Plate>
            </div>
          </div>
          {owned ? (
            <button onClick={() => onSell(p.n)} className="h-12 rounded-full font-bold flex items-center justify-center gap-2"
              style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
              SELL & REPLACE IN SQUAD <ArrowRight size={15} />
            </button>
          ) : (
            <button onClick={() => onBuy(p.n)} className="h-12 rounded-full font-bold flex items-center justify-center gap-2 border"
              style={{ background: T.card, color: T.green, borderColor: T.line, fontFamily: FB, fontSize: 14 }}>
              PLAN A TRANSFER FOR HIM <ArrowRight size={15} />
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
function PlayersPage({ pPos, setPPos, pClub, setPClub, pMaxP, setPMaxP, openProfile }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("xP");
  const [hideRisk, setHideRisk] = useState(false);
  const [mySquad, setMySquad] = useState(false);
  const [cmpMode, setCmpMode] = useState(false);
  const [cmp, setCmp] = useState([]);
  const [cmpOpen, setCmpOpen] = useState(false);
  const [diffs, setDiffs] = useState(false);
  const toggleCmp = (n) => setCmp((c) => (c.includes(n) ? c.filter((x) => x !== n) : c.length >= 3 ? c : [...c, n]));
  const list = useMemo(() => {
    let l = PLAYERS;
    if (pPos !== "ALL") l = l.filter((p) => p.pos === pPos);
    if (q) l = l.filter((p) => (p.n + " " + p.team).toLowerCase().includes(q.toLowerCase()));
    if (pClub !== "ALL") l = l.filter((p) => p.team === pClub);
    if (pMaxP !== "ALL") l = l.filter((p) => p.price <= +pMaxP);
    if (hideRisk) l = l.filter((p) => !p.risk);
    if (mySquad) l = l.filter((p) => MY_SQUAD.has(p.n));
    if (diffs) l = l.filter((p) => p.own <= 15 && p.xp >= 4.5);
    const by = {
      "xP": (a, b) => b.xp - a.xp, "PTS": (a, b) => b.pts - a.pts,
      "FORM": (a, b) => b.form5.reduce((x, y) => x + y, 0) - a.form5.reduce((x, y) => x + y, 0),
      "VALUE": (a, b) => b.val - a.val, "OWN%": (a, b) => b.own - a.own,
      "PRICE ↑": (a, b) => a.price - b.price, "PRICE ↓": (a, b) => b.price - a.price,
      "NAME": (a, b) => a.n.localeCompare(b.n),
    }[sort];
    return [...l].sort(by);
  }, [pPos, q, pClub, pMaxP, sort, hideRisk, mySquad, diffs]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {["ALL", "GK", "DEF", "MID", "FWD"].map((k) => (
          <button key={k} onClick={() => setPPos(k)} className="px-4 h-9 rounded-full font-bold"
            style={{ background: pPos === k ? T.green : T.card, color: pPos === k ? "#04130A" : T.dim, border: `1px solid ${pPos === k ? T.green : T.line}`, fontFamily: FB, fontSize: 13 }}>
            {k}
          </button>
        ))}
        <div className="flex items-center gap-2 rounded-xl px-3 flex-1 min-w-44" style={{ background: T.card, border: `1px solid ${T.line}`, height: 38 }}>
          <Search size={14} color={T.dim} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or club…"
            className="flex-1 bg-transparent outline-none font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14 }} />
        </div>
        <span className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{list.length} SHOWN</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Sel label="Club" value={pClub} options={CLUBS} onChange={setPClub} />
        <Sel label="Max £" value={pMaxP} options={PRICES} onChange={setPMaxP} />
        <Sel label="Sort" value={sort} options={["xP", "PTS", "FORM", "VALUE", "OWN%", "PRICE ↑", "PRICE ↓", "NAME"]} onChange={setSort} />
        <Toggle on={hideRisk} onClick={() => setHideRisk(!hideRisk)}>HIDE FLAGGED</Toggle>
        <Toggle on={mySquad} onClick={() => setMySquad(!mySquad)}>MY SQUAD</Toggle>
        <Toggle on={diffs} onClick={() => setDiffs(!diffs)}>DIFFERENTIALS</Toggle>
        <Toggle on={cmpMode} onClick={() => { setCmpMode(!cmpMode); if (cmpMode) { setCmp([]); setCmpOpen(false); } }}>COMPARE</Toggle>
      </div>
      <div className="rounded-2xl border p-3" style={{ background: T.card, borderColor: T.line }}>
        <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: "64vh" }}>
          <div className="sticky top-0 z-10" style={{ background: T.card }}><HeaderRow sort={sort} setSort={setSort} /></div>
          {list.map((p) => <PRow key={p.n} p={p} selected={cmp.includes(p.n)} onOpen={(n) => (cmpMode ? toggleCmp(n) : openProfile(n))} />)}
          {list.length === 0 && <div className="py-10 text-center font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 15 }}>No players match.</div>}
        </div>
      </div>
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
        CLICK A ROW FOR THE FULL PROFILE · COMPARE MODE: CLICK ROWS TO SELECT 2–3 · GREEN DOT = IN YOUR SQUAD
      </div>
      {cmpMode && cmp.length > 0 && (
        <div className="fixed left-1/2 bottom-24 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border px-3 py-2" style={{ background: T.bgRaise, borderColor: T.line, boxShadow: "0 10px 34px rgba(0,0,0,0.55)" }}>
          {cmp.map((n) => (
            <span key={n} className="flex items-center gap-1.5 rounded-full px-2.5 h-8 font-bold" style={{ background: T.card, color: "#FFFFFF", fontFamily: FB, fontSize: 13 }}>
              {n}<button onClick={() => setCmp(cmp.filter((x) => x !== n))}><X size={12} color={T.dim} /></button>
            </span>
          ))}
          <button disabled={cmp.length < 2} onClick={() => setCmpOpen(true)} className="rounded-full px-4 h-8 font-bold" style={{ background: cmp.length >= 2 ? T.green : T.card, color: cmp.length >= 2 ? "#04130A" : T.faint, fontFamily: FB, fontSize: 13 }}>
            COMPARE {cmp.length}
          </button>
        </div>
      )}
      {cmpOpen && cmp.length >= 2 && <CompareDrawer players={cmp.map((n) => byName(n))} onClose={() => setCmpOpen(false)} />}
    </div>
  );
}

/* ═════════ ANALYSIS ═════════ */
const FORMATIONS_A = [
  { id: "3-5-2", ev: 8.4, ppp: 2.19, adopt: 31 }, { id: "4-4-2", ev: 7.9, ppp: 2.11, adopt: 22 },
  { id: "3-4-3", ev: 7.1, ppp: 2.04, adopt: 19 }, { id: "4-3-3", ev: 6.8, ppp: 1.98, adopt: 14 },
  { id: "5-3-2", ev: 6.2, ppp: 1.91, adopt: 7 }, { id: "4-5-1", ev: 5.9, ppp: 1.86, adopt: 5 },
  { id: "5-4-1", ev: 5.1, ppp: 1.74, adopt: 2 },
];
const BANDS = ["≤£5.0", "£5.1–7.5", "£7.6–10.0", "£10.0+"];
const VALUE_GRID = {
  GK: [5.9, 5.2, 3.8, 3.1], DEF: [5.4, 6.1, 4.6, 3.9],
  MID: [4.8, 6.8, 5.9, 5.2], FWD: [4.2, 6.3, 5.7, 5.5],
};
const PREMIUMS = [["0", 2104], ["1", 2214], ["2", 2287], ["3", 2241]];
const EO_BANDS = [["Overall", 4.6, 3.1], ["Top 100k", 4.7, 3.6], ["Top 10k", 4.8, 4.5], ["Top 1k", 4.8, 5.2]];
function StudyCard({ no, title, finding, evidence, seasons, effect, children }) {
  return (
    <section className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: T.card, borderColor: T.line }}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <Label color={T.green}>{no} · {title}</Label>
          <p className="mt-1.5 font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 17, lineHeight: 1.4 }}>{finding}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="flex flex-col items-center gap-1"><Label>Evidence</Label><Plate h={28} w={54} bg={T.bgRaise} color={T.green}>{evidence}</Plate></div>
          <div className="flex flex-col items-center gap-1"><Label>Seasons</Label><Plate h={28} w={54} bg={T.bgRaise}>{seasons}</Plate></div>
          <div className="flex flex-col items-center gap-1"><Label>Effect</Label><Plate h={28} w={70} bg={T.bgRaise} color={T.green}>{effect}</Plate></div>
        </div>
      </header>
      {children}
    </section>
  );
}
function FormationsStudy({ onLoad }) {
  return (
    <StudyCard no="①" title="Structures" finding="3-5-2 wins the decade — premium mids drive it" evidence="8.4" seasons="10" effect="+118 PTS">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "112px 1fr 1fr 1fr" }}>
        <span className="px-2 font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Shape</span>
        <span className="text-center font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Evidence</span>
        <span className="text-center font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Pts/player</span>
        <span className="text-center font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Top-10k use</span>
        {FORMATIONS_A.map((f) => (
          <React.Fragment key={f.id}>
            <button onClick={() => onLoad(f.id)} className="flex items-center px-2 rounded-lg text-left" style={{ background: T.bgRaise, height: 34 }}>
              <span style={{ ...D, color: "#FFFFFF", fontSize: 13 }}>{f.id}</span>
              <ChevronRight size={13} color={T.faint} style={{ marginLeft: "auto" }} />
            </button>
            <Plate h={34} color={T.green}>{f.ev.toFixed(1)}</Plate>
            <Plate h={34} color={T.dim}>{f.ppp.toFixed(2)}</Plate>
            <Plate h={34} color={T.dim}>{f.adopt}%</Plate>
          </React.Fragment>
        ))}
      </div>
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>CLICK A SHAPE TO LOAD IT IN THE BUILDER</div>
    </StudyCard>
  );
}
function ValueStudy({ onCell }) {
  const all = Object.values(VALUE_GRID).flat();
  const hi = Math.max(...all), lo = Math.min(...all);
  return (
    <StudyCard no="②" title="Value by price band" finding="£5.1–7.5 mids are the decade's best pound-for-pound buy" evidence="6.8" seasons="10" effect="+0.9 PTS/£">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "64px 1fr 1fr 1fr 1fr" }}>
        <span />
        {BANDS.map((b) => <span key={b} className="text-center font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{b}</span>)}
        {Object.entries(VALUE_GRID).map(([pos, row]) => (
          <React.Fragment key={pos}>
            <span className="flex items-center px-2 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{pos}</span>
            {row.map((v, i) => {
              const t = (v - lo) / (hi - lo);
              return (
                <button key={i} onClick={() => onCell(pos, i)} className="flex items-center justify-center rounded-lg font-bold leading-none transition-transform active:scale-95"
                  style={{ height: 38, background: `rgba(0,255,133,${0.08 + t * 0.5})`, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 13, border: v === hi ? `1px solid ${T.green}` : "1px solid transparent" }}>
                  {v.toFixed(1)}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>PTS PER £ · CLICK A CELL TO OPEN PLAYERS FILTERED TO IT</div>
    </StudyCard>
  );
}
function BudgetStudy() {
  const max = Math.max(...PREMIUMS.map(([, v]) => v));
  return (
    <StudyCard no="③" title="Premium count" finding="Two premiums is the sweet spot — three starves the bench" evidence="7.7" seasons="8" effect="+83 PTS">
      <div className="flex items-end gap-6 px-2" style={{ height: 142 }}>
        {PREMIUMS.map(([n, v]) => (
          <div key={n} className="flex-1 flex flex-col items-center justify-end gap-1.5" style={{ height: 142 }}>
            <span className="font-bold leading-none" style={{ color: v === max ? T.green : "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>{v}</span>
            <div className="w-full rounded-t-lg" style={{ height: ((v - 2000) / (max - 2000)) * 80 + 12, background: v === max ? T.green : "#3A1150", border: v === max ? "none" : `1px solid ${T.line}` }} />
            <span className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{n} PREM</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>SEASON PTS · 10-SEASON SIM</span>
        <Plate h={28} bg={T.bgRaise} color={T.dim}>IDEAL BENCH £17.2 · 0.9 xP/GW</Plate>
      </div>
    </StudyCard>
  );
}
function TemplateStudy() {
  return (
    <StudyCard no="④" title="Template vs differential" finding="Templates hold rank — differentials win it at the top" evidence="7.2" seasons="10" effect="+0.6 /GW AT 1K">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <span className="px-2 font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Cohort</span>
        <span className="text-center font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Template pts/GW</span>
        <span className="text-center font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Differential pts/GW</span>
        {EO_BANDS.map(([c, t, d]) => (
          <React.Fragment key={c}>
            <span className="flex items-center px-2 rounded-lg font-bold" style={{ background: T.bgRaise, height: 34, color: "#FFFFFF", fontFamily: FB, fontSize: 13.5 }}>{c}</span>
            <Plate h={34} color={t >= d ? T.green : T.dim}>{t.toFixed(1)}</Plate>
            <Plate h={34} color={d > t ? T.green : T.dim}>{d.toFixed(1)}</Plate>
          </React.Fragment>
        ))}
      </div>
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
        DIFFERENTIALS ONLY OUTSCORE INSIDE THE TOP 1K — EXACTLY WHERE THIS CAMPAIGN ENDS
      </div>
    </StudyCard>
  );
}
function BehaviourStudy() {
  const mods = [
    ["CHIP TIMING", [["WC1 MEDIAN", "GW8.7"], ["TC ON DGW", "91%"], ["BB ON DGW", "87%"]]],
    ["TRANSFER CADENCE", [["MOVES/GW", "1.04"], ["HITS/GW", "0.21"], ["FT ROLLED", "62%"]]],
    ["CAPTAINCY", [["PREMIUM C", "92%"], ["PIVOTS/SZN", "5.3"], ["PIVOT EV", "−0.4"]]],
  ];
  return (
    <StudyCard no="⑤" title="Winner behaviour" finding="Rank-1 managers are boring — premium captains, few hits, patient chips" evidence="8.1" seasons="10" effect="TOP-1K PROFILE">
      <div className="grid grid-cols-3 gap-3">
        {mods.map(([title, rows]) => (
          <div key={title} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: T.bgRaise }}>
            <Label>{title}</Label>
            {rows.map(([l, v]) => (
              <div key={l} className="flex items-center justify-between">
                <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{l}</span>
                <Plate h={28} bg="#0D0014" color={v.startsWith("−") ? T.pink : T.green}>{v}</Plate>
              </div>
            ))}
          </div>
        ))}
      </div>
    </StudyCard>
  );
}
function AnalysisPage({ goStructure, goBand }) {
  const [sec, setSec] = useState("ALL");
  const SECS = ["ALL", "STRUCTURES", "VALUE", "BUDGET", "OWNERSHIP", "BEHAVIOUR"];
  const show = (k) => sec === "ALL" || sec === k;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {SECS.map((k) => (
          <button key={k} onClick={() => setSec(k)} className="px-4 h-9 rounded-full font-bold"
            style={{ background: sec === k ? T.green : T.card, color: sec === k ? "#04130A" : T.dim, border: `1px solid ${sec === k ? T.green : T.line}`, fontFamily: FB, fontSize: 13 }}>
            {k}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Plate h={30} bg={T.card} color={T.dim}>REFRESHED GW7</Plate>
          <Plate h={30} bg={T.card} color={T.green}>NEXT GW11</Plate>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 items-start">
        <div className="flex flex-col gap-4">
          {show("STRUCTURES") && <FormationsStudy onLoad={goStructure} />}
          {show("BUDGET") && <BudgetStudy />}
          {show("BEHAVIOUR") && <BehaviourStudy />}
        </div>
        <div className="flex flex-col gap-4">
          {show("VALUE") && <ValueStudy onCell={goBand} />}
          {show("OWNERSHIP") && <TemplateStudy />}
        </div>
      </div>
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
        TEN SEASONS OF HISTORY · REFRESHED EVERY 3 GWS BY THE STRATEGY STUDY PIPELINE · ZERO AI IN THE NUMBERS
      </div>
    </div>
  );
}

/* ═════════ NEWS ═════════ */
const SIGNALS = {
  OUT: { bg: "#B3003F", fg: "#FFFFFF" }, DOUBT: { bg: "#3A0217", fg: T.pink },
  RESTED: { bg: "#3A0217", fg: T.pink }, CONFIRMED: { bg: "#06331D", fg: T.green },
  ROTATION: { bg: "#3A0217", fg: T.pink },
};
const Signal = ({ kind, conf }) => (
  <span className="flex items-center gap-1.5 rounded-full px-2.5 font-bold leading-none"
    style={{ background: SIGNALS[kind].bg, color: SIGNALS[kind].fg, fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 24 }}>
    {kind}{conf !== undefined && <span style={{ opacity: 0.8 }}>{conf.toFixed(1)}</span>}
  </span>
);
const FEED = [
  { t: "TODAY 09:12", kind: "PRESSERS", club: "NFO", items: [
    { p: "Wood", sig: "RESTED", conf: 0.5, line: "\u201CChris has played a lot of minutes — we will make a decision late.\u201D Parsed as rotation risk for BHA (H)." },
    { p: "Sels", sig: "CONFIRMED", conf: 0.9, line: "Named first-choice for cup and league — starts BHA (H)." },
  ]},
  { t: "TODAY 08:40", kind: "PRESSERS", club: "NEW", items: [
    { p: "Hall", sig: "DOUBT", conf: 0.7, line: "\u201CLewis felt his knee in training.\u201D Scan today; presser tone negative." },
    { p: "Gordon", sig: "ROTATION", conf: 0.6, line: "\u201CEveryone is pushing — Anthony, Harvey, Jacob all in contention.\u201D Minutes risk for mun (A)." },
  ]},
  { t: "TODAY 02:10", kind: "PRICES", rises: [["Semenyo", "BOU", "+0.1", "7.3"], ["Gyökeres", "ARS", "+0.1", "9.4"]], falls: [["Palmer", "CHE", "−0.1", "10.6"], ["Watkins", "AVL", "−0.1", "8.7"]] },
  { t: "YESTERDAY 17:05", kind: "STRUCTURE", title: "Carabao Cup R4 dates confirmed", line: "No Premier League postponements triggered — GW10–GW12 fixtures unaffected. Cup-watcher stays green." },
  { t: "YESTERDAY 14:30", kind: "PRESSERS", club: "MCI", items: [
    { p: "Haaland", sig: "CONFIRMED", conf: 0.9, line: "\u201CErling trained fully, he is ready.\u201D Starts WOL (H)." },
  ]},
  { t: "YESTERDAY 02:10", kind: "PRICES", rises: [["Isak", "LIV", "+0.1", "10.6"]], falls: [["Kudus", "TOT", "−0.1", "6.8"]] },
  { t: "MON 11:00", kind: "STRUCTURE", title: "GW14 deadline moved 90 minutes earlier", line: "TV selection shifted the Friday fixture — deadline now Fri 17:00. Countdown chips already reflect it." },
];
const RISE_RISK = [
  { p: "Semenyo", team: "BOU", pct: 86, dir: "rise" },
  { p: "Mbeumo", team: "MUN", pct: 54, dir: "rise" },
  { p: "Palmer", team: "CHE", pct: 71, dir: "fall" },
];
function NewsStrip() {
  const sigsToday = FEED.filter((f) => f.t.startsWith("TODAY") && f.kind === "PRESSERS").reduce((s, f) => s + f.items.length, 0);
  const mineToday = FEED.filter((f) => f.t.startsWith("TODAY") && f.kind === "PRESSERS").reduce((s, f) => s + f.items.filter((x) => MY_SQUAD.has(x.p)).length, 0);
  const tiles = [
    ["SIGNALS TODAY", sigsToday, "#FFFFFF"],
    ["YOUR PLAYERS AFFECTED", mineToday, mineToday > 0 ? T.pink : T.green],
    ["PRICE MOVES TONIGHT", RISE_RISK.length, "#FFFFFF"],
    ["CUP-WATCHER", "GREEN", T.green],
  ];
  return (
    <div className="rounded-2xl border grid grid-cols-4 gap-2 p-2 mb-4" style={{ background: T.card, borderColor: T.line }}>
      {tiles.map(([label, value, color]) => (
        <div key={label} className="flex flex-col items-center gap-1.5 pt-2 pb-1">
          <div className="font-bold uppercase text-center leading-none" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.06em" }}>{label}</div>
          <div className="flex items-center justify-center rounded-lg w-full leading-none" style={{ background: T.bgRaise, height: 38, color, fontFamily: FN, fontWeight: FNW, fontSize: 16 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}
function PresserCard({ item, myOnly, openProfile }) {
  const items = myOnly ? item.items.filter((x) => MY_SQUAD.has(x.p)) : item.items;
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: T.card, borderColor: T.line }}>
      <div className="flex items-center gap-2.5">
        <Kit team={item.club} size={22} />
        <span className="leading-none" style={{ ...D, color: "#FFFFFF", fontSize: 15 }}>{item.club}</span>
        <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>PRESS CONFERENCE · HAIKU PARSE</span>
        <span className="ml-auto"><Plate h={26} bg={T.bgRaise} color={T.faint}>{item.t}</Plate></span>
      </div>
      {items.map((x) => (
        <div key={x.p} className="rounded-xl px-3 py-2.5 flex flex-col gap-1.5" style={{ background: T.bgRaise }}>
          <div className="flex items-center gap-2.5">
            <button onClick={() => byName(x.p) && openProfile(x.p)} className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15 }}>{x.p}</button>
            {MY_SQUAD.has(x.p) && <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.green }} />}
            <Signal kind={x.sig} conf={x.conf} />
          </div>
          <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 14, lineHeight: 1.55 }}>{x.line}</p>
        </div>
      ))}
    </div>
  );
}
function PriceCard({ item, myOnly, openProfile }) {
  const filt = (arr) => (myOnly ? arr.filter(([p]) => MY_SQUAD.has(p)) : arr);
  const rises = filt(item.rises), falls = filt(item.falls);
  if (rises.length + falls.length === 0) return null;
  const Row = ({ p, team, d, price, up }) => (
    <button onClick={() => byName(p) && openProfile(p)} className="flex items-center gap-2.5 rounded-xl px-3 text-left" style={{ background: T.bgRaise, height: 44 }}>
      <Kit team={team} size={20} />
      <span className="font-bold flex-1 truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14.5 }}>
        {p}{MY_SQUAD.has(p) && <span className="inline-block w-1.5 h-1.5 rounded-full ml-2 align-middle" style={{ background: T.green }} />}
      </span>
      <Plate w={58} color={up ? T.green : T.pink}>{d}</Plate>
      <Plate w={54} color={T.dim}>£{price}</Plate>
    </button>
  );
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-2.5" style={{ background: T.card, borderColor: T.line }}>
      <div className="flex items-center gap-2.5">
        <span className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5 }}>Overnight price changes</span>
        <span className="ml-auto"><Plate h={26} bg={T.bgRaise} color={T.faint}>{item.t}</Plate></span>
      </div>
      {rises.map(([p, team, d, price]) => <Row key={p} p={p} team={team} d={d} price={price} up />)}
      {falls.map(([p, team, d, price]) => <Row key={p} p={p} team={team} d={d} price={price} />)}
    </div>
  );
}
function StructureCard({ item }) {
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-2" style={{ background: T.card, borderColor: T.line }}>
      <div className="flex items-center gap-2.5">
        <span className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5 }}>{item.title}</span>
        <span className="ml-auto"><Plate h={26} bg={T.bgRaise} color={T.faint}>{item.t}</Plate></span>
      </div>
      <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 14, lineHeight: 1.55 }}>{item.line}</p>
    </div>
  );
}
function PriceWatch({ openProfile }) {
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: T.card, borderColor: T.line }}>
      <Label color={T.green}>Tonight's price watch · your players</Label>
      {RISE_RISK.map((r) => (
        <button key={r.p} onClick={() => openProfile(r.p)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left" style={{ background: T.bgRaise }}>
          <Kit team={r.team} size={20} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14 }}>{r.p}</span>
              <span className="flex items-center gap-1 font-bold" style={{ color: r.dir === "rise" ? T.green : T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
                {r.dir === "rise" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{r.pct}%
              </span>
            </div>
            <div className="rounded-full overflow-hidden mt-1.5" style={{ height: 7, background: "#2A0B3D" }}>
              <div style={{ height: 7, width: `${r.pct}%`, background: r.dir === "rise" ? T.green : T.pink, opacity: 0.9 }} />
            </div>
          </div>
        </button>
      ))}
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>SURFACED HERE ONLY — NEVER PUSHED</div>
    </div>
  );
}
function StructureBoard() {
  const rows = [["GW12 BLANKS", "NONE"], ["GW14 DEADLINE", "FRI 17:00"], ["NEXT DOUBLE", "TBC · GW15?"], ["RULESET", "2026/27 · CURRENT"]];
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: T.card, borderColor: T.line }}>
      <Label color={T.green}>Structure board</Label>
      {rows.map(([l, v]) => (
        <div key={l} className="flex items-center justify-between">
          <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{l}</span>
          <Plate h={28} bg={T.bgRaise} color={v === "NONE" ? T.green : "#FFFFFF"}>{v}</Plate>
        </div>
      ))}
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>CUP-WATCHER: GREEN · NO BLANK/DOUBLE ACTION NEEDED</div>
    </div>
  );
}
function NewsPage({ openProfile }) {
  const [kind, setKind] = useState("ALL");
  const [myOnly, setMyOnly] = useState(false);
  const feed = FEED.filter((f) => kind === "ALL" || f.kind === kind);
  return (
    <div>
    <NewsStrip />
    <div className="flex gap-5 items-start">
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {["ALL", "PRESSERS", "PRICES", "STRUCTURE"].map((k) => {
            const n = k === "ALL" ? FEED.length : FEED.filter((f) => f.kind === k).length;
            return (
              <button key={k} onClick={() => setKind(k)} className="px-4 h-9 rounded-full font-bold"
                style={{ background: kind === k ? T.green : T.card, color: kind === k ? "#04130A" : T.dim, border: `1px solid ${kind === k ? T.green : T.line}`, fontFamily: FB, fontSize: 13 }}>
                {k} · {n}
              </button>
            );
          })}
          <Toggle on={myOnly} onClick={() => setMyOnly(!myOnly)}>MY PLAYERS ONLY</Toggle>
          <span className="ml-auto font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>REVERSE-CHRON · KEPT OFF THE DASHBOARD BY DESIGN</span>
        </div>
        {feed.map((item, i) => {
          if (item.kind === "PRESSERS") return <PresserCard key={i} item={item} myOnly={myOnly} openProfile={openProfile} />;
          if (item.kind === "PRICES") return <PriceCard key={i} item={item} myOnly={myOnly} openProfile={openProfile} />;
          return <StructureCard key={i} item={item} />;
        })}
      </div>
      <div className="flex flex-col gap-4" style={{ width: 340 }}>
        <PriceWatch openProfile={openProfile} />
        <StructureBoard />
      </div>
    </div>
    </div>
  );
}

/* ═════════ ANALYST (per-page context) + STATUS ═════════ */
const MOCKS = {
  Dashboard: [
    "Your GW7 over-delivery (+13) came almost entirely from the bench call, not the captain — Timber's autosub covered Van Dijk's blank. The pattern across memory: your floor decisions are outperforming your ceiling ones.",
    "The rank curve is ahead of the #1 pace line for the first time. The model says the next 3 GWs are where ARS assets peak — you hold three, so no action is the strong move.",
    "THE LEVER: hold everything this week. Your edge is currently structural, not transactional.",
  ],
  Builder: [
    "This draft is £0.8 short of the ideal two-premium shape. Downgrading the third mid band (£7.0 → £6.5) frees exactly that without touching the projected XI.",
    "Captaincy concentration is fine: Haaland's home fixture keeps P(12+) above 40% and no draft variant beats him this week.",
    "THE LEVER: bank the £0.8 in the mid band — spend it on defence in GW10 when the ARS run ends.",
  ],
  Squad: [
    "Wood's rested flag plus Sels confirmed means your NFO exposure is one coin-flip, not two — starting Larsen neutralises it with zero transfers.",
    "The Palmer question is patience: his fixture run turns brutal but resale drops only £0.1 tonight. Memory (gw6): waiting on a faller cost you nothing twice.",
    "THE LEVER: bench Wood, hold Palmer, keep both free transfers for the GW10 swing.",
  ],
  Players: [
    "Your filters are pointing at the exact band the value study flagged: £5.1–7.5 mids. Schade and Rogers are the two with rising minutes AND green fixture runs.",
    "One caution — Kudus screens well on form but his underlying numbers are 60% penalty-box luck. The model has him regressing hard.",
    "THE LEVER: shortlist Schade for GW10; ignore the Kudus form bars.",
  ],
  Analysis: [
    "Three of the five studies point the same direction this season: 3-5-2, two premiums, mid-heavy spend. Your current squad matches all three — the gap is behaviour, not structure.",
    "Your hit rate (0.4/GW) is double the winner profile. Every study refresh has said the same thing since GW3.",
    "THE LEVER: adopt the 62% roll rate — plan transfers in pairs, act every other week.",
  ],
  News: [
    "Two of today's signals touch your squad and they interact: Wood rested (0.5) plus Sels confirmed makes NFO one decision, not two. The bench call absorbs it fully.",
    "Palmer's 71% fall risk is the quiet one — but the replacement band is flat, so urgency is genuinely low.",
    "THE LEVER: do nothing tonight; start Larsen over Wood at the deadline.",
  ],
};
function AnalystDrawer({ page, onClose, toast }) {
  const [fired, setFired] = useState(false);
  const mock = MOCKS[page] || MOCKS.Dashboard;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(6,0,10,0.6)" }} onClick={onClose}>
      <aside className="h-full flex flex-col border-l" onClick={(e) => e.stopPropagation()} style={{ width: 560, background: T.bgRaise, borderColor: T.line }}>
        <header className="flex items-center justify-between px-7 py-6 border-b" style={{ borderColor: T.line }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>✦ The Analyst</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>{page} · GW8 · 14 memory records</div>
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
              The payload includes this page's full context, your squad, drafts, signals and memory. Mock response — nothing connected, nothing charged.
            </p>
          ) : (
            <>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>{mock[0]}</p>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>{mock[1]}</p>
              <p className="font-bold" style={{ color: T.green, fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>{mock[2]}</p>
            </>
          )}
        </div>
        <footer className="px-7 py-4 border-t flex justify-between font-bold" style={{ borderColor: T.line, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          <span>{fired ? "THIS CALL · $0.09" : "NO CALL FIRED"}</span>
          <span>OCT SPEND · $2.84 OF $8.00 CAP</span>
        </footer>
      </aside>
    </div>
  );
}
function StatusPopover({ onClose }) {
  const rows = [
    ["FPL CORE", "8 MIN AGO", true], ["MATCH ODDS", "22 MIN AGO", true], ["UNDERSTAT SHOTS", "1 HR AGO", true],
    ["PRESS SIGNALS", "9 MIN AGO", true], ["PRICE PREDICTOR", "2 HR AGO", true], ["ANALYST SPEND", "$2.84 / $8.00", true],
  ];
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute rounded-2xl border p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}
        style={{ top: 84, right: 256, width: 340, background: T.bgRaise, borderColor: T.line, boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
        <div className="flex items-center justify-between">
          <Label color={T.green}>Data status</Label>
          <button onClick={onClose}><X size={15} color={T.dim} /></button>
        </div>
        {rows.map(([l, v, ok]) => (
          <div key={l} className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? T.green : T.pink }} />{l}
            </span>
            <Plate h={26} bg={T.card} color={T.dim}>{v}</Plate>
          </div>
        ))}
        <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          ODDS REFRESH: DEADLINE−36H · −12H · −2H
        </div>
      </div>
    </div>
  );
}

/* ═════════ APP SHELL ═════════ */
const NAV = [
  { id: "Dashboard", icon: LayoutGrid }, { id: "Squad", icon: ShirtIcon }, { id: "Builder", icon: Hammer },
  { id: "Players", icon: Users }, { id: "Analysis", icon: BarChart3 }, { id: "News", icon: Newspaper },
];
const TITLES = { Builder: "Squad Builder" };
export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [live, setLive] = useState(false);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [spinning, setSpinning] = useState(false);
  // Builder state (persists across pages)
  const [bTab, setBTab] = useState("BUILD");
  const [bSquad, setBSquad] = useState([]);
  const [structId, setStructId] = useState("3-5-2");
  const [bCap, setBCap] = useState(null);
  const [bVice, setBVice] = useState(null);
  const [bModalPos, setBModalPos] = useState(null);
  const [bMenuP, setBMenuP] = useState(null);
  const [bH, setBH] = useState(1);
  const [drafts, setDrafts] = useState([]);
  const [por, setPor] = useState(null);
  // Squad state
  const [sTeam, setSTeam] = useState(START_SQUAD);
  const [transfers, setTransfers] = useState([]);
  const [sCap, setSCap] = useState("Haaland");
  const [sVice, setSVice] = useState("Saka");
  const [sMenu, setSMenu] = useState(null);
  const [replaceOut, setReplaceOut] = useState(null);
  // Players state (lifted so other pages can deep-link)
  const [pPos, setPPos] = useState("ALL");
  const [pClub, setPClub] = useState("ALL");
  const [pMaxP, setPMaxP] = useState("ALL");
  const [profileP, setProfileP] = useState(null);

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400); }, []);
  const refresh = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => { setSpinning(false); toast("Refreshed — projections, prices and signals updated"); }, 900);
  }, [spinning, toast]);

  const openProfile = useCallback((name) => { const p = byName(name); if (p) setProfileP(p); }, []);
  const goClub = useCallback((team) => { setPClub(team); setPPos("ALL"); setPMaxP("ALL"); setPage("Players"); toast(`Players filtered to ${team}`); }, [toast]);
  const goStructure = useCallback((id) => { setStructId(id); setBTab("BUILD"); setPage("Builder"); toast(`${id} loaded in the Builder`); }, [toast]);
  const goBand = useCallback((pos, i) => {
    setPPos(pos); setPClub("ALL"); setPMaxP(["5", "7.5", "11", "ALL"][i]); setPage("Players");
    toast(`Players filtered to ${pos} · ${BANDS[i]}`);
  }, [toast]);
  const bank = useMemo(() => START_BANK + transfers.reduce((s, t) => s + (t.outP.price - t.inP.price), 0), [transfers]);
  const doReplace = useCallback((outP, inP) => {
    setSTeam((team) => team.map((p) => (p.n === outP.n ? inP : p)));
    setTransfers((ts) => [...ts, { outP, inP }]);
    setSCap((c) => (c === outP.n ? null : c));
    setSVice((v) => (v === outP.n ? null : v));
    setReplaceOut(null);
    toast(`${outP.n} → ${inP.n} added to the plan`);
  }, [toast]);
  const undo = useCallback((t) => {
    if (!sTeam.some((p) => p.n === t.inP.n)) { toast("Undo the later transfer first"); return; }
    setSTeam((team) => team.map((p) => (p.n === t.inP.n ? t.outP : p)));
    setTransfers((ts) => ts.filter((x) => x !== t));
    toast(`${t.outP.n} restored`);
  }, [sTeam, toast]);
  const resetPlan = useCallback(() => {
    setSTeam(START_SQUAD); setTransfers([]); setSCap("Haaland"); setSVice("Saka");
    toast("Plan reset to your live squad");
  }, [toast]);
  const onBuy = useCallback((name) => {
    setProfileP(null); setPage("Squad");
    toast(`Pick who you'd sell to bring ${name} in — the replace list ranks him`);
  }, [toast]);
  const onSell = useCallback((name) => {
    const p = sTeam.find((x) => x.n === name);
    setProfileP(null);
    if (!p) { toast(`${name} is no longer in the plan — open Squad to review`); setPage("Squad"); return; }
    setPage("Squad"); setReplaceOut(p);
  }, [sTeam, toast]);

  return (
    <div className="min-h-screen w-full flex flex-row-reverse" style={{ background: T.bg, fontFamily: FB, fontWeight: 600 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Michroma&family=Martian+Mono:wght@700;800&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <nav className="h-screen sticky top-0 flex flex-col border-l px-5 py-7 shrink-0" style={{ width: 240, background: T.bgRaise, borderColor: T.line }}>
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
        <button onClick={() => setStatusOpen(true)} className="mt-auto px-3 py-2.5 text-left">
          <div className="flex items-center gap-2 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.green }} /> ALL DATA FRESH
          </div>
          <div className="mt-1 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Updated 2 min ago · view status</div>
        </button>
      </nav>

      <main className="flex-1 min-w-0">
        <div className="mx-auto px-10 pb-14" style={{ maxWidth: 1480 }}>
          <header className="pt-8 pb-6 flex items-end justify-between">
            <div>
              <div className="font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.18em" }}>FPL 2026/27 · Campaign</div>
              <h1 className="leading-none mt-2 uppercase" style={{ ...D, color: "#FFFFFF", fontSize: 40 }}>{TITLES[page] || page}</h1>
            </div>
            <span className="flex items-center px-4 rounded-full font-bold leading-none mb-1"
              style={{ background: T.card, color: "#FFFFFF", border: `1px solid ${T.line}`, fontFamily: FN, fontWeight: FNW, fontSize: 13, height: 34 }}>
              GW8 DEADLINE · SAT 11:00 · <span style={{ color: T.green, marginLeft: 5 }}>2D 14H</span>
            </span>
          </header>

          {page === "Dashboard" && (
            <DashboardPage go={setPage} openSeason={() => setSeasonOpen(true)} openProfile={openProfile}
              live={live} setLive={setLive} goClub={goClub} />
          )}
          {page === "Squad" && (
            <SquadPage sTeam={sTeam} transfers={transfers} sCap={sCap} sVice={sVice} setSCap={setSCap} setSVice={setSVice}
              sMenu={sMenu} setSMenu={setSMenu} replaceOut={replaceOut} setReplaceOut={setReplaceOut}
              doReplace={doReplace} undo={undo} reset={resetPlan} bank={bank}
              openSeason={() => setSeasonOpen(true)} toast={toast} />
          )}
          {page === "Builder" && (
            <BuilderPage bTab={bTab} setBTab={setBTab} squad={bSquad} setSquad={setBSquad}
              structId={structId} setStructId={setStructId} cap={bCap} setCap={setBCap} vice={bVice} setVice={setBVice}
              modalPos={bModalPos} setModalPos={setBModalPos} menuP={bMenuP} setMenuP={setBMenuP}
              H={bH} setH={setBH} drafts={drafts} setDrafts={setDrafts} por={por} setPor={setPor} toast={toast} />
          )}
          {page === "Players" && (
            <PlayersPage pPos={pPos} setPPos={setPPos} pClub={pClub} setPClub={setPClub}
              pMaxP={pMaxP} setPMaxP={setPMaxP} openProfile={openProfile} />
          )}
          {page === "Analysis" && <AnalysisPage goStructure={goStructure} goBand={goBand} />}
          {page === "News" && <NewsPage openProfile={openProfile} />}
        </div>
      </main>

      {seasonOpen && <SeasonModal onClose={() => setSeasonOpen(false)} />}
      {profileP && <Profile p={profileP} onClose={() => setProfileP(null)} onSell={onSell} onBuy={onBuy} />}
      {askOpen && <AnalystDrawer page={page} onClose={() => setAskOpen(false)} toast={toast} />}
      {statusOpen && <StatusPopover onClose={() => setStatusOpen(false)} />}
      {toastMsg && (
        <div className="fixed left-1/2 bottom-8 -translate-x-1/2 px-6 h-11 flex items-center rounded-full font-bold z-50"
          style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
