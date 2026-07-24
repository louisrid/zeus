import React, { useState, useCallback, useMemo } from "react";
import {
  LayoutGrid, Shirt as ShirtIcon, Hammer, Users, BarChart3, Newspaper,
  RefreshCw, Sparkles, X, Copy, Search, RotateCcw, ArrowRight, Lock,
} from "lucide-react";

/* ————— LOCKED SYSTEM — Michroma (identity) · Outfit 600+ (body) · Martian Mono 800 (data)
   White text only · 12px floor · numbers centred on dark plates · green = projections/actions ·
   pink = risk · neon pink #FF2ECC = captain/×2 + value · form bands red/amber/green/blue ·
   FPL green pitch, GK bottom, bench bar on grass · nav rail right. ————— */
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

/* GW8 fixtures: BOU–ARS · MCI–WOL · LIV–EVE · MUN–NEW · CHE–CRY · AVL–BRE · TOT–FUL ·
   NFO–BHA · WHU–BUR · SUN–LEE. Uppercase = home, lowercase = away. */
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

/* ————— The mock universe (real build queries the full FPL DB) ————— */
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
  ],
  MID: [
    { n: "Salah", team: "LIV", price: 14.3, xp: 6.6 },
    { n: "Saka", team: "ARS", price: 10.8, xp: 6.1 },
    { n: "Wirtz", team: "LIV", price: 9.8, xp: 5.8 },
    { n: "Mbeumo", team: "MUN", price: 8.4, xp: 5.6 },
    { n: "Ødegaard", team: "ARS", price: 9.6, xp: 5.2 },
    { n: "Eze", team: "ARS", price: 8.8, xp: 5.1 },
    { n: "Fernandes", team: "MUN", price: 9.0, xp: 5.0 },
    { n: "Gordon", team: "NEW", price: 7.6, xp: 4.7, risk: "Rotation — minutes risk" },
    { n: "Semenyo", team: "BOU", price: 7.3, xp: 4.6 },
    { n: "Doku", team: "MCI", price: 7.2, xp: 4.6 },
    { n: "Schade", team: "BRE", price: 6.9, xp: 4.6 },
    { n: "Sávio", team: "MCI", price: 7.0, xp: 4.5 },
    { n: "Palmer", team: "CHE", price: 10.6, xp: 4.5 },
    { n: "Rogers", team: "AVL", price: 7.1, xp: 4.4 },
    { n: "Bruno G.", team: "NEW", price: 6.9, xp: 4.3 },
    { n: "Ndiaye", team: "EVE", price: 6.6, xp: 4.3 },
    { n: "Kudus", team: "TOT", price: 6.8, xp: 4.2 },
    { n: "Enzo", team: "CHE", price: 6.7, xp: 4.2 },
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
  ],
};

/* Current 15 from the team-ID pick sync (gw_picks). XI in 3-5-2, bench order matters. */
const START_SQUAD = [
  { n: "Raya", team: "ARS", pos: "GK", price: 5.7, xp: 4.9 },
  { n: "Gabriel", team: "ARS", pos: "DEF", price: 6.3, xp: 5.0 },
  { n: "Van Dijk", team: "LIV", pos: "DEF", price: 6.4, xp: 4.6 },
  { n: "Muñoz", team: "CRY", pos: "DEF", price: 5.6, xp: 3.7 },
  { n: "Saka", team: "ARS", pos: "MID", price: 10.8, xp: 6.1 },
  { n: "Palmer", team: "CHE", pos: "MID", price: 10.6, xp: 4.5 },
  { n: "Semenyo", team: "BOU", pos: "MID", price: 7.3, xp: 4.6 },
  { n: "Mbeumo", team: "MUN", pos: "MID", price: 8.4, xp: 5.6 },
  { n: "Rogers", team: "AVL", pos: "MID", price: 7.1, xp: 4.4 },
  { n: "Haaland", team: "MCI", pos: "FWD", price: 14.2, xp: 7.8 },
  { n: "Wood", team: "NFO", pos: "FWD", price: 7.6, xp: 4.4, risk: "Rested flag — 0.5" },
  { n: "Sels", team: "NFO", pos: "GK", price: 5.2, xp: 4.0 },
  { n: "Timber", team: "ARS", pos: "DEF", price: 6.0, xp: 4.8 },
  { n: "O'Brien", team: "EVE", pos: "DEF", price: 4.8, xp: 3.6 },
  { n: "Strand Larsen", team: "WOL", pos: "FWD", price: 7.2, xp: 4.3 },
];
const XI_PLAN = { GK: 1, DEF: 3, MID: 5, FWD: 2 }; // 3-5-2
const START_BANK = 1.3;
const FT = 2;

