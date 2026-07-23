import React, { useState, useCallback, useMemo } from "react";
import {
  LayoutGrid, Shirt as ShirtIcon, Hammer, Users, BarChart3, Newspaper,
  RefreshCw, Sparkles, TrendingUp, TrendingDown, ChevronRight, X, Copy,
} from "lucide-react";

/* ————— TYPE SYSTEM — FINAL, LOCKED (Louis, 23 Jul) —————
   DISPLAY · MICHROMA — LOCKED (titles, heroes, team codes, wordmark).
   BODY    · OUTFIT   — LOCKED (card titles, names, buttons, prose).
   NUMBERS · MARTIAN MONO 800 — LOCKED (all data + micro-labels).
   GLOBAL FLOOR: nothing renders under 12px. */
const FB = "'Outfit',sans-serif";
const D = { fontFamily: "'Michroma',sans-serif", fontWeight: 400 };
const FN = "'Martian Mono',monospace"; // NUMBERS — LOCKED
const FNW = 800;

const T = {
  bg: "#0D0014", bgRaise: "#16021F", card: "#1E0630", line: "#3A1150",
  text: "#F7F4FA", dim: "#B4A3C6", faint: "#8A76A3",
  green: "#00FF85", cyan: "#04F5FF", pink: "#E90052",
};

const KITS = {
  ARS: ["#EF0107", "#FFFFFF"], LIV: ["#C8102E", "#8E0C20"], MUN: ["#DA291C", "#1A1A1A"],
  NFO: ["#E53233", "#E53233"], BOU: ["#B50E12", "#000000"], BRE: ["#E30613", "#FFFFFF"],
  MCI: ["#6CABDD", "#6CABDD"], CHE: ["#034694", "#034694"], EVE: ["#003399", "#003399"],
  BHA: ["#0057B8", "#FFFFFF"], CRY: ["#1B458F", "#C4122E"], TOT: ["#FFFFFF", "#132257"],
  NEW: ["#241F20", "#FFFFFF"], FUL: ["#FFFFFF", "#000000"], WOL: ["#FDB913", "#FDB913"],
  AVL: ["#670E36", "#95BFE5"], WHU: ["#7A263A", "#1BB1E7"], SUN: ["#EB172B", "#FFFFFF"],
  BUR: ["#6C1D45", "#99D6EA"], LEE: ["#FFFFFF", "#1D428A"],
};

function Kit({ team, size = 28, captain = false }) {
  const [body, sleeve] = KITS[team] || ["#31114A", "#31114A"];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size * 0.9 }}>
      <svg viewBox="0 0 40 36" width={size} height={size * 0.9}>
        <path d="M13 2 L16 4 Q20 6.5 24 4 L27 2 L38 8 L34 16 L28 12.5 L28 34 L12 34 L12 12.5 L6 16 L2 8 Z"
          fill={body} stroke="rgba(255,255,255,0.14)" strokeWidth="0.8" />
        <path d="M13 2 L2 8 L6 16 L12 12.5 L12 5 Z" fill={sleeve} />
        <path d="M27 2 L38 8 L34 16 L28 12.5 L28 5 Z" fill={sleeve} />
        <path d="M16 4 Q20 6.5 24 4" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.4" />
      </svg>
      {captain && (
        <span className="absolute flex items-center justify-center rounded-full"
          style={{ top: -4, right: -4, width: 15, height: 15, fontSize: 10, fontWeight: 800, lineHeight: 1, background: T.green, color: "#04130A", fontFamily: FB }}>
          C
        </span>
      )}
    </div>
  );
}

/* ————— MOCK DATA — one consistent GW7→GW8 state ————— */
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
  { n: "Semenyo", team: "BOU", pos: "MID", price: 7.3, last3: [12, 15, 11], next: "BRE (H)", ep: 5.3 },
  { n: "Gyökeres", team: "ARS", pos: "FWD", price: 9.4, last3: [13, 9, 16], next: "bou (A)", ep: 6.4 },
  { n: "Mbeumo", team: "MUN", pos: "MID", price: 8.4, last3: [10, 7, 14], next: "EVE (H)", ep: 5.6 },
  { n: "Muñoz", team: "CRY", pos: "DEF", price: 5.6, last3: [8, 12, 9], next: "ful (A)", ep: 4.2 },
];

