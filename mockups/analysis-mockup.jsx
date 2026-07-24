import React, { useState, useCallback } from "react";
import {
  LayoutGrid, Shirt as ShirtIcon, Hammer, Users, BarChart3, Newspaper,
  RefreshCw, Sparkles, X, Copy,
} from "lucide-react";

/* ————— LOCKED SYSTEM — Michroma (identity) · Outfit 600+ (body) · Martian Mono 800 (data)
   White text only · 12px floor · numbers on dark plates · green = projections/positive ·
   #E90052 = risk · #FF2ECC = captain/value · nav rail right · xP terminology. ————— */
const FB = "'Outfit',sans-serif";
const FN = "'Martian Mono',monospace";
const FNW = 800;
const D = { fontFamily: "'Michroma',sans-serif", fontWeight: 400 };

const T = {
  bg: "#0D0014", bgRaise: "#16021F", card: "#1E0630", line: "#3A1150",
  text: "#FFFFFF", dim: "rgba(255,255,255,0.85)", faint: "rgba(255,255,255,0.62)",
  green: "#00FF85", cyan: "#04F5FF", pink: "#E90052", value: "#FF2ECC",
};

const Label = ({ children, color = T.dim }) => (
  <div className="font-bold uppercase" style={{ color, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.08em" }}>{children}</div>
);
const Plate = ({ children, color = "#FFFFFF", w, h = 30, bg = "#0D0014", size = 12.5 }) => (
  <div className="flex items-center justify-center rounded-lg px-2 font-bold leading-none whitespace-nowrap"
    style={{ background: bg, height: h, minWidth: w, color, fontFamily: FN, fontWeight: FNW, fontSize: size }}>
    {children}
  </div>
);

/* ————— Study data (produced by B-18, refreshed monthly; these numbers set the Builder defaults) ————— */
const FORMATIONS = [
  { id: "3-5-2", ev: 8.4, ppp: 6.1, adopt: 31 },
  { id: "4-4-2", ev: 7.9, ppp: 5.9, adopt: 22 },
  { id: "3-4-3", ev: 7.1, ppp: 5.6, adopt: 18 },
  { id: "4-3-3", ev: 6.8, ppp: 5.5, adopt: 14 },
  { id: "5-3-2", ev: 6.2, ppp: 5.2, adopt: 6 },
  { id: "4-5-1", ev: 5.9, ppp: 5.1, adopt: 5 },
  { id: "5-4-1", ev: 5.1, ppp: 4.7, adopt: 4 },
];
const VALUE_GRID = {
  bands: ["≤£5.0", "£5.1–7.5", "£7.6–10.0", "£10.0+"],
  rows: [
    ["GK", [6.4, 5.8, null, null]],
    ["DEF", [6.1, 5.6, 4.8, null]],
    ["MID", [5.2, 6.8, 5.4, 4.9]],
    ["FWD", [4.6, 5.9, 5.1, 4.5]],
  ],
};
const PREMIUMS = [
  { n: 0, pts: 2104 }, { n: 1, pts: 2214 }, { n: 2, pts: 2287 }, { n: 3, pts: 2241 },
];
const EO_BANDS = [
  { band: "OVERALL", tmpl: 4.6, diff: 3.1 },
  { band: "TOP 100K", tmpl: 4.7, diff: 3.6 },
  { band: "TOP 10K", tmpl: 4.8, diff: 4.5 },
  { band: "TOP 1K", tmpl: 4.8, diff: 5.2 },
];
const BEHAVIOUR = [
  { title: "Chip timing", stats: [["WC1 AVG", "GW8.7"], ["TC ON DGW", "91%"], ["BB ON DGW", "87%"]], line: "Champions burn set-1 chips early and never carry a chip into a blank." },
  { title: "Transfer cadence", stats: [["MOVES/GW", "1.04"], ["HITS/GW", "0.21"], ["ROLL RATE", "62%"]], line: "Top-1k finishers roll more and hit less — patience is a measurable edge." },
  { title: "Captaincy discipline", stats: [["PREMIUM ARM", "92%"], ["PIVOTS/SZN", "5.3"], ["EV LOSS/PIVOT", "−0.4"]], line: "The armband stays on premiums; pivots are rare and mostly cost EV." },
];

/* ————— Evidence card shell ————— */
function StudyCard({ tag, title, ev, seasons, effect, finding, children }) {
  return (
    <section className="rounded-2xl border p-5 flex flex-col gap-4" style={{ background: T.card, borderColor: T.line }}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <Label color={T.green}>{tag}</Label>
          <h2 className="mt-1 font-bold" style={{ fontFamily: FB, fontSize: 22, color: "#FFFFFF" }}>{title}</h2>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="flex flex-col items-center gap-1"><Label>Evidence</Label><Plate h={30} w={56} bg={T.bgRaise} color={T.green}>{ev}</Plate></div>
          <div className="flex flex-col items-center gap-1"><Label>Seasons</Label><Plate h={30} w={100} bg={T.bgRaise}>{seasons}</Plate></div>
          <div className="flex flex-col items-center gap-1"><Label>Effect</Label><Plate h={30} w={90} bg={T.bgRaise} color={T.green}>{effect}</Plate></div>
        </div>
      </header>
      {children}
      <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 15, lineHeight: 1.6 }}>{finding}</p>
    </section>
  );
}