/* Season so far — team scores per GW (bands scaled for team totals) */
const SEASON = [[1, 49], [2, 61], [3, 54], [4, 58], [5, 47], [6, 66], [7, 71]];
const teamBand = (v) => (v >= 66 ? "#4DD6FF" : v >= 58 ? T.green : v >= 50 ? "#FFC94D" : "#FF5A5A");

const clubCount = (sq, team) => sq.filter((p) => p.team === team).length;

const Label = ({ children, color = T.dim }) => (
  <div className="font-bold uppercase" style={{ color, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.08em" }}>{children}</div>
);
const Plate = ({ children, color = "#FFFFFF", w, h = 30, bg = "#0D0014" }) => (
  <div className="flex items-center justify-center rounded-lg px-2.5 font-bold leading-none whitespace-nowrap"
    style={{ background: bg, height: h, minWidth: w, color, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
    {children}
  </div>
);

/* ————— PITCH — current 15, xP on plates, click a shirt to act ————— */
function PitchSlot({ p, captain, vice, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center transition-transform active:scale-95" style={{ width: 70 }}>
      <Kit team={p.team} size={38} captain={captain} vice={vice} />
      <div className="mt-1 rounded px-1.5 py-0.5 w-full text-center truncate font-bold leading-tight"
        style={{ background: "rgba(6,0,12,0.78)", color: "#FFFFFF", fontFamily: FB, fontSize: 13 }}>
        {p.n}
      </div>
      <div className="rounded-b px-1.5 pb-0.5 w-full text-center font-bold leading-tight flex items-center justify-center gap-1"
        style={{ background: "rgba(6,0,12,0.78)", color: "rgba(255,255,255,0.85)", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
        xP {p.xp.toFixed(1)}{p.risk && <span style={{ color: T.pink }}>⚑</span>}
      </div>
    </button>
  );
}

function Pitch({ squad, captainN, viceN, openMenu }) { // openMenu(player, isBench)
  const xi = []; const benchList = [];
  ["GK", "DEF", "MID", "FWD"].forEach((pos) => {
    const players = squad.filter((p) => p.pos === pos);
    xi.push({ pos, players: players.slice(0, XI_PLAN[pos]) });
    benchList.push(...players.slice(XI_PLAN[pos]));
  });
  const rows = [...xi].reverse(); // FWD top → GK bottom
  return (
    <div className="rounded-2xl overflow-hidden px-4 pt-5 pb-4 flex flex-col gap-3"
      style={{ background: GRASS, border: `1px solid ${T.line}` }}>
      <div className="relative flex flex-col gap-4 pb-2 overflow-hidden">
        <div className="absolute rounded-full" style={{ top: -60, left: "50%", transform: "translateX(-50%)", width: 170, height: 120, border: "2px solid rgba(255,255,255,0.25)" }} />
        <div className="absolute" style={{ bottom: 0, left: "50%", transform: "translateX(-50%)", width: 280, height: 52, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        <div className="absolute" style={{ bottom: 0, left: "50%", transform: "translateX(-50%)", width: 120, height: 22, border: "2px solid rgba(255,255,255,0.25)", borderBottom: "none" }} />
        {rows.map(({ pos, players }) => (
          <div key={pos} className="flex justify-center gap-3 relative">
            {players.map((p) => (
              <PitchSlot key={p.n} p={p} captain={captainN === p.n} vice={viceN === p.n} onClick={() => openMenu(p, false)} />
            ))}
          </div>
        ))}
      </div>
      <div className="rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap" style={{ background: "rgba(5,0,10,0.94)" }}>
        <Label>Bench</Label>
        {benchList.map((p, i) => (
          <button key={p.n} onClick={() => openMenu(p, true)} className="flex items-center gap-2 rounded-lg px-2.5 h-9 border"
            style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.2)" }}>
            <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.pos === "GK" ? "GK" : i}</span>
            <Kit team={p.team} size={17} captain={captainN === p.n} vice={viceN === p.n} />
            <span className="font-bold truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 13.5, maxWidth: 92 }}>{p.n}</span>
            <span className="font-bold" style={{ color: "rgba(255,255,255,0.85)", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.xp.toFixed(1)}</span>
          </button>
        ))}
        <span className="ml-auto font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>CLICK A SHIRT TO ACT</span>
      </div>
    </div>
  );
}

/* ————— Season strip — the standard labelled colour-banded bar component ————— */
function SeasonStrip({ bank }) {
  const max = Math.max(...SEASON.map(([, v]) => v));
  const tot = SEASON.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="rounded-2xl border p-4 flex items-end gap-4" style={{ background: T.card, borderColor: T.line }}>
      <div className="flex flex-col gap-1.5">
        <Label color={T.green}>Season · actual by GW</Label>
        <div className="flex items-end gap-2.5" style={{ height: 64 }}>
          {SEASON.map(([gw, v]) => (
            <div key={gw} className="flex flex-col items-center justify-end gap-1" style={{ width: 26, height: 64 }}>
              <span className="leading-none font-bold" style={{ color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{v}</span>
              <div className="rounded-sm w-full" style={{ height: Math.max(10, ((v - 40) / (max - 40)) * 34), background: teamBand(v) }} />
              <span className="leading-none font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{gw}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2 pb-1">
        <div className="flex flex-col items-center gap-1">
          <Label>Total</Label>
          <Plate h={34} w={64} bg={T.bgRaise}>{tot}</Plate>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Label>Rank</Label>
          <Plate h={34} w={120} bg={T.bgRaise}>214,381 <span style={{ color: T.green, marginLeft: 4 }}>▲96k</span></Plate>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Label>Bank</Label>
          <Plate h={34} w={64} bg={T.bgRaise}>£{bank.toFixed(1)}</Plate>
        </div>
      </div>
    </div>
  );
}

/* ————— Shirt menu: captain / vice / sell & replace ————— */
function SlotMenu({ p, isBench, captainN, viceN, setCap, setVice, startReplace, onClose }) {
  const Btn = ({ onClick, children, accent }) => (
    <button onClick={onClick} className="h-11 rounded-xl font-bold px-4 text-left"
      style={{ background: T.card, color: accent || "#FFFFFF", border: `1px solid ${T.line}`, fontFamily: FB, fontSize: 14.5 }}>
      {children}
    </button>
  );
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(6,0,10,0.7)" }} onClick={onClose}>
      <div className="rounded-2xl border p-5 flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}
        style={{ background: T.bgRaise, borderColor: T.line, width: 330 }}>
        <div className="flex items-center gap-3 pb-2">
          <Kit team={p.team} size={30} captain={captainN === p.n} vice={viceN === p.n} />
          <div>
            <div className="font-bold leading-none" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 17 }}>{p.n}</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
              {p.team} · {p.pos} · £{p.price.toFixed(1)} · NEXT {TEAM_NEXT[p.team]}
            </div>
            {p.risk && <div className="mt-1 font-bold" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>⚑ {p.risk}</div>}
          </div>
        </div>
        {!isBench && (captainN === p.n
          ? <Btn onClick={() => { setCap(null); onClose(); }}>Remove captaincy</Btn>
          : <Btn onClick={() => { setCap(p.n); onClose(); }}>Make captain <span style={{ color: T.green }}>C</span></Btn>)}
        {!isBench && (viceN === p.n
          ? <Btn onClick={() => { setVice(null); onClose(); }}>Remove vice</Btn>
          : <Btn onClick={() => { setVice(p.n); onClose(); }}>Make vice-captain <span style={{ color: T.dim }}>V</span></Btn>)}
        {isBench && (
          <div className="font-bold px-1" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
            CAPTAINCY IS XI ONLY
          </div>
        )}
        <Btn accent={T.green} onClick={() => { startReplace(p); onClose(); }}>Sell & replace <ArrowRight size={14} style={{ display: "inline", marginLeft: 4 }} /></Btn>
      </div>
    </div>
  );
}

/* ————— Replace modal — same-position candidates ranked, net Δ per swap ————— */
function ReplaceModal({ out, squad, bank, doReplace, onClose }) {
  const [q, setQ] = useState("");
  const budget = bank + out.price;
  const list = POOL[out.pos]
    .filter((p) => !squad.some((x) => x.n === p.n))
    .filter((p) => (p.n + " " + p.team).toLowerCase().includes(q.toLowerCase()))
    .map((p) => ({ ...p, pos: out.pos, d6: (p.xp - out.xp) * 6 }))
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
          <button onClick={onClose} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: T.line }}>
            <X size={16} color={T.dim} />
          </button>
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
                <Plate w={78}>{TEAM_NEXT[p.team]}</Plate>
                <Plate w={64} color={T.green}>xP {p.xp.toFixed(1)}</Plate>
                <Plate w={70} color={p.d6 >= 0 ? T.green : T.pink}>{p.d6 >= 0 ? "+" : ""}{p.d6.toFixed(1)} /6GW</Plate>
                <span className="rounded-lg px-2 flex items-center font-bold" style={{ background: T.value, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 30 }}>
                  VAL {(p.xp / p.price * 10).toFixed(1)}
                </span>
                {p.risk && <span className="font-bold" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }} title={p.risk}>⚑</span>}
                <button disabled={!ok} onClick={() => doReplace(out, p)} className="ml-auto flex items-center gap-1 rounded-full px-3.5 h-8 font-bold"
                  style={{ background: ok ? T.green : T.bgRaise, color: ok ? "#04130A" : T.faint, border: ok ? "none" : `1px solid ${T.line}`, fontFamily: FB, fontSize: 12.5 }}>
                  SWAP IN
                </button>
              </div>
            );
          })}
          {list.length === 0 && (
            <div className="py-8 text-center font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 15 }}>No players match.</div>
          )}
        </div>
        <footer className="px-5 py-3 border-t font-bold" style={{ borderColor: T.line, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          INFORMATIONAL ONLY — TRANSFERS ARE MADE IN THE OFFICIAL FPL APP
        </footer>
      </div>
    </div>
  );
}

/* ————— Right column module 1: captaincy comparison ————— */
function Captaincy({ squad, captainN, setCap }) {
  const xiOnly = [];
  ["GK", "DEF", "MID", "FWD"].forEach((pos) => {
    xiOnly.push(...squad.filter((p) => p.pos === pos).slice(0, XI_PLAN[pos]));
  });
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

/* ————— Right column module 2: transfers plan ————— */
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

/* ————— Right column module 3: chips wall ————— */
function Chips() {
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

/* ————— Analyst drawer (Squad context) ————— */
function AnalystDrawer({ onClose, toast }) {
  const [fired, setFired] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(6,0,10,0.6)" }} onClick={onClose}>
      <aside className="h-full flex flex-col border-l" onClick={(e) => e.stopPropagation()} style={{ width: 560, background: T.bgRaise, borderColor: T.line }}>
        <header className="flex items-center justify-between px-7 py-6 border-b" style={{ borderColor: T.line }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>✦ The Analyst</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>Squad · GW8 · 14 memory records</div>
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
              The payload includes your current 15, planned transfers with deltas, captaincy table, chips state, and memory. Mock response — nothing connected, nothing charged.
            </p>
          ) : (
            <>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                Wood's rested flag (0.5) into NFO's home run is the live decision: benching him for Strand Larsen costs −0.1 xP on the point estimate but removes a coin-flip start. Memory (gw4, bench_call): the equivalent call on Larsen returned +3 actual. Process-positive either way.
              </p>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                Captaincy table is honest: Haaland's E×2 15.6 at EO 82% is rank-neutral insurance. Saka at 44% EO into bou (A) carries +14k rank-EV upside but the ARS swing already concentrates your risk in one club — three starters plus the captain armband would be 4× single-club exposure.
              </p>
              <p className="font-bold" style={{ color: T.green, fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                THE LEVER: hold Haaland's armband, start Larsen over Wood, bank the transfer — spend it GW9 when the Hall doubt resolves.
              </p>
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

const NAV = [
  { id: "Dashboard", icon: LayoutGrid },
  { id: "Squad", icon: ShirtIcon },
  { id: "Builder", icon: Hammer },
  { id: "Players", icon: Users },
  { id: "Analysis", icon: BarChart3 },
  { id: "News", icon: Newspaper },
];

function Stub({ name, back }) {
  const approved = name === "Dashboard" || name === "Builder";
  return (
    <div className="flex flex-col items-start gap-5 pt-20 max-w-xl">
      <h2 className="uppercase" style={{ ...D, color: "#FFFFFF", fontSize: 42 }}>{name}</h2>
      <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 17, lineHeight: 1.6 }}>
        {approved ? `Approved — final version lives in ${name.toLowerCase()}-mockup.jsx.` : "Built after the Squad page is approved. Spec lives in 03-ui.md §3."}
      </p>
      <button onClick={back} className="px-6 h-12 rounded-full font-bold" style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
        BACK TO SQUAD
      </button>
    </div>
  );
}

/* ————— App ————— */
export default function App() {
  const [page, setPage] = useState("Squad");
  const [squad, setSquad] = useState(START_SQUAD);
  const [captainN, setCaptainN] = useState("Haaland");
  const [viceN, setViceN] = useState("Saka");
  const [transfers, setTransfers] = useState([]);
  const [menuP, setMenuP] = useState(null); // { player, bench }
  const [replaceOut, setReplaceOut] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400); }, []);
  const bank = useMemo(() => START_BANK + transfers.reduce((s, t) => s + t.outP.price - t.inP.price, 0), [transfers]);

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

  const doReplace = useCallback((out, inP) => {
    setSquad((sq) => sq.map((p) => (p.n === out.n ? inP : p)));
    setTransfers((ts) => [...ts, { outP: out, inP }]);
    setCaptainN((c) => (c === out.n ? null : c));
    setViceN((v) => (v === out.n ? null : v));
    setReplaceOut(null);
    toast(`${out.n} → ${inP.n} planned`);
  }, [toast]);

  const undo = useCallback((t) => {
    setSquad((sq) => {
      if (!sq.some((p) => p.n === t.inP.n)) { toast("Undo the later transfer first"); return sq; }
      setTransfers((ts) => ts.filter((x) => x.inP.n !== t.inP.n));
      toast(`${t.outP.n} restored`);
      return sq.map((p) => (p.n === t.inP.n ? t.outP : p));
    });
  }, [toast]);

  const reset = useCallback(() => {
    setSquad(START_SQUAD); setTransfers([]); setCaptainN("Haaland"); setViceN("Saka");
    toast("Plan reset to your live squad");
  }, [toast]);

  const refresh = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => { setSpinning(false); toast("Refreshed — picks, prices, injuries and ownership updated"); }, 900);
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
              <h1 className="leading-none mt-2 uppercase" style={{ ...D, color: "#FFFFFF", fontSize: 40 }}>{page}</h1>
            </div>
            <span className="flex items-center px-4 rounded-full font-bold leading-none mb-1"
              style={{ background: T.card, color: "#FFFFFF", border: `1px solid ${T.line}`, fontFamily: FN, fontWeight: FNW, fontSize: 13, height: 34 }}>
              GW8 DEADLINE · SAT 11:00 · <span style={{ color: T.green, marginLeft: 5 }}>2D 14H</span>
            </span>
          </header>

          {page === "Squad" ? (
            <div className="flex gap-5 items-start">
              <div className="flex-1 flex flex-col gap-4">
                <SeasonStrip bank={bank} />
                <Pitch squad={squad} captainN={captainN} viceN={viceN} openMenu={(p, bench) => setMenuP({ player: p, bench })} />
              </div>
              <div className="flex flex-col gap-4" style={{ width: 340 }}>
                <Captaincy squad={squad} captainN={captainN} setCap={setCap} />
                <TransferPlan transfers={transfers} bank={bank} undo={undo} reset={reset} />
                <Chips />
              </div>
            </div>
          ) : (
            <Stub name={page} back={() => setPage("Squad")} />
          )}
        </div>
      </main>

      {menuP && <SlotMenu p={menuP.player} isBench={menuP.bench} captainN={captainN} viceN={viceN} setCap={setCap} setVice={setVice}
        startReplace={setReplaceOut} onClose={() => setMenuP(null)} />}
      {replaceOut && <ReplaceModal out={replaceOut} squad={squad} bank={bank} doReplace={doReplace} onClose={() => setReplaceOut(null)} />}
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
