import React, { useState, useCallback, useMemo } from "react";
import {
  LayoutGrid, Shirt as ShirtIcon, Hammer, Users, BarChart3, Newspaper,
  RefreshCw, Sparkles, X, Copy, Search,
} from "lucide-react";

/* ————— LOCKED SYSTEM — Michroma (identity) · Outfit 600+ (body) · Martian Mono 800 (data)
   White text only · 12px floor · numbers centred on dark plates · green = projections/actions ·
   #E90052 = risk · #FF2ECC (white text) = captain/×2 + value · form bands red/amber/green/blue ·
   nav rail right · xP terminology. ————— */
const FB = "'Outfit',sans-serif";
const FN = "'Martian Mono',monospace";
const FNW = 800;
const D = { fontFamily: "'Michroma',sans-serif", fontWeight: 400 };

const T = {
  bg: "#0D0014", bgRaise: "#16021F", card: "#1E0630", line: "#3A1150",
  text: "#FFFFFF", dim: "rgba(255,255,255,0.85)", faint: "rgba(255,255,255,0.62)",
  green: "#00FF85", cyan: "#04F5FF", pink: "#E90052", value: "#FF2ECC",
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

function Kit({ team, size = 22 }) {
  const [body, sleeve] = KITS[team] || ["#31114A", "#31114A"];
  return (
    <div className="shrink-0" style={{ width: size, height: size * 0.9 }}>
      <svg viewBox="0 0 40 36" width={size} height={size * 0.9}>
        <path d="M13 2 L16 4 Q20 6.5 24 4 L27 2 L38 8 L34 16 L28 12.5 L28 34 L12 34 L12 12.5 L6 16 L2 8 Z"
          fill={body} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
        <path d="M13 2 L2 8 L6 16 L12 12.5 L12 5 Z" fill={sleeve} />
        <path d="M27 2 L38 8 L34 16 L28 12.5 L28 5 Z" fill={sleeve} />
        <path d="M16 4 Q20 6.5 24 4" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

/* ————— Fixture engine — pairwise-consistent 6 rounds, round 1 = the real GW8 list ————— */
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
const nextLabel = (team) => {
  const f = FIX[team][0];
  return f.home ? `${f.op} (H)` : `${f.op.toLowerCase()} (A)`;
};

/* ————— Player universe (~70 mock; real build = full FPL DB) ————— */
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
const MY_SQUAD = new Set(["Raya", "Gabriel", "Van Dijk", "Muñoz", "Saka", "Palmer", "Semenyo", "Mbeumo", "Rogers", "Haaland", "Wood", "Sels", "Timber", "O'Brien", "Strand Larsen"]);

/* Deterministic stat synthesis — stable numbers, no randomness between renders */
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
    PLAYERS.push({ n, team, pos, price, xp, risk, apps, pts, g, a, cs, own, form5, pstart, mins, val: xp / price * 10 });
  });
});

const barColor = (v) => (v >= 13 ? "#4DD6FF" : v >= 8 ? T.green : v >= 4 ? "#FFC94D" : "#FF5A5A");
const fdrBg = (f) => (f <= 2 ? T.green : f === 3 ? "#6B5585" : f === 4 ? T.pink : "#B3003F");