const SWINGS = [
  { team: "ARS", dir: "EASING", from: 3.8, to: 2.4, own: "Raya · Gabriel · Saka", next: [["bou", 2], ["WOL", 2], ["eve", 3], ["SUN", 2], ["bre", 3]] },
  { team: "CHE", dir: "BRUTAL", from: 2.6, to: 4.4, own: "Palmer", next: [["LIV", 5], ["mci", 5], ["ARS", 4], ["new", 4], ["AVL", 4]] },
  { team: "NEW", dir: "EASING", from: 3.6, to: 2.4, own: "—", next: [["wol", 2], ["BUR", 2], ["ful", 3], ["EVE", 3], ["bou", 2]] },
];

const DB = {
  ALL: [
    { n: "Haaland", team: "MCI", ep: 7.8, pts: 61, price: 14.2 },
    { n: "Semenyo", team: "BOU", ep: 5.3, pts: 57, price: 7.3 },
    { n: "Saka", team: "ARS", ep: 6.1, pts: 54, price: 10.8 },
    { n: "Palmer", team: "CHE", ep: 4.1, pts: 52, price: 10.6 },
    { n: "Gyökeres", team: "ARS", ep: 6.4, pts: 49, price: 9.4 },
  ],
  GK: [
    { n: "Raya", team: "ARS", ep: 4.9, pts: 34, price: 5.7 },
    { n: "Sánchez", team: "CHE", ep: 3.1, pts: 31, price: 5.0 },
    { n: "Sels", team: "NFO", ep: 4.0, pts: 30, price: 5.2 },
    { n: "Pope", team: "NEW", ep: 4.3, pts: 27, price: 5.4 },
    { n: "Verbruggen", team: "BHA", ep: 3.8, pts: 26, price: 4.6 },
  ],
  DEF: [
    { n: "Muñoz", team: "CRY", ep: 4.2, pts: 41, price: 5.6 },
    { n: "Gabriel", team: "ARS", ep: 5.0, pts: 39, price: 6.3 },
    { n: "Timber", team: "ARS", ep: 4.8, pts: 36, price: 6.0 },
    { n: "Van Dijk", team: "LIV", ep: 4.4, pts: 33, price: 6.4 },
    { n: "Aina", team: "NFO", ep: 3.9, pts: 31, price: 5.1 },
  ],
  MID: [
    { n: "Semenyo", team: "BOU", ep: 5.3, pts: 57, price: 7.3 },
    { n: "Saka", team: "ARS", ep: 6.1, pts: 54, price: 10.8 },
    { n: "Palmer", team: "CHE", ep: 4.1, pts: 52, price: 10.6 },
    { n: "Mbeumo", team: "MUN", ep: 5.6, pts: 46, price: 8.4 },
    { n: "Salah", team: "LIV", ep: 6.6, pts: 45, price: 14.3 },
  ],
  FWD: [
    { n: "Haaland", team: "MCI", ep: 7.8, pts: 61, price: 14.2 },
    { n: "Gyökeres", team: "ARS", ep: 6.4, pts: 49, price: 9.4 },
    { n: "Isak", team: "LIV", ep: 6.0, pts: 44, price: 10.6 },
    { n: "Wood", team: "NFO", ep: 4.6, pts: 38, price: 7.6 },
    { n: "Watkins", team: "AVL", ep: 4.9, pts: 35, price: 8.7 },
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
  ["p", "Semenyo: top-10k EO 12.4% vs your GW8 projection 5.3 (p75 8.9, P(12+) 21%). As captain vs Haaland (EO 82%, E[2×] 13.8, P(12+) 41%): captain rank-EV +31k vs −2k. The tail deficit is real but ownership asymmetry dominates at your rank band — memory (gw5, captaincy_outcome): the Saka pivot cost −7 actual, graded +18k rank-EV. Correct process, variance outcome."],
  ["p", "Disagreement with model output: transfer comparison ranks Aina (5.1, EP6 25.4) over Muñoz (5.6, EP6 24.9) on a 0.5 EP6 edge. That edge sits inside the covariance noise band and Muñoz is your only CRY exposure ahead of their 2.1-FDR run. I weight the swing over the point estimate."],
  ["p", "ARS swing (3.8 → 2.4 avg FDR) is the strongest structural signal in the payload: you hold Raya, Gabriel, Saka. Strategy finding S-07 (double-defence in sub-2.5 runs, +0.9 pts/GW pooled over 3 seasons) supports Timber over a fifth midfielder."],
  ["lever", "THE LEVER: take Timber this week ahead of the ARS run and push Muñoz→Aina to GW9 — projected +2.3 EP6, rank-EV +9k, zero hit."],
];

/* ————— Atoms ————— */
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

function SeasonBar() {
  const stats = [
    ["BANK", "£1.3"], ["TEAM VALUE", "£101.2"], ["FREE TRANSFERS", "2"],
    ["CHIPS · SET 1", "4/4 → GW19"], ["GW7 AVERAGE", "54"], ["OVERALL RANK", "214,381 ▲96k"],
  ];
  return (
    <div className="rounded-2xl border grid grid-cols-6" style={{ background: T.card, borderColor: T.line }}>
      {stats.map(([label, value], i) => (
        <div key={label} className="px-4 py-3" style={{ borderLeft: i ? `1px solid ${T.line}` : "none" }}>
          <div className="font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>{label}</div>
          <div className="font-bold mt-1 leading-none whitespace-nowrap" style={{ color: T.text, fontFamily: FN, fontWeight: FNW, fontSize: 18 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function Trending() {
  const max = 17;
  return (
    <Card eyebrow="Trending players" title="Back-to-back form" accent={T.green}>
      {TRENDING.map((p) => {
        const tot = p.last3.reduce((a, b) => a + b, 0);
        return (
          <div key={p.n} className="flex items-center gap-3.5 rounded-xl px-3.5" style={{ background: T.bgRaise, height: 60 }}>
            <Kit team={p.team} size={26} />
            <div className="w-40">
              <div className="font-bold leading-none" style={{ color: T.text, fontFamily: FB, fontSize: 16 }}>{p.n}</div>
              <div className="mt-1.5" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{p.team} · {p.pos} · £{p.price.toFixed(1)}</div>
            </div>
            <div className="flex items-end gap-1" style={{ height: 28 }}>
              {p.last3.map((v, i) => (
                <div key={i} className="w-3 flex flex-col justify-end" style={{ height: 28 }}>
                  <div className="rounded-sm" style={{ height: `${(v / max) * 100}%`, background: T.green, opacity: 0.45 + i * 0.27 }} />
                </div>
              ))}
            </div>
            <div className="w-14" style={{ fontFamily: FN }}>
              <span className="leading-none" style={{ color: T.green, fontSize: 18, fontWeight: FNW }}>{tot}</span>
              <span className="block mt-0.5" style={{ color: T.faint, fontSize: 12 }}>3 GW</span>
            </div>
            <div className="ml-auto text-right" style={{ fontFamily: FN }}>
              <div className="font-bold uppercase" style={{ color: T.faint, fontSize: 12, letterSpacing: "0.1em" }}>Next</div>
              <div className="mt-1 leading-none" style={{ color: T.text, fontSize: 14 }}>
                {p.next} · <b style={{ color: T.green }}>EP {p.ep.toFixed(1)}</b>
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function PitchPlayer({ p, out }) {
  const disp = p.c ? p.pts * 2 : p.pts;
  return (
    <div className="flex flex-col items-center" style={{ width: 64, opacity: out ? 0.35 : 1 }}>
      <Kit team={p.team} size={30} captain={p.c} />
      <div className="mt-1 truncate w-full text-center font-semibold leading-tight" style={{ color: T.text, fontFamily: FB, fontSize: 12 }}>{p.n}</div>
      <div className="font-bold leading-none" style={{ color: out ? T.pink : disp >= 8 ? T.green : T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>
        {out ? "0′" : disp}
      </div>
    </div>
  );
}

function MyTeam() {
  const { subs, actual, subbedOut, subbedIn } = useMemo(() => applyAutosubs(XI, BENCH), []);
  const delta = actual - PROJECTED;
  const rows = ["FWD", "MID", "DEF", "GK"].map((pos) => XI.filter((p) => p.pos === pos)); // GK at the bottom
  return (
    <Card eyebrow="My team · GW7 final" title="Projected vs actual" accent={T.green}>
      <div className="flex items-end justify-center gap-5 pb-1">
        <div className="text-center">
          <div className="uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.14em" }}>Projected</div>
          <div className="leading-none mt-1" style={{ ...D, color: T.dim, fontSize: 46 }}>{PROJECTED}</div>
        </div>
        <div className="pb-2 text-xl leading-none" style={{ color: T.faint }}>→</div>
        <div className="text-center">
          <div className="uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.14em" }}>Actual</div>
          <div className="leading-none mt-1" style={{ ...D, color: T.green, fontSize: 46 }}>{actual}</div>
        </div>
        <div className="mb-1.5 flex items-center justify-center rounded-full font-bold leading-none"
          style={{ background: "#06331D", color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 14, height: 26, minWidth: 44, padding: "0 9px" }}>
          {delta >= 0 ? `+${delta}` : delta}
        </div>
      </div>

      <div className="rounded-xl px-2 pt-3 pb-2.5 flex flex-col gap-2" style={{ background: T.bgRaise }}>
        {rows.map((row, i) => (
          <div key={i} className="flex justify-center gap-2.5">
            {row.map((p) => <PitchPlayer key={p.n} p={p} out={subbedOut.has(p.n)} />)}
          </div>
        ))}
        <div className="mt-1 pt-2.5 flex items-center gap-2.5 border-t" style={{ borderColor: T.line }}>
          <span className="font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>Bench</span>
          {BENCH.map((b, i) => {
            const isIn = subbedIn.has(b.n);
            return (
              <div key={b.n} className="flex items-center gap-2 rounded-lg px-2.5" style={{ height: 34, background: isIn ? "#06331D" : "transparent", border: `1px solid ${isIn ? T.green : T.line}` }}>
                <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{b.pos === "GK" ? "GK" : i}</span>
                <Kit team={b.team} size={17} />
                <span className="font-semibold" style={{ color: T.text, fontFamily: FB, fontSize: 13 }}>{b.n}</span>
                <span className="font-bold" style={{ color: isIn ? T.green : T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>{b.pts}</span>
              </div>
            );
          })}
          {subs.map((s) => (
            <span key={s.in} className="ml-auto" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
              AUTO-SUB {s.in} ▸ {s.out} 0′
            </span>
          ))}
        </div>
      </div>
    </Card>
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
            <div className="ml-auto text-right">
              <div className="leading-none" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 14 }}>
                {s.from.toFixed(1)} → <b style={{ color: easing ? T.green : T.pink }}>{s.to.toFixed(1)}</b>
              </div>
              <div className="mt-1.5" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
                OWN <span style={{ color: s.own === "—" ? T.faint : T.text }}>{s.own}</span>
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
      <div className="flex flex-col">
        <div className="grid grid-cols-12 px-3.5 pb-1.5 uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>
          <span className="col-span-5">Player</span>
          <span className="col-span-2 text-right">GW8 EP</span>
          <span className="col-span-2 text-right">Pts</span>
          <span className="col-span-1 text-right">£m</span>
          <span className="col-span-2 text-right">Pts/£</span>
        </div>
        {DB[pos].map((p, i) => (
          <div key={p.n} className="grid grid-cols-12 items-center px-3.5 rounded-lg" style={{ background: i % 2 ? "transparent" : T.bgRaise, fontFamily: FN, fontWeight: FNW, height: 42 }}>
            <div className="col-span-5 flex items-center gap-2.5">
              <Kit team={p.team} size={19} />
              <span className="font-bold" style={{ color: T.text, fontFamily: FB, fontSize: 15 }}>{p.n}</span>
              <span style={{ color: T.faint, fontSize: 12 }}>{p.team}</span>
            </div>
            <div className="col-span-2 text-right" style={{ color: T.green, fontSize: 15, fontWeight: FNW }}>{p.ep.toFixed(1)}</div>
            <div className="col-span-2 text-right" style={{ color: T.text, fontSize: 15 }}>{p.pts}</div>
            <div className="col-span-1 text-right" style={{ color: T.dim, fontSize: 14 }}>{p.price.toFixed(1)}</div>
            <div className="col-span-2 text-right" style={{ color: T.dim, fontSize: 14 }}>{(p.pts / p.price).toFixed(1)}</div>
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
            <span style={{ color: T.text, fontFamily: FB, fontSize: 14 }}>{label}</span>
            <span className="flex items-center gap-2 text-right" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: T.green }} />{when}
            </span>
          </div>
        ))}
        <div className="pt-1.5 border-t" style={{ color: T.faint, borderColor: T.line, fontFamily: FB, fontSize: 12.5 }}>
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
            <div className="mt-1" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>Dashboard · GW8 · 14 memory records</div>
          </div>
          <button onClick={onClose}><X size={20} color={T.dim} /></button>
        </header>
        <div className="px-7 py-5 flex gap-3 border-b" style={{ borderColor: T.line }}>
          <button onClick={() => setFired(true)} className="flex items-center gap-2 px-5 h-11 rounded-full font-bold"
            style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14, letterSpacing: "0.03em" }}>
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
            <p className="leading-relaxed" style={{ color: T.dim, fontFamily: FB, fontSize: 15 }}>
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
                  fontWeight: k === "lever" ? 700 : 400,
                  fontSize: k === "ctx" ? 13 : 15,
                }}>
                {txt}
              </p>
            ))
          )}
        </div>
        <footer className="px-7 py-4 border-t flex justify-between" style={{ borderColor: T.line, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
          <span>{fired ? "THIS CALL · $0.09" : "NO CALL FIRED"}</span>
          <span>JULY SPEND · $2.84 OF $8.00 CAP</span>
        </footer>
      </aside>
    </div>
  );
}

function Stub({ name, back }) {
  return (
    <div className="flex flex-col items-start gap-5 pt-20 max-w-xl">
      <h2 className="uppercase" style={{ ...D, color: T.text, fontSize: 46 }}>{name}</h2>
      <p className="leading-relaxed" style={{ color: T.dim, fontFamily: FB, fontSize: 17 }}>
        Built next — pending your approval of the Dashboard. Spec lives in 03-ui.md §3.
      </p>
      <button onClick={back} className="px-6 h-12 rounded-full font-bold" style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
        BACK TO DASHBOARD
      </button>
    </div>
  );
}

/* ————— App (desktop-only) ————— */
export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [spinning, setSpinning] = useState(false);
  const [fplAge, setFplAge] = useState("2 min ago");
  const [toastMsg, setToastMsg] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400); }, []);
  const refresh = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => { setSpinning(false); setFplAge("just now"); toast("Refreshed — prices, injuries, ownership and fixtures updated"); }, 900);
  }, [spinning, toast]);

  return (
    /* flex-row-reverse: the toolbar rail sits on the RIGHT edge, content on the left */
    <div className="min-h-screen w-full flex flex-row-reverse" style={{ background: T.bg, fontFamily: FB }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Michroma&family=Martian+Mono:wght@500;700;800&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ————— Left rail ————— */}
      <nav className="h-screen sticky top-0 flex flex-col border-l px-5 py-7" style={{ width: 240, background: T.bgRaise, borderColor: T.line }}>
        <div className="px-3 mb-7">
          <div className="leading-none" style={{ ...D, color: T.text, fontSize: 22 }}>FPL<span style={{ color: T.green }}>.</span></div>
          <div className="mt-1.5 uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.22em" }}>Rank one</div>
        </div>

        <div className="flex flex-col gap-1">
          {NAV.map(({ id, icon: Icon }) => {
            const active = page === id;
            return (
              <button key={id} onClick={() => setPage(id)}
                className="flex items-center gap-3 px-4 h-11 rounded-xl text-left font-bold"
                style={{ background: active ? T.card : "transparent", color: active ? T.green : T.dim, border: `1px solid ${active ? T.line : "transparent"}`, fontFamily: FB, fontSize: 15 }}>
                <Icon size={18} strokeWidth={active ? 2.6 : 2} /> {id}
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
          <div className="flex items-center gap-2" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.green }} /> ALL DATA FRESH
          </div>
          <div className="mt-1" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>Updated {fplAge} · view status</div>
        </button>
      </nav>

      {/* ————— Content ————— */}
      <main className="flex-1">
        <div className="mx-auto px-10 pb-14" style={{ maxWidth: 1480 }}>
          <header className="pt-8 pb-6 flex items-end justify-between">
            <div>
              <div className="font-bold uppercase" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.2em" }}>FPL 2026/27 · Campaign</div>
              <h1 className="leading-none mt-2 uppercase" style={{ ...D, color: T.text, fontSize: 44 }}>{page}</h1>
            </div>
            <span className="flex items-center px-4 rounded-full font-bold leading-none mb-1"
              style={{ background: T.card, color: T.text, border: `1px solid ${T.line}`, fontFamily: FN, fontWeight: FNW, fontSize: 13, height: 34 }}>
              GW8 DEADLINE · SAT 11:00 · <span style={{ color: T.green, marginLeft: 5 }}>2D 14H</span>
            </span>
          </header>

          {page === "Dashboard" ? (
            <div className="flex flex-col gap-4">
              <SeasonBar />
              <div className="grid grid-cols-2 gap-4">
                <Trending />
                <MyTeam />
                <Swings />
                <DbPreview goPlayers={() => setPage("Players")} />
              </div>
            </div>
          ) : (
            <Stub name={page} back={() => setPage("Dashboard")} />
          )}
        </div>
      </main>

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
