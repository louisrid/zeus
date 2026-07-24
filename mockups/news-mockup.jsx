import React, { useState, useCallback } from "react";
import {
  LayoutGrid, Shirt as ShirtIcon, Hammer, Users, BarChart3, Newspaper,
  RefreshCw, Sparkles, X, Copy, TrendingUp, TrendingDown,
} from "lucide-react";

/* ————— LOCKED SYSTEM — Michroma · Outfit 600+ · Martian Mono 800 · white text · 12px floor ·
   numbers on dark plates · green = positive · #E90052 = risk · #FF2ECC = captain/value · rail right. ————— */
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
        <path d="M13 2 L16 4 Q20 6.5 24 4 L27 2 L38 8 L34 16 L28 12.5 L28 34 L12 34 L12 12.5 L6 16 L2 8 Z" fill={body} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
        <path d="M13 2 L2 8 L6 16 L12 12.5 L12 5 Z" fill={sleeve} />
        <path d="M27 2 L38 8 L34 16 L28 12.5 L28 5 Z" fill={sleeve} />
        <path d="M16 4 Q20 6.5 24 4" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.4" />
      </svg>
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
const MY_SQUAD = new Set(["Raya", "Gabriel", "Van Dijk", "Muñoz", "Saka", "Palmer", "Semenyo", "Mbeumo", "Rogers", "Haaland", "Wood", "Sels", "Timber", "O'Brien", "Strand Larsen"]);

/* ————— Signal chip ————— */
const SIGNALS = {
  OUT: { bg: "#B3003F", fg: "#FFFFFF" },
  DOUBT: { bg: "#3A0217", fg: T.pink },
  RESTED: { bg: "#3A0217", fg: T.pink },
  CONFIRMED: { bg: "#06331D", fg: T.green },
  ROTATION: { bg: "#3A0217", fg: T.pink },
};
const Signal = ({ kind, conf }) => (
  <span className="flex items-center gap-1.5 rounded-full px-2.5 font-bold leading-none"
    style={{ background: SIGNALS[kind].bg, color: SIGNALS[kind].fg, fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 24 }}>
    {kind}{conf !== undefined && <span style={{ opacity: 0.8 }}>{conf.toFixed(1)}</span>}
  </span>
);

/* ————— Feed (reverse-chron, Haiku-parsed pressers grouped by club) ————— */
const FEED = [
  { t: "TODAY 09:12", kind: "PRESSERS", club: "NFO", items: [
    { p: "Wood", sig: "RESTED", conf: 0.5, line: "\u201CChris has played a lot of minutes — we will make a decision late.\u201D Parsed as rotation risk for BHA (H)." },
    { p: "Sels", sig: "CONFIRMED", conf: 0.9, line: "Named first-choice for the cup run and league — starts BHA (H)." },
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
function PresserCard({ item, myOnly }) {
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
            <span className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15 }}>{x.p}</span>
            {MY_SQUAD.has(x.p) && <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.green }} />}
            <Signal kind={x.sig} conf={x.conf} />
          </div>
          <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 14, lineHeight: 1.55 }}>{x.line}</p>
        </div>
      ))}
    </div>
  );
}

function PriceCard({ item, myOnly }) {
  const filt = (arr) => (myOnly ? arr.filter(([p]) => MY_SQUAD.has(p)) : arr);
  const rises = filt(item.rises), falls = filt(item.falls);
  if (rises.length + falls.length === 0) return null;
  const Row = ({ p, team, d, price, up }) => (
    <div className="flex items-center gap-2.5 rounded-xl px-3" style={{ background: T.bgRaise, height: 44 }}>
      <Kit team={team} size={20} />
      <span className="font-bold flex-1 truncate" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14.5 }}>
        {p}{MY_SQUAD.has(p) && <span className="inline-block w-1.5 h-1.5 rounded-full ml-2 align-middle" style={{ background: T.green }} />}
      </span>
      <Plate w={58} color={up ? T.green : T.pink}>{d}</Plate>
      <Plate w={54} color={T.dim}>£{price}</Plate>
    </div>
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