const Label = ({ children, color = T.dim }) => (
  <div className="font-bold uppercase" style={{ color, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.08em" }}>{children}</div>
);
const Plate = ({ children, color = "#FFFFFF", w, h = 30, bg = "#0D0014" }) => (
  <div className="flex items-center justify-center rounded-lg px-1.5 font-bold leading-none whitespace-nowrap"
    style={{ background: bg, height: h, minWidth: w, color, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
    {children}
  </div>
);

/* ————— Filters ————— */
const CLUBS = ["ALL", ...ORDER.slice().sort()];
const PRICES = ["ALL", 5.0, 6.0, 7.5, 9.0, 11.0];
const SORTS = ["xP", "PTS", "FORM", "VALUE", "OWN%", "PRICE ↑", "PRICE ↓", "NAME"];

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

/* ————— The table ————— */
const GRID = "minmax(180px,1fr) 76px 72px 60px 56px 44px 40px 40px 40px 52px 56px 64px";

const SORT_MAP = { Player: "NAME", Form: "FORM", "GW8 xP": "xP", Pts: "PTS", "Own%": "OWN%", Value: "VALUE" };
function HeaderRow({ sort, setSort }) {
  const cols = ["Player", "Next", "Form", "GW8 xP", "Price", "Apps", "G", "A", "CS", "Pts", "Own%", "Value"];
  return (
    <div className="items-center px-2 uppercase font-bold" style={{ display: "grid", gridTemplateColumns: GRID, gap: 6, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.04em", height: 28 }}>
      {cols.map((c, i) => {
        const key = c === "Price" ? (sort === "PRICE ↓" ? "PRICE ↓" : "PRICE ↑") : SORT_MAP[c];
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

function Row({ p, onOpen }) {
  return (
    <button onClick={() => onOpen(p)} className="items-center rounded-xl px-2 text-left transition-transform active:scale-[0.995]"
      style={{ display: "grid", gridTemplateColumns: GRID, gap: 6, background: T.bgRaise, height: 50 }}>
      <div className="flex items-center gap-2 min-w-0">
        <Kit team={p.team} size={20} />
        <span className="font-bold truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14.5 }}>{p.n}</span>
        <span className="font-bold shrink-0" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team} · {p.pos}</span>
        {MY_SQUAD.has(p.n) && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: T.green }} />}
        {p.risk && <span className="font-bold shrink-0" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }} title={p.risk}>⚑</span>}
      </div>
      <Plate>{nextLabel(p.team)}</Plate>
      <div className="flex items-end justify-center gap-0.5" style={{ height: 26 }}>
        {p.form5.map((v, i) => (
          <div key={i} className="rounded-sm" style={{ width: 9, height: Math.max(5, (Math.min(v, 17) / 17) * 26), background: barColor(v) }} />
        ))}
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

/* ————— Player profile drawer ————— */
function Profile({ p, onClose }) {
  const fan = { p10: Math.max(1, p.xp * 0.3), p50: p.xp, p90: p.xp * 2.2 };
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(6,0,10,0.6)" }} onClick={onClose}>
      <aside className="h-full flex flex-col border-l overflow-y-auto" onClick={(e) => e.stopPropagation()}
        style={{ width: 480, background: T.bgRaise, borderColor: T.line }}>
        <header className="flex items-start justify-between px-6 py-5 border-b sticky top-0" style={{ borderColor: T.line, background: T.bgRaise }}>
          <div className="flex items-center gap-3">
            <Kit team={p.team} size={38} />
            <div>
              <div className="font-bold leading-none" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 21 }}>{p.n}</div>
              <div className="mt-1.5 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
                {p.team} · {p.pos} · £{p.price.toFixed(1)} · OWN {p.own}%{MY_SQUAD.has(p.n) ? " · IN YOUR SQUAD" : ""}
              </div>
              {p.risk && <div className="mt-1 font-bold" style={{ color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>⚑ {p.risk}</div>}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full border flex items-center justify-center shrink-0" style={{ borderColor: T.line }}>
            <X size={16} color={T.dim} />
          </button>
        </header>

        <div className="px-6 py-5 flex flex-col gap-6">
          {/* GW8 projection fan */}
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

          {/* Next 6 fixtures with per-fixture xP */}
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

          {/* Form — the standard labelled colour-banded bars */}
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

          {/* Minutes */}
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

          {/* Season + value */}
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
        </div>
      </aside>
    </div>
  );
}

/* ————— Analyst drawer (Players context) ————— */
function AnalystDrawer({ onClose, toast }) {
  const [fired, setFired] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(6,0,10,0.6)" }} onClick={onClose}>
      <aside className="h-full flex flex-col border-l" onClick={(e) => e.stopPropagation()} style={{ width: 560, background: T.bgRaise, borderColor: T.line }}>
        <header className="flex items-center justify-between px-7 py-6 border-b" style={{ borderColor: T.line }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>✦ The Analyst</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>Players · GW8 · 14 memory records</div>
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
              The payload includes the current filter view, the players on screen with full stat lines, and memory. Mock response — nothing connected, nothing charged.
            </p>
          ) : (
            <>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                The value column is quietly screaming Semenyo (7.8 value at 38% EO) but the model's GW8 xP of 4.6 into ARS (H) is the right anchor — form-chasing him this week buys the fixture after, not this one.
              </p>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                In your filtered view, Aina (4.0 xP, £5.1, 3.4-FDR run) is the only sub-£5.5 defender whose next-6 per-fixture xP never drops below 3.5 — the flat profile matters more than the peak for a fifth defender.
              </p>
              <p className="font-bold" style={{ color: T.green, fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                THE LEVER: watchlist Aina for the GW9 free transfer; do nothing today.
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
  const approved = ["Dashboard", "Squad", "Builder"].includes(name);
  return (
    <div className="flex flex-col items-start gap-5 pt-20 max-w-xl">
      <h2 className="uppercase" style={{ ...D, color: "#FFFFFF", fontSize: 42 }}>{name}</h2>
      <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 17, lineHeight: 1.6 }}>
        {approved ? `Approved — final version lives in ${name.toLowerCase()}-mockup.jsx.` : "Built after the Players page is approved. Spec lives in 03-ui.md §3."}
      </p>
      <button onClick={back} className="px-6 h-12 rounded-full font-bold" style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
        BACK TO PLAYERS
      </button>
    </div>
  );
}

/* ————— App ————— */
export default function App() {
  const [page, setPage] = useState("Players");
  const [pos, setPos] = useState("ALL");
  const [q, setQ] = useState("");
  const [club, setClub] = useState("ALL");
  const [maxP, setMaxP] = useState("ALL");
  const [sort, setSort] = useState("xP");
  const [hideRisk, setHideRisk] = useState(false);
  const [mySquad, setMySquad] = useState(false);
  const [profileP, setProfileP] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400); }, []);
  const refresh = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => { setSpinning(false); toast("Refreshed — prices, injuries, ownership and fixtures updated"); }, 900);
  }, [spinning, toast]);

  const list = useMemo(() => {
    let l = PLAYERS;
    if (pos !== "ALL") l = l.filter((p) => p.pos === pos);
    if (q) l = l.filter((p) => (p.n + " " + p.team).toLowerCase().includes(q.toLowerCase()));
    if (club !== "ALL") l = l.filter((p) => p.team === club);
    if (maxP !== "ALL") l = l.filter((p) => p.price <= +maxP);
    if (hideRisk) l = l.filter((p) => !p.risk);
    if (mySquad) l = l.filter((p) => MY_SQUAD.has(p.n));
    const by = {
      "xP": (a, b) => b.xp - a.xp,
      "PTS": (a, b) => b.pts - a.pts,
      "FORM": (a, b) => b.form5.reduce((x, y) => x + y, 0) - a.form5.reduce((x, y) => x + y, 0),
      "VALUE": (a, b) => b.val - a.val,
      "OWN%": (a, b) => b.own - a.own,
      "PRICE ↑": (a, b) => a.price - b.price,
      "PRICE ↓": (a, b) => b.price - a.price,
      "NAME": (a, b) => a.n.localeCompare(b.n),
    }[sort];
    return [...l].sort(by);
  }, [pos, q, club, maxP, sort, hideRisk, mySquad]);

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

          {page === "Players" ? (
            <div className="flex flex-col gap-3">
              {/* Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {["ALL", "GK", "DEF", "MID", "FWD"].map((k) => (
                  <button key={k} onClick={() => setPos(k)} className="px-4 h-9 rounded-full font-bold"
                    style={{ background: pos === k ? T.green : T.card, color: pos === k ? "#04130A" : T.dim, border: `1px solid ${pos === k ? T.green : T.line}`, fontFamily: FB, fontSize: 13 }}>
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
                <Sel label="Club" value={club} options={CLUBS} onChange={setClub} />
                <Sel label="Max £" value={maxP} options={PRICES} onChange={setMaxP} />
                <Sel label="Sort" value={sort} options={SORTS} onChange={setSort} />
                <Toggle on={hideRisk} onClick={() => setHideRisk(!hideRisk)}>HIDE FLAGGED</Toggle>
                <Toggle on={mySquad} onClick={() => setMySquad(!mySquad)}>MY SQUAD</Toggle>
              </div>

              {/* Table */}
              <div className="rounded-2xl border p-3" style={{ background: T.card, borderColor: T.line }}>
                <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: "64vh" }}>
                  <div className="sticky top-0 z-10" style={{ background: T.card }}>
                    <HeaderRow sort={sort} setSort={setSort} />
                  </div>
                  {list.map((p) => <Row key={p.n} p={p} onOpen={setProfileP} />)}
                  {list.length === 0 && (
                    <div className="py-10 text-center font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 15 }}>No players match.</div>
                  )}
                </div>
              </div>
              <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
CLICK A ROW FOR THE FULL PROFILE · CLICK A COLUMN HEADER TO SORT · GREEN DOT = IN YOUR SQUAD
              </div>
            </div>
          ) : (
            <Stub name={page} back={() => setPage("Players")} />
          )}
        </div>
      </main>

      {profileP && <Profile p={profileP} onClose={() => setProfileP(null)} />}
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
