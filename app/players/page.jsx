"use client";
import React from "react";
import { Search, X, Flag } from "lucide-react";
import { T, FB, S, Kit, Face, Label, Plate, Value, Donut, POS_LABEL, riskInfo, SkeletonRows, ErrorCard, Status, lang, val, code } from "../../lib/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Maximize2 } from "lucide-react";
import { loadCore, nextFixtures, fixLabel } from "../../lib/data";
import { buildOpponentScale } from "../../lib/opponent";
import Opp from "../../components/Opp";

/* Column set is computed from the data. A column whose every value would be zero is not a column,
   it is an empty space with a heading, so it is withheld until the numbers exist. */
function columnsFor(players) {
  const any = (f) => players.some((p) => f(p) !== null && f(p) !== undefined && Number(f(p)) > 0);
  const cols = [
    { key: "Player", w: "minmax(220px,1fr)", align: "left" },
    { key: "Next", w: "104px" },
    { key: "Price", w: "78px" },
    { key: "Own% · cyan 40+", w: "104px" },
  ];
  if (any((p) => p.total_points)) cols.push({ key: "Pts", w: "66px" });
  if (any((p) => p.form)) cols.push({ key: "Form", w: "66px" });
  cols.push({ key: "Start %", w: "84px" });
  cols.push({ key: "Status", w: "88px" });
  cols.push({ key: "", w: "40px" });
  return cols;
}

function Toggle({ on, onClick, children, tag }) {
  return (
    <button onClick={onClick} className="fb-press" style={{ height: 40, padding: "0 16px", borderRadius: 999, ...lang(13.5, 700, on ? (tag ? "#FFFFFF" : "#04130A") : "#FFFFFF"),
      background: on ? (tag ? T.tag : T.green) : T.card,
      border: `1px solid ${on ? (tag ? T.tag : T.green) : T.line}` }}>
      {children}
    </button>
  );
}
/* Dual-thumb price range. Filtering by price narrows the view; it never pretends a player
   does not exist because of a budget, which is why there is no affordability cut anywhere. */
function PriceRange({ lo, hi, min, max, onChange, count }) {
  const set = (which) => (e) => {
    const v = Number(e.target.value);
    if (which === "lo") onChange([Math.min(v, hi), hi]);
    else onChange([lo, Math.max(v, lo)]);
  };
  const pct = (v) => (max === min ? 0 : ((v - min) / (max - min)) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 268, background: T.card,
      border: `1px solid ${T.line}`, borderRadius: 12, padding: "8px 14px 10px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={lang(13.5, 600)}>Price</span>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={val(13.5)}>{lo.toFixed(1)}</span>
          <span style={lang(13, 600)}>to</span>
          <span style={val(13.5)}>{hi.toFixed(1)}</span>
          <span style={lang(13, 600)}>· {count}</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 20 }}>
        <span style={{ position: "absolute", top: 9, left: 0, right: 0, height: 3, borderRadius: 2, background: T.plate }} />
        <span style={{ position: "absolute", top: 9, height: 3, borderRadius: 2, background: T.green,
          left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input type="range" min={min} max={max} step={0.1} value={lo} onChange={set("lo")} aria-label="Minimum price"
          style={{ position: "absolute", inset: 0, width: "100%", margin: 0, background: "transparent", accentColor: T.green, pointerEvents: "auto" }} />
        <input type="range" min={min} max={max} step={0.1} value={hi} onChange={set("hi")} aria-label="Maximum price"
          style={{ position: "absolute", inset: 0, width: "100%", margin: 0, background: "transparent", accentColor: T.green, pointerEvents: "auto" }} />
      </div>
    </div>
  );
}

function Sel({ label, value, onChange, options, labelOf }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "0 12px", height: 42 }}>
      <span style={lang(13.5, 600)}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: "transparent", border: "none", outline: "none", ...lang(14.5, 700) }}>
        {options.map((o) => <option key={o} value={o} style={{ background: T.row, color: "#FFFFFF" }}>{labelOf ? labelOf(o) : o}</option>)}
      </select>
    </label>
  );
}