/* ————— Right column: price watch + structure board ————— */
function PriceWatch() {
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: T.card, borderColor: T.line }}>
      <Label color={T.green}>Tonight's price watch · your players</Label>
      {RISE_RISK.map((r) => (
        <div key={r.p} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: T.bgRaise }}>
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
        </div>
      ))}
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
        SURFACED HERE ONLY — NEVER PUSHED
      </div>
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
      <div className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
        CUP-WATCHER: GREEN · NO BLANK/DOUBLE ACTION NEEDED
      </div>
    </div>
  );
}

/* ————— Analyst drawer (News context) ————— */
function AnalystDrawer({ onClose, toast }) {
  const [fired, setFired] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(6,0,10,0.6)" }} onClick={onClose}>
      <aside className="h-full flex flex-col border-l" onClick={(e) => e.stopPropagation()} style={{ width: 560, background: T.bgRaise, borderColor: T.line }}>
        <header className="flex items-center justify-between px-7 py-6 border-b" style={{ borderColor: T.line }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>✦ The Analyst</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>News · GW8 · 14 memory records</div>
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
              The payload includes the last 48h of parsed signals, tonight's price-risk table, the structure board, and memory — signal impacts are already priced into every xP. Mock response — nothing connected, nothing charged.
            </p>
          ) : (
            <>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                Two of today's signals touch your squad and they interact: Wood's rested flag (0.5) plus Sels confirmed means your NFO exposure is one coin-flip, not two. The bench call (Larsen in) neutralises it fully — no transfer required.
              </p>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                Palmer's 71% fall risk is the quiet one: if he drops tonight you lose £0.1 of resale on a player the model already ranks below his price band. Memory (gw6, price_decision): waiting on a faller cost you nothing twice — but this time the replacement (Rogers band) is flat, so urgency is genuinely low.
              </p>
              <p className="font-bold" style={{ color: T.green, fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                THE LEVER: do nothing tonight; start Larsen over Wood at the deadline. Signals priced in, zero moves.
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
  return (
    <div className="flex flex-col items-start gap-5 pt-20 max-w-xl">
      <h2 className="uppercase" style={{ ...D, color: "#FFFFFF", fontSize: 42 }}>{name}</h2>
      <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 17, lineHeight: 1.6 }}>
        Approved — final version lives in {name.toLowerCase()}-mockup.jsx. The fully linked app lives in fpl-app-mockup.jsx.
      </p>
      <button onClick={back} className="px-6 h-12 rounded-full font-bold" style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
        BACK TO NEWS
      </button>
    </div>
  );
}

/* ————— App ————— */
export default function App() {
  const [page, setPage] = useState("News");
  const [kind, setKind] = useState("ALL");
  const [myOnly, setMyOnly] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400); }, []);
  const refresh = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => { setSpinning(false); toast("Refreshed — signals, prices and structure updated"); }, 900);
  }, [spinning, toast]);

  const feed = FEED.filter((f) => kind === "ALL" || f.kind === kind);

  return (
    <div className="min-h-screen w-full flex flex-row-reverse" style={{ background: T.bg, fontFamily: FB, fontWeight: 600 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Michroma&family=Martian+Mono:wght@700;800&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

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

          {page === "News" ? (
            <>
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
                  <button onClick={() => setMyOnly(!myOnly)} className="px-3 h-9 rounded-full font-bold border"
                    style={{ background: myOnly ? T.green : T.card, color: myOnly ? "#04130A" : T.dim, borderColor: myOnly ? T.green : T.line, fontFamily: FB, fontSize: 12.5 }}>
                    MY PLAYERS ONLY
                  </button>
                  <span className="ml-auto font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>REVERSE-CHRON · KEPT OFF THE DASHBOARD BY DESIGN</span>
                </div>
                {feed.map((item, i) => {
                  if (item.kind === "PRESSERS") return <PresserCard key={i} item={item} myOnly={myOnly} />;
                  if (item.kind === "PRICES") return <PriceCard key={i} item={item} myOnly={myOnly} />;
                  return <StructureCard key={i} item={item} />;
                })}
              </div>
              <div className="flex flex-col gap-4" style={{ width: 340 }}>
                <PriceWatch />
                <StructureBoard />
              </div>
            </div>
            </>
          ) : (
            <Stub name={page} back={() => setPage("News")} />
          )}
        </div>
      </main>

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
