import React, { useState, useCallback, useMemo } from "react";
import {
  LayoutGrid, Shirt as ShirtIcon, Hammer, Users, BarChart3, Newspaper,
  RefreshCw, Sparkles, TrendingUp, TrendingDown, ChevronRight, X, Copy,
} from "lucide-react";

/* ————— LOCKED SYSTEM — Michroma · Outfit 600+ · Martian Mono 800 · white text only ————— */
const FB = "'Outfit',sans-serif";
const FN = "'Martian Mono',monospace";
const FNW = 800;
const D = { fontFamily: "'Michroma',sans-serif", fontWeight: 400 };

const T = {
  bg: "#0D0014", bgRaise: "#16021F", card: "#1E0630", line: "#3A1150",
  text: "#FFFFFF", dim: "rgba(255,255,255,0.85)", faint: "rgba(255,255,255,0.62)",
  green: "#00FF85", cyan: "#04F5FF", pink: "#E90052", cap: "#FF2ECC", value: "#FF2ECC",
};
const GRASS = "repeating-linear-gradient(0deg, #0B5A2E 0px, #0B5A2E 34px, #0A5029 34px, #0A5029 68px)";
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

function Kit({ team, size = 28, captain = false, vice = false }) {
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
      {vice && (
        <span className="absolute flex items-center justify-center rounded-full"
          style={{ top: -5, right: -5, width: 17, height: 17, fontSize: 12, fontWeight: 800, lineHeight: 1, background: "#FFFFFF", color: "#0D0014", fontFamily: FB }}>V</span>
      )}
    </div>
  );
}

/* ————— MOCK DATA — GW7 final, GW8 = next/live. One consistent fixture list. ————— */
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
/* Live GW8 demo state: early kickoffs done, rest to play */
const LIVE = { projected: 61, played: { Raya: 2, Gabriel: 6, "Van Dijk": 1, Saka: 8, Semenyo: 2 }, score: 19 };
const SEASON = [
  [1, 52, 49], [2, 55, 61], [3, 60, 54], [4, 57, 58], [5, 54, 47], [6, 59, 66], [7, 58, 71],
];

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

/* GW8 fixtures (consistent everywhere): BOU–ARS · MCI–WOL · LIV–EVE · MUN–NEW · CHE–CRY ·
   AVL–BRE · TOT–FUL · NFO–BHA · WHU–BUR · SUN–LEE */
const TRENDING = [
  { n: "Semenyo", team: "BOU", pos: "MID", price: 7.3, last3: [12, 15, 11], next: "ARS (H)", xp: 4.6 },
  { n: "Gyökeres", team: "ARS", pos: "FWD", price: 9.4, last3: [13, 9, 16], next: "bou (A)", xp: 6.4 },
  { n: "Mbeumo", team: "MUN", pos: "MID", price: 8.4, last3: [10, 7, 14], next: "NEW (H)", xp: 5.6 },
  { n: "Muñoz", team: "CRY", pos: "DEF", price: 5.6, last3: [8, 12, 9], next: "che (A)", xp: 3.7 },
  { n: "Isak", team: "LIV", pos: "FWD", price: 10.6, last3: [9, 11, 8], next: "EVE (H)", xp: 6.0 },
];

const SWINGS = [
  { team: "ARS", dir: "EASING", from: 3.8, to: 2.4, own: "Raya · Gabriel · Saka", next: [["bou", 2], ["WOL", 2], ["eve", 3], ["SUN", 2], ["bre", 3]] },
  { team: "CHE", dir: "BRUTAL", from: 2.6, to: 4.4, own: "Palmer", next: [["CRY", 3], ["mci", 5], ["ARS", 4], ["new", 4], ["AVL", 4]] },
  { team: "NEW", dir: "EASING", from: 3.6, to: 2.4, own: "—", next: [["mun", 3], ["BUR", 2], ["ful", 3], ["EVE", 3], ["bou", 2]] },
  { team: "AVL", dir: "BRUTAL", from: 2.9, to: 4.1, own: "Rogers", next: [["BRE", 3], ["LIV", 5], ["mci", 5], ["NEW", 4], ["che", 4]] },
];