/* ————— Section 1: formations ————— */
function Formations({ toast }) {
  return (
    <StudyCard tag="Analysis · Structures" title="Best-performing formations" ev="8.4" seasons="23/24–26/27"
      effect="+0.7 pts/GW"
      finding="3-5-2 leads on points-per-£ pooled and this season: premium-mid loading plus DefCon centre-backs banks the floor. These evidence scores set the Builder's structure chips — the two shapes above 7.5 cover 53% of the top 10k.">
      <div className="flex flex-col gap-1.5">
        <div className="items-center px-2 uppercase font-bold" style={{ display: "grid", gridTemplateColumns: "112px 1fr 64px 64px 72px", gap: 8, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          <span>Shape</span><span>Evidence</span><span className="text-center">Ev</span><span className="text-center">Pts/£</span><span className="text-center">10k use</span>
        </div>
        {FORMATIONS.map((f, i) => (
          <button key={f.id} onClick={() => toast(`${f.id} — loads as the structure in the Builder`)}
            className="items-center rounded-xl px-2 text-left transition-transform active:scale-[0.995]"
            style={{ display: "grid", gridTemplateColumns: "112px 1fr 64px 64px 72px", gap: 8, background: T.bgRaise, height: 42 }}>
            <span className="leading-none flex items-center gap-1.5" style={{ ...D, color: "#FFFFFF", fontSize: 13 }}>
              {f.id}
              {i === 0 && <span className="rounded-full px-1.5 flex items-center font-bold" style={{ background: T.value, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, height: 18 }}>TOP</span>}
            </span>
            <div className="rounded-full overflow-hidden" style={{ height: 10, background: "#2A0B3D" }}>
              <div style={{ height: 10, width: `${(f.ev / 10) * 100}%`, background: `linear-gradient(90deg, ${T.green}44, ${T.green})` }} />
            </div>
            <Plate color={T.green}>{f.ev.toFixed(1)}</Plate>
            <Plate>{f.ppp.toFixed(1)}</Plate>
            <Plate color={T.dim}>{f.adopt}%</Plate>
          </button>
        ))}
      </div>
    </StudyCard>
  );
}

/* ————— Section 2: value heatmap ————— */
function ValueMap({ toast }) {
  const flat = VALUE_GRID.rows.flatMap(([, vals]) => vals).filter((v) => v !== null);
  const min = Math.min(...flat), max = Math.max(...flat);
  return (
    <StudyCard tag="Analysis · Value" title="Points-per-£ by position and price band" ev="7.6" seasons="23/24–26/27"
      effect="+0.9 pts/£"
      finding="The £5.1–7.5 midfield band is the market's biggest mispricing at 6.8 pts/£ — a full +0.9 over the next-best cell. Premium forwards are the worst-priced asset class in the game; buy their ceiling, never their value.">
      <div className="flex flex-col gap-1.5">
        <div className="items-center px-2 uppercase font-bold" style={{ display: "grid", gridTemplateColumns: "56px repeat(4, 1fr)", gap: 8, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          <span />{VALUE_GRID.bands.map((b) => <span key={b} className="text-center">{b}</span>)}
        </div>
        {VALUE_GRID.rows.map(([pos, vals]) => (
          <div key={pos} className="items-center px-2" style={{ display: "grid", gridTemplateColumns: "56px repeat(4, 1fr)", gap: 8 }}>
            <span className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{pos}</span>
            {vals.map((v, i) => {
              if (v === null) return <div key={i} className="rounded-lg flex items-center justify-center font-bold" style={{ height: 40, background: T.bgRaise, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>—</div>;
              const t = (v - min) / (max - min);
              const bright = t > 0.55;
              return (
                <button key={i} onClick={() => toast(`Players filtered — ${pos} · ${VALUE_GRID.bands[i]}`)}
                  className="rounded-lg flex items-center justify-center font-bold leading-none transition-transform active:scale-95"
                  style={{ height: 40, background: `rgba(0,255,133,${0.08 + t * 0.82})`, color: bright ? "#04130A" : "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 14 }}>
                  {v.toFixed(1)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </StudyCard>
  );
}

/* ————— Section 3: budget structures ————— */
function Budgets() {
  const max = Math.max(...PREMIUMS.map((p) => p.pts));
  return (
    <StudyCard tag="Analysis · Budget" title="How high finishers spread the £100" ev="7.1" seasons="24/25–26/27"
      effect="+83 pts/szn"
      finding="Two premiums is the winning spread — +83 season points over one, and the third premium costs more than it returns once the bench collapses. Top-1k benches average £17.2 and return 0.9 pts/GW; expensive benches are dead capital.">
      <div className="flex items-end gap-6 px-2" style={{ height: 142 }}>
        {PREMIUMS.map((p) => {
          const best = p.pts === max;
          return (
            <div key={p.n} className="flex-1 flex flex-col items-center justify-end gap-1.5" style={{ height: 142 }}>
              <span className="leading-none font-bold" style={{ color: best ? T.green : "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>{p.pts}</span>
              <div className="rounded-md w-full" style={{ maxWidth: 88, height: ((p.pts - 2000) / (max - 2000)) * 80 + 12, background: best ? T.green : "#2A6B4A" }} />
              <span className="leading-none font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.n} PREMIUM{p.n === 1 ? "" : "S"}</span>
            </div>
          );
        })}
        <div className="flex flex-col items-center gap-1 pb-4">
          <Label>Top-1k bench</Label>
          <Plate h={34} w={72} bg={T.bgRaise}>£17.2</Plate>
          <Plate h={34} w={72} bg={T.bgRaise} color={T.green}>0.9/GW</Plate>
        </div>
      </div>
    </StudyCard>
  );
}

/* ————— Section 4: template vs differential ————— */
function TemplateDiff() {
  const max = 5.5;
  return (
    <StudyCard tag="Analysis · Ownership" title="Template vs differential returns by rank band" ev="6.9" seasons="23/24–26/27"
      effect="+0.6 pts/pick"
      finding="Differentials only pay inside the top 1k, where they return +0.6 pts/pick over template — everywhere else the template wins. The play is sequencing: template to reach the band, differentials to climb inside it. This is the rank-EV logic the Analyst leans on.">
      <div className="flex flex-col gap-2">
        {EO_BANDS.map((b) => (
          <div key={b.band} className="items-center rounded-xl px-3 py-2" style={{ display: "grid", gridTemplateColumns: "88px 1fr 130px", gap: 10, background: T.bgRaise }}>
            <span className="font-bold" style={{ color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{b.band}</span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className="rounded-full" style={{ height: 8, width: `${(b.tmpl / max) * 100}%`, background: "rgba(255,255,255,0.45)" }} />
                <span className="font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{b.tmpl.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-full" style={{ height: 8, width: `${(b.diff / max) * 100}%`, background: b.diff > b.tmpl ? T.green : "#2A6B4A" }} />
                <span className="font-bold" style={{ color: b.diff > b.tmpl ? T.green : T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{b.diff.toFixed(1)}</span>
              </div>
            </div>
            <Plate w={120} color={b.diff > b.tmpl ? T.green : T.dim}>
              {b.diff > b.tmpl ? `DIFF +${(b.diff - b.tmpl).toFixed(1)}` : `TMPL +${(b.tmpl - b.diff).toFixed(1)}`}
            </Plate>
          </div>
        ))}
        <div className="flex items-center gap-4 px-1 font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
          <span className="flex items-center gap-1.5"><span className="w-4 rounded-full inline-block" style={{ height: 8, background: "rgba(255,255,255,0.45)" }} /> TEMPLATE (EO ≥ 25%)</span>
          <span className="flex items-center gap-1.5"><span className="w-4 rounded-full inline-block" style={{ height: 8, background: T.green }} /> DIFFERENTIAL (EO &lt; 10%)</span>
          <span>PTS / PICK / GW</span>
        </div>
      </div>
    </StudyCard>
  );
}

/* ————— Section 5: top-manager behaviour ————— */
function Behaviour() {
  return (
    <StudyCard tag="Analysis · Behaviour" title="What champions actually do" ev="6.4" seasons="21/22–25/26"
      effect="3 patterns"
      finding="Pooled from community top-10k pick archives and five champions' season write-ups. All three patterns are enforced in this product: chips get placed onto the GW strip early, transfer discipline is scored, and the captaincy module defaults premium.">
      <div className="grid grid-cols-3 gap-3">
        {BEHAVIOUR.map((m) => (
          <div key={m.title} className="rounded-xl p-4 flex flex-col gap-3" style={{ background: T.bgRaise }}>
            <div className="font-bold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5 }}>{m.title}</div>
            <div className="flex flex-col gap-2">
              {m.stats.map(([l, v]) => (
                <div key={l} className="flex items-center justify-between">
                  <span className="font-bold" style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{l}</span>
                  <Plate h={28} w={64}>{v}</Plate>
                </div>
              ))}
            </div>
            <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 13.5, lineHeight: 1.5 }}>{m.line}</p>
          </div>
        ))}
      </div>
    </StudyCard>
  );
}

/* ————— Analyst drawer (Analysis context) ————— */
function AnalystDrawer({ onClose, toast }) {
  const [fired, setFired] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(6,0,10,0.6)" }} onClick={onClose}>
      <aside className="h-full flex flex-col border-l" onClick={(e) => e.stopPropagation()} style={{ width: 560, background: T.bgRaise, borderColor: T.line }}>
        <header className="flex items-center justify-between px-7 py-6 border-b" style={{ borderColor: T.line }}>
          <div>
            <div className="font-bold uppercase" style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em" }}>✦ The Analyst</div>
            <div className="mt-1 font-bold" style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>Analysis · GW8 · 14 memory records</div>
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
              The payload includes every study card as structured data — evidence scores, effect sizes, season ranges — plus your squad and memory. Mock response — nothing connected, nothing charged.
            </p>
          ) : (
            <>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                Your squad already runs the study's playbook: 3-5-2, two premiums, £16.8 bench. The one deviation is ownership — 9 of your 11 starters are template. Per the rank-band card that's exactly right at 214k; the differential window opens if you cross ~top 10k before the GW19 chip wall.
              </p>
              <p className="font-semibold" style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                Watch the value heatmap's 6.8 cell: your Semenyo, Rogers and Mbeumo all live in it. When one is priced out of the band by rises, the study says replace within the band, not upward.
              </p>
              <p className="font-bold" style={{ color: T.green, fontFamily: FB, fontSize: 15.5, lineHeight: 1.65 }}>
                THE LEVER: no structural change — bank rank until 10k, then differentiate. The study's sequencing beats impatience.
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
const SECTIONS = ["ALL", "STRUCTURES", "VALUE", "BUDGET", "OWNERSHIP", "BEHAVIOUR"];

function Stub({ name, back }) {
  const approved = ["Dashboard", "Squad", "Builder", "Players"].includes(name);
  return (
    <div className="flex flex-col items-start gap-5 pt-20 max-w-xl">
      <h2 className="uppercase" style={{ ...D, color: "#FFFFFF", fontSize: 42 }}>{name}</h2>
      <p className="font-semibold" style={{ color: T.dim, fontFamily: FB, fontSize: 17, lineHeight: 1.6 }}>
        {approved ? `Approved — final version lives in ${name.toLowerCase()}-mockup.jsx.` : "Built after the Analysis page is approved. Spec lives in 03-ui.md §3."}
      </p>
      <button onClick={back} className="px-6 h-12 rounded-full font-bold" style={{ background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14 }}>
        BACK TO ANALYSIS
      </button>
    </div>
  );
}

/* ————— App ————— */
export default function App() {
  const [page, setPage] = useState("Analysis");
  const [section, setSection] = useState("ALL");
  const [toastMsg, setToastMsg] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400); }, []);
  const refresh = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => { setSpinning(false); toast("Refreshed — study data is monthly; live data updated"); }, 900);
  }, [spinning, toast]);

  const show = (k) => section === "ALL" || section === k;

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

          {page === "Analysis" ? (
            <div className="flex flex-col gap-4">
              {/* Study meta + section filter */}
              <div className="flex items-center gap-2 flex-wrap">
                {SECTIONS.map((k) => (
                  <button key={k} onClick={() => setSection(k)} className="px-4 h-9 rounded-full font-bold"
                    style={{ background: section === k ? T.green : T.card, color: section === k ? "#04130A" : T.dim, border: `1px solid ${section === k ? T.green : T.line}`, fontFamily: FB, fontSize: 13 }}>
                    {k}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  <Plate h={34} bg={T.card}>STRATEGY STUDY B-18</Plate>
                  <Plate h={34} bg={T.card}>REFRESHED GW7 · NEXT GW11</Plate>
                </div>
              </div>

              {show("STRUCTURES") && <Formations toast={toast} />}
              {show("VALUE") && <ValueMap toast={toast} />}
              {show("BUDGET") && <Budgets />}
              {show("OWNERSHIP") && <TemplateDiff />}
              {show("BEHAVIOUR") && <Behaviour />}
            </div>
          ) : (
            <Stub name={page} back={() => setPage("Analysis")} />
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