// Every sort carries what it is evidence of, so the choice is never a bare list.
const SORT_BASIS = {
  "OWN%": "Template exposure, not quality.",
  "PTS": "Season total. Backward looking and minutes-inflated.",
  "FORM": "Points per game over the last five. Short sample.",
  "PRICE ↓": "Most expensive first.",
  "PRICE ↑": "Cheapest first. The enabler search.",
  "NAME": "Alphabetical.",
};
const DIFF_OWN = 15;
const DIFF_PRICE = 5.5;

const OWN_BANDS = {
  "Under 5%": [0, 5],
  "5 to 15%": [5, 15],
  "15 to 40%": [15, 40],
  "40% and over": [40, 101],
};

/* Promoted for 2026/27. Held as a list because nothing in the database marks promotion; the
   discount fitted from history is applied by position in config/fitted-params.json. */
const PROMOTED_CLUBS = new Set(["BUR", "LEE", "SUN"]);

/* Rotation and availability read, from status and chance of playing only. No intent is inferred. */
export function rotationRead(p) {
  if (p.status === "i") return "Injured";
  if (p.status === "s") return "Suspended";
  if (p.status === "u") return "Unavailable";
  if (p.chance_of_playing !== null && p.chance_of_playing < 70) return "Doubtful";
  return "Available";
}
const CloseBtn = ({ onClick }) => (
  <button onClick={onClick} className="fb-press" style={{ width: 38, height: 38, borderRadius: 19, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <X size={17} color="#FFFFFF" />
  </button>
);

function Profile({ p, fx, scale, onClose, onCompare }) {
  const risk = riskInfo(p);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", justifyContent: "flex-end", background: "rgba(6,0,10,0.6)" }}>
      <aside className="fb-drawer" onClick={(e) => e.stopPropagation()} style={{ width: 480, height: "100%", overflowY: "auto", background: T.row, borderLeft: `1px solid ${T.line}` }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "22px 26px", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, background: T.row, zIndex: 1 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Face code={p.code} team={p.team} size={54} />
            <div>
              <div style={{ ...lang(23, 700), lineHeight: 1 }}>{p.web_name}</div>
              <div style={{ marginTop: 7, ...code(13.5) }}>{p.team} · {POS_LABEL[p.position]}</div>
              {risk && (
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                  <Flag size={12} color={T.pink} /> <span style={lang(13.5, 600, T.pink)}>{risk}</span>
                </div>
              )}
            </div>
          </div>
          <CloseBtn onClick={onClose} />
        </header>
        <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
            <Donut value={p.own} total={100} label="OWNED" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              {[["Price", p.price.toFixed(1), "#FFFFFF"],
                ["Ownership", `${p.own.toFixed(1)}%`, "#FFFFFF"],
                ["Points", `${p.total_points ?? 0}`, "#FFFFFF"],
                ["Form", p.form === null || p.form === undefined ? "0.0" : Number(p.form).toFixed(1), "#FFFFFF"],
                ["Minutes", `${p.minutes ?? 0}`, "#FFFFFF"],
                ...(p.xg_fpl !== null && p.xg_fpl !== undefined ? [["xG · xA", `${Number(p.xg_fpl).toFixed(1)} · ${Number(p.xa_fpl ?? 0).toFixed(1)}`, "#FFFFFF"]] : []),
                ["Chance next GW", p.chance_of_playing === null ? "100%" : `${p.chance_of_playing}%`, p.chance_of_playing !== null && p.chance_of_playing < 70 ? T.pink : "#FFFFFF"]].map(([l, v, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={lang(14.5)}>{l}</span><span style={{ ...val(S.data, c), textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            {(() => {
              const run = scale ? scale.runDifficulty(fx.slice(0, 6)) : null;
              return (
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span style={lang(14.5)}>Next 6 fixtures</span>
                  {run && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <span style={lang(12.5, 700)}>RUN</span>
                      <Plate w={54} color={run.tone}>{run.difficulty}</Plate>
                    </span>
                  )}
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
              {fx.length === 0 && <span style={lang(14)}>Not published yet</span>}
              {fx.map((f, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <Opp fx={f} scale={scale} size="sm" />
                  <span style={val(12, "#FFFFFF", 500)}>GW{f.gw}</span>
                </div>
              ))}
            </div>
          </div>
          {p.news && (
            <div style={{ background: "#3A0217", borderRadius: 14, padding: "14px 16px", display: "flex", gap: 9 }}>
              <Flag size={15} color={T.pink} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ ...lang(14.5), lineHeight: 1.55 }}>{p.news}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <Link href={`/player/${p.fpl_id}`} style={{ flex: 1, textDecoration: "none" }}>
              <span className="fb-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: S.btn, borderRadius: 999, background: T.green, ...lang(15, 700, "#04130A") }}>
                Open full player page
              </span>
            </Link>
            <button onClick={() => onCompare(p)} className="fb-press" style={{ flex: 1, height: S.btn, borderRadius: 999, background: T.row, border: `1px solid ${T.line}`, ...lang(15, 700) }}>
              Add to comparison
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function CompareDrawer({ players, fxOf, scale, onClose }) {
  const colors = [T.green, T.cyan, T.tag];
  const rows = [
    ["Price", (p) => p.price.toFixed(1), (p) => -p.price],
    ["Own%", (p) => `${p.own.toFixed(1)}%`, (p) => -p.own],
    ["Points", (p) => `${p.total_points ?? 0}`, (p) => p.total_points ?? 0],
    ["Form", (p) => (p.form === null || p.form === undefined ? "0.0" : Number(p.form).toFixed(1)), (p) => Number(p.form) || 0],
    ["Chance next GW", (p) => (p.chance_of_playing === null ? "100%" : `${p.chance_of_playing}%`), (p) => (p.chance_of_playing === null ? 100 : p.chance_of_playing)],
    ["Next", (p) => fxOf(p)[0] || null, null],
    ["Next 6 run", (p) => (scale ? scale.runDifficulty(fxOf(p).slice(0, 6)) : null), (p) => { const r = scale ? scale.runDifficulty(fxOf(p).slice(0, 6)) : null; return r ? -r.difficulty : -999; }],
    ["Status", null, null],
  ];
  const best = (row) => {
    if (!row[2]) return -1;
    const vals = players.map(row[2]);
    return vals.indexOf(Math.max(...vals));
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", justifyContent: "flex-end", background: "rgba(6,0,10,0.6)" }}>
      <aside className="fb-drawer" onClick={(e) => e.stopPropagation()} style={{ width: 340 + players.length * 170, maxWidth: 820, height: "100%", overflowY: "auto", background: T.row, borderLeft: `1px solid ${T.line}` }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 26px", borderBottom: `1px solid ${T.line}` }}>
          <div>
            <Label color={T.green}>Player comparison</Label>
            <div style={{ marginTop: 6, ...lang(14.5) }}>Green marks the best value in each row</div>
          </div>
          <CloseBtn onClick={onClose} />
        </header>
        <div style={{ padding: "22px 26px", display: "grid", gap: 9, gridTemplateColumns: `128px repeat(${players.length}, 1fr)` }}>
          <span />
          {players.map((p, i) => (
            <Link key={p.fpl_id} href={`/player/${p.fpl_id}`} style={{ textDecoration: "none" }}>
              <div className="fb-hover" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, background: T.card, border: `1px solid ${colors[i]}`, borderRadius: 14, padding: "12px 6px" }}>
                <Face code={p.code} team={p.team} size={46} />
                <span style={{ ...lang(15, 700), textAlign: "center", lineHeight: 1.2 }}>{p.web_name}</span>
                <span style={val(12, "#FFFFFF", 500)}>{p.team} · {POS_LABEL[p.position]}</span>
              </div>
            </Link>
          ))}
          {rows.map((row) => {
            const b = best(row);
            return (
              <React.Fragment key={row[0]}>
                <span style={{ display: "flex", alignItems: "center", ...lang(14) }}>{row[0]}</span>
                {players.map((p, i) => (
                  row[0] === "Status"
                    ? <div key={p.fpl_id} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 38, borderRadius: 10, background: T.card }}><Status p={p} /></div>
                    : row[0] === "Next"
                      ? <div key={p.fpl_id} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 38, borderRadius: 10, background: T.card }}><Opp fx={row[1](p)} scale={scale} size="sm" /></div>
                    : row[0] === "Next 6 run"
                      ? (() => { const r = row[1](p); return <Plate key={p.fpl_id} h={38} bg={T.card} color={r ? r.tone : "#FFFFFF"}>{r ? r.difficulty : "TBC"}</Plate>; })()
                      : <Plate key={p.fpl_id} h={38} bg={i === b ? "#06331D" : T.card} color={i === b ? T.green : "#FFFFFF"}>{row[1](p)}</Plate>
                ))}
              </React.Fragment>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

export default function Players() {
  const [core, setCore] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [pos, setPos] = React.useState("ALL");
  const [q, setQ] = React.useState("");
  const [club, setClub] = React.useState("ALL");
  const [range, setRange] = React.useState(null);      // [lo, hi], set once from the data
  const [ownBand, setOwnBand] = React.useState("ALL");  // ownership band
  const [rotation, setRotation] = React.useState("ALL");// availability and rotation read
  const [promoted, setPromoted] = React.useState(false);// promoted-club players only
  const [runMax, setRunMax] = React.useState("ALL");    // fixture-run difficulty ceiling
  const [sort, setSort] = React.useState("OWN%");
  const [diffs, setDiffs] = React.useState(false);
  const [cmpMode, setCmpMode] = React.useState(false);
  const [cmp, setCmp] = React.useState([]);
  const [cmpOpen, setCmpOpen] = React.useState(false);
  const [profileP, setProfileP] = React.useState(null);
  const searchRef = React.useRef(null);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore().then(setCore).catch(() => setErr(true));
  }, []);
  React.useEffect(() => {
    load();
    if (typeof window !== "undefined" && window.location.search.includes("compare=1")) setCmpMode(true);
  }, [load]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setProfileP(null); setCmpOpen(false); }
      if (e.key === "/" && document.activeElement !== searchRef.current) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clubs = React.useMemo(() => core ? ["ALL", ...Object.values(core.teamById).filter((t) => t.archive !== true).map((t) => t.short_name).sort()] : ["ALL"], [core]);
  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);
  const fxOf = React.useCallback((p) => core ? nextFixtures(core.fixtures, core.teamById, p.team_id, 6) : [], [core]);

  const list = React.useMemo(() => {
    if (!core) return [];
    let l = core.players;
    if (pos !== "ALL") l = l.filter((p) => POS_LABEL[p.position] === pos);
    if (q) l = l.filter((p) => (p.web_name + " " + p.name + " " + p.team).toLowerCase().includes(q.toLowerCase()));
    if (club !== "ALL") l = l.filter((p) => p.team === club);
    if (range) l = l.filter((p) => p.price >= range[0] && p.price <= range[1]);
    if (ownBand !== "ALL") {
      const [a, b] = OWN_BANDS[ownBand];
      l = l.filter((p) => p.own >= a && p.own < b);
    }
    if (rotation !== "ALL") l = l.filter((p) => rotationRead(p) === rotation);
    if (promoted) l = l.filter((p) => PROMOTED_CLUBS.has(p.team));
    if (runMax !== "ALL" && scale) {
      l = l.filter((p) => {
        const r = scale.runDifficulty(nextFixtures(core.fixtures, core.teamById, p.team_id, 6));
        return r ? r.difficulty <= Number(runMax) : false;
      });
    }
    if (diffs) l = l.filter((p) => p.own <= DIFF_OWN && p.price >= DIFF_PRICE);
    const by = {
      "OWN%": (a, b) => b.own - a.own,
      "PTS": (a, b) => (b.total_points ?? 0) - (a.total_points ?? 0),
      "FORM": (a, b) => (Number(b.form) || 0) - (Number(a.form) || 0),
      "PRICE ↓": (a, b) => b.price - a.price,
      "PRICE ↑": (a, b) => a.price - b.price,
      "NAME": (a, b) => a.web_name.localeCompare(b.web_name),
    }[sort];
    return [...l].sort(by);
  }, [core, pos, q, club, range, ownBand, rotation, promoted, runMax, diffs, sort, scale]);

  // Counts behind every filter option, so the control shows its own consequence.
  const counts = React.useMemo(() => {
    const base = core ? core.players : [];
    const scoped = pos === "ALL" ? base : base.filter((p) => POS_LABEL[p.position] === pos);
    const club = {};
    for (const p of scoped) club[p.team] = (club[p.team] || 0) + 1;
    const price = {};
    for (const cap of ["5.0", "6.0", "7.5", "9.0", "11.0"]) price[cap] = scoped.filter((p) => p.price <= Number(cap)).length;
    return { total: scoped.length, club, price, diffs: scoped.filter((p) => p.own <= DIFF_OWN && p.price >= DIFF_PRICE).length };
  }, [core, pos]);

  // Bounds come from the data, so the slider always spans exactly what exists.
  const bounds = React.useMemo(() => {
    if (!core || !core.players.length) return [3.5, 15];
    const prices = core.players.map((p) => Number(p.price));
    return [Math.floor(Math.min(...prices) * 10) / 10, Math.ceil(Math.max(...prices) * 10) / 10];
  }, [core]);
  React.useEffect(() => { if (core && range === null) setRange(bounds); }, [core, bounds, range]);

  const atFullRange = !range || (range[0] === bounds[0] && range[1] === bounds[1]);
  const filtered = pos !== "ALL" || q !== "" || club !== "ALL" || !atFullRange || diffs
    || ownBand !== "ALL" || rotation !== "ALL" || promoted || runMax !== "ALL" || sort !== "OWN%";
  const clearAll = () => {
    setPos("ALL"); setQ(""); setClub("ALL"); setRange(bounds); setDiffs(false); setSort("OWN%");
    setOwnBand("ALL"); setRotation("ALL"); setPromoted(false); setRunMax("ALL");
  };

  const cols = React.useMemo(() => columnsFor(list), [list]);
  const grid = cols.map((c) => c.w).join(" ");
  const showPts = cols.some((c) => c.key === "Pts");
  const showForm = cols.some((c) => c.key === "Form");

  const toggleCmp = (p) => setCmp((c) => {
    const has = c.some((x) => x.fpl_id === p.fpl_id);
    if (has) return c.filter((x) => x.fpl_id !== p.fpl_id);
    return c.length >= 3 ? c : [...c, p];
  });
  const addFromProfile = (p) => { setProfileP(null); setCmpMode(true); toggleCmp(p); };

  if (err) return <ErrorCard onRetry={load} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        {["ALL", "GK", "DEF", "MID", "FWD"].map((k) => (
          <Toggle key={k} on={pos === k} onClick={() => setPos(k)}>{k}</Toggle>
        ))}
        <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 10, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "0 14px", height: 42 }}>
          <Search size={16} color="#FFFFFF" />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or club"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", ...lang(15) }} />
        </div>
        <span style={val(13)}>{list.length}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Sel label="Club" value={club} onChange={setClub} options={clubs}
          labelOf={(o) => (o === "ALL" ? `ALL (${counts.total})` : `${o} (${counts.club[o] ?? 0})`)} />
        <Sel label="Ownership" value={ownBand} onChange={setOwnBand} options={["ALL", ...Object.keys(OWN_BANDS)]} />
        <Sel label="Availability" value={rotation} onChange={setRotation} options={["ALL", "Available", "Doubtful", "Injured", "Suspended", "Unavailable"]} />
        <Sel label="Fixture run up to" value={runMax} onChange={setRunMax} options={["ALL", "40", "50", "60", "70"]} />
        <Toggle on={promoted} onClick={() => setPromoted(!promoted)}>PROMOTED CLUBS</Toggle>
        <Sel label="Sort" value={sort} onChange={setSort} options={["OWN%", "PTS", "FORM", "PRICE ↓", "PRICE ↑", "NAME"]} />
        <Toggle on={diffs} onClick={() => setDiffs(!diffs)} tag>{`DIFFERENTIALS ≤${DIFF_OWN}% · ≥${DIFF_PRICE.toFixed(1)} (${counts.diffs})`}</Toggle>
        <Toggle on={cmpMode} onClick={() => { setCmpMode(!cmpMode); if (cmpMode) { setCmp([]); setCmpOpen(false); } }}>COMPARE</Toggle>
        {filtered && <Toggle on={false} onClick={clearAll}>CLEAR ALL</Toggle>}
      </div>
      {range && (
        <PriceRange lo={range[0]} hi={range[1]} min={bounds[0]} max={bounds[1]} onChange={setRange} count={list.length} />
      )}
      <p style={{ ...lang(14, 600), lineHeight: 1.55, margin: 0 }}>{SORT_BASIS[sort]}</p>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 14 }}>
        {!core ? <SkeletonRows n={9} h={S.row} /> : (
          <div style={{ maxHeight: "66vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ position: "sticky", top: 0, zIndex: 1, background: T.card, display: "grid", gridTemplateColumns: grid, gap: 8, alignItems: "center", padding: "0 10px", height: 30 }}>
              {cols.map((c) => (
                <span key={c.key} style={{ ...lang(13.5, 600), textAlign: c.align === "left" ? "left" : "center" }}>{c.key}</span>
              ))}
            </div>
            {list.slice(0, 200).map((p) => {
              const selected = cmp.some((x) => x.fpl_id === p.fpl_id);
              const f = fxOf(p)[0];
              return (
                <div key={p.fpl_id}
                  onClick={() => (cmpMode ? toggleCmp(p) : router.push(`/player/${p.fpl_id}`))}
                  className="fb-hover" role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") (cmpMode ? toggleCmp(p) : router.push(`/player/${p.fpl_id}`)); }}
                  style={{ display: "grid", gridTemplateColumns: grid, gap: 8, alignItems: "center", padding: "0 10px", height: S.row, borderRadius: S.radiusSm, textAlign: "left", cursor: "pointer",
                    background: selected ? "#06331D" : T.row, border: `1px solid ${selected ? T.green : "transparent"}` }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Kit team={p.team} size={23} />
                    <span style={{ ...lang(S.name, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                    <span style={{ ...code(), flexShrink: 0 }}>{p.team} · {POS_LABEL[p.position]}</span>
                  </span>
                  <span style={{ display: "flex", justifyContent: "center" }}><Opp fx={f} scale={scale} size="sm" /></span>
                  <Plate w={62}>{p.price.toFixed(1)}</Plate>
                  <Value color={p.own >= 40 ? T.cyan : "#FFFFFF"}>{p.own.toFixed(1)}%</Value>
                  {showPts && <Value>{p.total_points}</Value>}
                  {showForm && <Value>{Number(p.form).toFixed(1)}</Value>}
                  <Value color={p.chance_of_playing !== null && p.chance_of_playing < 70 ? T.pink : "#FFFFFF"}>
                    {p.chance_of_playing === null ? "100%" : `${p.chance_of_playing}%`}
                  </Value>
                  <span style={{ textAlign: "center" }}><Status p={p} /></span>
                  <button aria-label="Quick look" onClick={(e) => { e.stopPropagation(); setProfileP(p); }} className="fb-press"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 30, width: 30, borderRadius: 9, background: T.plate }}>
                    <Maximize2 size={14} color="#FFFFFF" />
                  </button>
                </div>
              );
            })}
            {list.length === 0 && (
              <div style={{ padding: "40px 0", textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={lang(16, 700)}>No players match these filters.</span>
                <button onClick={clearAll} className="fb-press" style={{ alignSelf: "center", height: S.btnSm, padding: "0 20px", borderRadius: 999, background: T.green, ...lang(14, 700, "#04130A") }}>
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {cmpMode && cmp.length > 0 && (
        <div style={{ position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)", zIndex: 30, display: "flex", alignItems: "center", gap: 9,
          background: T.row, border: `1px solid ${T.line}`, borderRadius: 999, padding: "9px 13px", boxShadow: "0 10px 34px rgba(0,0,0,0.55)" }}>
          {cmp.map((p) => (
            <span key={p.fpl_id} style={{ display: "flex", alignItems: "center", gap: 7, height: 36, padding: "0 12px", borderRadius: 999, background: T.card, ...lang(14, 700) }}>
              {p.web_name}
              <button onClick={() => toggleCmp(p)} style={{ display: "flex" }}><X size={13} color="#FFFFFF" /></button>
            </span>
          ))}
          <button disabled={cmp.length < 2} onClick={() => setCmpOpen(true)} className="fb-press"
            style={{ height: 36, padding: "0 18px", borderRadius: 999, ...lang(14, 700, cmp.length >= 2 ? "#04130A" : "#FFFFFF"),
              background: cmp.length >= 2 ? T.green : T.card }}>
            COMPARE {cmp.length}
          </button>
        </div>
      )}
      {profileP && <Profile p={profileP} fx={fxOf(profileP)} scale={scale} onClose={() => setProfileP(null)} onCompare={addFromProfile} />}
      {cmpOpen && cmp.length >= 2 && <CompareDrawer players={cmp} fxOf={fxOf} scale={scale} onClose={() => setCmpOpen(false)} />}
    </div>
  );
}