const DB = {
  ALL: [
    { n: "Haaland", team: "MCI", xp: 7.8, pts: 61, price: 14.2 },
    { n: "Semenyo", team: "BOU", xp: 4.6, pts: 57, price: 7.3 },
    { n: "Saka", team: "ARS", xp: 6.1, pts: 54, price: 10.8 },
    { n: "Palmer", team: "CHE", xp: 4.5, pts: 52, price: 10.6 },
    { n: "Gyökeres", team: "ARS", xp: 6.4, pts: 49, price: 9.4 },
  ],
  GK: [
    { n: "Raya", team: "ARS", xp: 4.9, pts: 34, price: 5.7 },
    { n: "Sánchez", team: "CHE", xp: 3.9, pts: 31, price: 5.0 },
    { n: "Sels", team: "NFO", xp: 4.0, pts: 30, price: 5.2 },
    { n: "Pope", team: "NEW", xp: 3.6, pts: 27, price: 5.4 },
    { n: "Verbruggen", team: "BHA", xp: 3.4, pts: 26, price: 4.6 },
  ],
  DEF: [
    { n: "Muñoz", team: "CRY", xp: 3.7, pts: 41, price: 5.6 },
    { n: "Gabriel", team: "ARS", xp: 5.0, pts: 39, price: 6.3 },
    { n: "Timber", team: "ARS", xp: 4.8, pts: 36, price: 6.0 },
    { n: "Van Dijk", team: "LIV", xp: 4.6, pts: 33, price: 6.4 },
    { n: "Aina", team: "NFO", xp: 4.0, pts: 31, price: 5.1 },
  ],
  MID: [
    { n: "Semenyo", team: "BOU", xp: 4.6, pts: 57, price: 7.3 },
    { n: "Saka", team: "ARS", xp: 6.1, pts: 54, price: 10.8 },
    { n: "Palmer", team: "CHE", xp: 4.5, pts: 52, price: 10.6 },
    { n: "Mbeumo", team: "MUN", xp: 5.6, pts: 46, price: 8.4 },
    { n: "Salah", team: "LIV", xp: 6.6, pts: 45, price: 14.3 },
  ],
  FWD: [
    { n: "Haaland", team: "MCI", xp: 7.8, pts: 61, price: 14.2 },
    { n: "Gyökeres", team: "ARS", xp: 6.4, pts: 49, price: 9.4 },
    { n: "Isak", team: "LIV", xp: 6.0, pts: 44, price: 10.6 },
    { n: "Wood", team: "NFO", xp: 4.4, pts: 38, price: 7.6 },
    { n: "Watkins", team: "AVL", xp: 4.4, pts: 35, price: 8.7 },
  ],
};

const NAV = [
  { id: "Dashboard", icon: LayoutGrid },
  { id: "Squad", icon: ShirtIcon },
  { id: "Builder", icon: Hammer },
  { id: "Players", icon: Users },
  { id: "Analysis", icon: BarChart3 },
  { id: "News", icon: Newspaper },
];

const MOCK_ANALYST = [
  ["ctx", "CONTEXT · Dashboard · GW8 · 14 memory records loaded"],
  ["p", "Semenyo: top-10k EO 12.4% vs your GW8 projection 4.6 (p75 8.1, P(12+) 17%) into ARS (H). As captain vs Haaland (EO 82%, E[2×] 13.8, P(12+) 41%): captain rank-EV +31k vs −2k. Ownership asymmetry dominates at your rank band — memory (gw5, captaincy_outcome): the Saka pivot cost −7 actual, graded +18k rank-EV. Correct process, variance outcome."],
  ["p", "Disagreement with model output: transfer comparison ranks Aina (5.1, xP6 25.4) over Muñoz (5.6, xP6 24.9) on a 0.5 xP6 edge. That edge sits inside the covariance noise band and Muñoz is your only CRY exposure. I weight the swing over the point estimate."],
  ["p", "ARS swing (3.8 → 2.4 avg FDR) is the strongest structural signal in the payload: you hold Raya, Gabriel, Saka. Strategy finding S-07 (double-defence in sub-2.5 runs, +0.9 pts/GW pooled over 3 seasons) supports Timber over a fifth midfielder."],
  ["lever", "THE LEVER: take Timber this week ahead of the ARS run — projected +2.3 xP6, rank-EV +9k, zero hit."],
];

/* ————— Atoms ————— */
function Card({ eyebrow, title, accent, children, right, onClick }) {
  return (
    <section onClick={onClick} className={`rounded-2xl border p-5 flex flex-col gap-4 ${onClick ? "cursor-pointer" : ""}`}
      style={{ background: T.card, borderColor: T.line }}>
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
            style={{ background: T.bgRaise, height: 38, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 16 }}>
            {value}
          </div>
        </button>
      ))}
    </div>
  );
}

const barColor = (v) => (v >= 13 ? "#4DD6FF" : v >= 8 ? T.green : v >= 4 ? "#FFC94D" : "#FF5A5A");

function Trending({ onRow }) {
  const max = 17;
  return (
    <Card eyebrow="Trending players" title="Back-to-back form" accent={T.green}>
      {TRENDING.map((p) => {
        const tot = p.last3.reduce((a, b) => a + b, 0);
        return (
          <button key={p.n} onClick={() => onRow(p.n)} className="flex items-center gap-3.5 rounded-xl px-3.5 text-left transition-transform active:scale-[0.99]"
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
                {p.next} ·<span style={{ color: T.green, marginLeft: 5 }}>xP {p.xp.toFixed(1)}</span>
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
  const rows = ["FWD", "MID", "DEF", "GK"].map((pos) => XI.filter((p) => p.pos === pos)); // GK at the bottom
  const toPlay = XI.length - Object.keys(LIVE.played).length;
  return (
    <Card eyebrow={live ? "My team · GW8 live" : "My team · GW7 final"} title="Projected vs actual" accent={T.green}
      right={
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
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

/* ————— Season expansion modal — the pick tracker, simple and useful ————— */
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

function Swings() {
  return (
    <Card eyebrow="Fixture swings" title="Runs opening up" accent={T.pink}>
      {SWINGS.map((s) => {
        const easing = s.dir === "EASING";
        return (
          <div key={s.team} className="flex items-center gap-3.5 rounded-xl px-3.5" style={{ background: T.bgRaise, height: 60 }}>
            <span className="w-14 leading-none" style={{ ...D, color: T.text, fontSize: 16 }}>{s.team}</span>
            <span className="flex items-center justify-center gap-1 font-bold rounded-full leading-none"
              style={{ background: easing ? "#06331D" : "#3A0217", color: easing ? T.green : T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 26, padding: "0 10px" }}>
              {easing ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {s.dir}
            </span>
            <div className="flex gap-1.5">
              {s.next.map(([op, f], i) => (
                <span key={i} className="flex items-center justify-center font-bold rounded leading-none"
                  style={{ background: f <= 2 ? T.green : f === 3 ? "#6B5585" : f === 4 ? T.pink : "#B3003F", color: f <= 2 ? "#04130A" : "#FFF", fontFamily: FN, fontWeight: FNW, fontSize: 13, height: 26, minWidth: 38 }}>
                  {op}
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
          </div>
        );
      })}
    </Card>
  );
}

function DbPreview({ goPlayers }) {
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
        {Object.keys(DB).map((k) => (
          <button key={k} onClick={() => setPos(k)}
            className="px-4 h-8 rounded-full font-bold transition-transform active:scale-95"
            style={{
              background: pos === k ? T.green : T.bgRaise, color: pos === k ? "#04130A" : T.dim,
              border: `1px solid ${pos === k ? T.green : T.line}`, fontFamily: FB, fontSize: 12.5, letterSpacing: "0.04em",
            }}>
            {k}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="items-center px-2 uppercase font-bold" style={{ display: "grid", gridTemplateColumns: "1fr 64px 56px 56px 64px", gap: 6, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.06em" }}>
          <span>Player</span>
          <span className="text-center">GW8 xP</span>
          <span className="text-center">Pts</span>
          <span className="text-center">£m</span>
          <span className="text-center">Pts/£</span>
        </div>
        {DB[pos].map((p) => (
          <div key={p.n} className="items-center rounded-xl px-2" style={{ display: "grid", gridTemplateColumns: "1fr 64px 56px 56px 64px", gap: 6, background: T.bgRaise, height: 44 }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <Kit team={p.team} size={19} />
              <span className="font-bold truncate" style={{ color: T.text, fontFamily: FB, fontSize: 15 }}>{p.n}</span>
              <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team}</span>
            </div>
            {[[p.xp.toFixed(1), T.green], [p.pts, "#FFFFFF"], [p.price.toFixed(1), T.dim], [(p.pts / p.price).toFixed(1), T.dim]].map(([v, c], i) => (
              <div key={i} className="flex items-center justify-center rounded-lg font-bold leading-none"
                style={{ background: "#0D0014", height: 30, color: c, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>
                {v}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatusPopover({ onClose, fplAge }) {
  const rows = [
    ["Player prices, injuries & ownership", fplAge],
    ["Betting market (match odds)", "Thu 06:00 — next pull Fri 09:00"],
    ["Expected goals data", "Wed 05:00"],
    ["Press conference signals", "Fri 08:00"],
    ["Analyst spend this month", "$2.84 of $8.00 cap"],
  ];
  return (
    <div className="fixed inset-0 z-30" onClick={onClose}>
      <div className="absolute rounded-2xl border p-5 flex flex-col gap-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ bottom: 24, right: 256, width: 400, background: T.bgRaise, borderColor: T.line }}>
        <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.14em" }}>Data status</div>
        {rows.map(([label, when]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <span className="font-semibold" style={{ color: T.text, fontFamily: FB, fontSize: 14 }}>{label}</span>
            <span className="flex items-center gap-2 text-right font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: T.green }} />{when}
            </span>
          </div>
        ))}
        <div className="pt-1.5 border-t font-semibold" style={{ color: T.faint, borderColor: T.line, fontFamily: FB, fontSize: 12.5 }}>
          All fresh. Odds update on a fixed schedule to protect free-tier credits.
        </div>
      </div>
    </div>
  );
}

function AnalystDrawer({ onClose, toast }) {
  const [fired, setFired] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(6,0,10,0.6)" }} onClick={onClose}>
      <aside className="h-full flex flex-col border-l" onClick={(e) => e.stopPropagation()}
        style={{ width: 560, background: T.bgRaise, borderColor: T.line }}>
        <header className="flex items-center justify-between px-7 py-6 border-b" style={{ borderColor: T.line }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.14em" }}>✦ The Analyst</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>Dashboard · GW8 · 14 memory records</div>
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
              Fires only when you press Ask. The payload is built by code: squad, bank, chips, full
              projections with distributions, fixtures and odds, strategy findings, memory. This
              prototype shows a mock response — no API is connected and nothing can be charged.
            </p>
          ) : (
            MOCK_ANALYST.map(([k, txt], i) => (
              <p key={i} className="leading-relaxed"
                style={{
                  color: k === "lever" ? T.green : k === "ctx" ? T.dim : T.text,
                  fontFamily: k === "ctx" ? FN : FB,
                  fontWeight: k === "lever" ? 700 : 600,
                  fontSize: k === "ctx" ? 13 : 15.5,
                }}>
                {txt}
              </p>
            ))
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

function Stub({ name, back }) {
  return (
    <div className="flex flex-col items-start gap-5 pt-20 max-w-xl">
      <h2 className="uppercase" style={{ ...D, color: T.text, fontSize: 42 }}>{name}</h2>
      <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 17, lineHeight: 1.6 }}>
        Built next — pending Dashboard approval. Spec lives in 03-ui.md §3.
      </p>
      <button onClick={back} className="px-6 h-12 rounded-full font-bold" style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
        BACK TO DASHBOARD
      </button>
    </div>
  );
}

/* ————— App (desktop-only, rail on the right) ————— */
export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [spinning, setSpinning] = useState(false);
  const [fplAge, setFplAge] = useState("2 min ago");
  const [toastMsg, setToastMsg] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [live, setLive] = useState(false);

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400); }, []);
  const refresh = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => { setSpinning(false); setFplAge("just now"); toast(live ? "Refreshed — live points updated" : "Refreshed — prices, injuries, ownership and fixtures updated"); }, 900);
  }, [spinning, toast, live]);

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
          <div className="leading-none" style={{ ...D, color: T.text, fontSize: 20 }}>FPL<span style={{ color: T.green }}>.</span></div>
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
          <button onClick={refresh}
            className="flex items-center justify-center gap-2 h-11 rounded-full font-bold transition-transform active:scale-95"
            style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14, letterSpacing: "0.04em" }}>
            <RefreshCw size={15} style={spinning ? { animation: "spin 0.9s linear infinite" } : undefined} />
            {spinning ? "REFRESHING" : "REFRESH"}
          </button>
          <button onClick={() => setAskOpen(true)}
            className="flex items-center justify-center gap-2 h-11 rounded-full font-bold border transition-transform active:scale-95"
            style={{ background: T.card, color: T.green, borderColor: T.line, fontFamily: FB, fontSize: 14, letterSpacing: "0.04em" }}>
            <Sparkles size={14} /> ASK · ~$0.10
          </button>
        </div>
        <button onClick={() => setStatusOpen(true)} className="mt-auto text-left px-3 py-2.5 rounded-xl">
          <div className="flex items-center gap-2 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.green }} /> ALL DATA FRESH
          </div>
          <div className="mt-1 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Updated {fplAge} · view status</div>
        </button>
      </nav>

      {/* ————— Content ————— */}
      <main className="flex-1">
        <div className="mx-auto px-10 pb-14" style={{ maxWidth: 1480 }}>
          <header className="pt-8 pb-6 flex items-end justify-between">
            <div>
              <div className="font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.2em" }}>FPL 2026/27 · Campaign</div>
              <h1 className="leading-none mt-2 uppercase" style={{ ...D, color: T.text, fontSize: 40 }}>{page}</h1>
            </div>
            <span className="flex items-center px-4 rounded-full font-bold leading-none mb-1"
              style={{ background: T.card, color: T.text, border: `1px solid ${T.line}`, fontFamily: FN, fontWeight: FNW, fontSize: 13, height: 34 }}>
              GW8 DEADLINE · SAT 11:00 · <span style={{ color: T.green, marginLeft: 5 }}>2D 14H</span>
            </span>
          </header>

          {page === "Dashboard" ? (
            <div className="flex flex-col gap-4">
              <SeasonBar goSquad={() => setPage("Squad")} openSeason={() => setSeasonOpen(true)} />
              <div className="grid grid-cols-2 gap-4">
                <Trending onRow={(n) => toast(`${n} — profile opens with the Players page`)} />
                <MyTeam live={live} setLive={setLive} openSeason={() => setSeasonOpen(true)} />
                <Swings />
                <DbPreview goPlayers={() => setPage("Players")} />
              </div>
            </div>
          ) : (
            <Stub name={page} back={() => setPage("Dashboard")} />
          )}
        </div>
      </main>

      {seasonOpen && <SeasonModal onClose={() => setSeasonOpen(false)} />}
      {statusOpen && <StatusPopover onClose={() => setStatusOpen(false)} fplAge={fplAge} />}
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
