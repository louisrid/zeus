"use client";
import React from "react";
import { Search, X, Flag } from "lucide-react";
import { T, FB, FN, FNW, S, Kit, Face, Label, Plate, Donut, POS_LABEL, riskInfo, SkeletonRows, ErrorCard } from "../../lib/ui";
import { loadCore, nextFixtures, fixLabel } from "../../lib/data";

const GRID = "minmax(220px,1fr) 100px 78px 78px 100px 118px";
const COLS = ["Player", "Next", "Price", "Own%", "Start %", "Status"];

function Toggle({ on, onClick, children, tag }) {
  return (
    <button onClick={onClick} className="fb-press" style={{ height: 40, padding: "0 16px", borderRadius: 999, fontFamily: FB, fontSize: 13.5, fontWeight: 700,
      background: on ? (tag ? T.tag : T.green) : T.card, color: on ? (tag ? "#FFFFFF" : "#04130A") : T.dim,
      border: `1px solid ${on ? (tag ? T.tag : T.green) : T.line}` }}>
      {children}
    </button>
  );
}
function Sel({ label, value, onChange, options }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "0 12px", height: 42 }}>
      <span style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5, textTransform: "uppercase" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: "transparent", border: "none", outline: "none", color: "#FFFFFF", fontFamily: FB, fontSize: 14.5, fontWeight: 700 }}>
        {options.map((o) => <option key={o} value={o} style={{ background: T.bgRaise, color: "#FFFFFF" }}>{o}</option>)}
      </select>
    </label>
  );
}
const CloseBtn = ({ onClick }) => (
  <button onClick={onClick} className="fb-press" style={{ width: 38, height: 38, borderRadius: 19, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <X size={17} color={T.dim} />
  </button>
);

function Profile({ p, fx, onClose, onCompare }) {
  const risk = riskInfo(p);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", justifyContent: "flex-end", background: "rgba(6,0,10,0.6)" }}>
      <aside className="fb-drawer" onClick={(e) => e.stopPropagation()} style={{ width: 480, height: "100%", overflowY: "auto", background: T.bgRaise, borderLeft: `1px solid ${T.line}` }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "22px 26px", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, background: T.bgRaise, zIndex: 1 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Face code={p.code} team={p.team} size={54} />
            <div>
              <div style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 23, fontWeight: 700, lineHeight: 1 }}>{p.web_name}</div>
              <div style={{ marginTop: 7, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>
                {p.team} · {POS_LABEL[p.position]} · £{p.price.toFixed(1)}
              </div>
              {risk && (
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5, color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
                  <Flag size={12} /> {risk.toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <CloseBtn onClick={onClose} />
        </header>
        <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
            <Donut value={p.own} total={100} label="OWNED" sub={"SHARE OF ALL MANAGERS\nWHO OWN HIM"} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              {[["Price", `£${p.price.toFixed(1)}`, "#FFFFFF"],
                ["Ownership", `${p.own.toFixed(1)}%`, "#FFFFFF"],
                ["Chance next GW", p.chance_of_playing === null ? "100%" : `${p.chance_of_playing}%`, p.chance_of_playing !== null && p.chance_of_playing < 70 ? T.pink : "#FFFFFF"]].map(([l, v, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label>{l}</Label><Plate h={S.plate} w={78} color={c}>{v}</Plate>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label>Next 6 fixtures</Label>
            <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
              {fx.length === 0 && <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>NOT PUBLISHED YET</span>}
              {fx.map((f, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <div style={{ width: "100%", height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8,
                    background: f.home ? "#123B27" : "#0D0014", border: `1px solid ${T.line}`, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
                    {f.home ? f.opp : f.opp.toLowerCase()}
                  </div>
                  <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>GW{f.gw}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 9, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>GREEN TINT = HOME</div>
          </div>
          {p.news && (
            <div style={{ background: "#3A0217", borderRadius: 14, padding: "14px 16px", color: "#FFFFFF", fontFamily: FB, fontSize: 14.5, lineHeight: 1.55, display: "flex", gap: 9 }}>
              <Flag size={15} color={T.pink} style={{ flexShrink: 0, marginTop: 2 }} /> {p.news}
            </div>
          )}
          <button onClick={() => onCompare(p)} className="fb-press" style={{ height: S.btn, borderRadius: 999, background: T.green, color: "#04130A", fontFamily: FB, fontSize: 15, fontWeight: 700 }}>
            ADD TO COMPARISON
          </button>
          <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, lineHeight: 1.65 }}>
            PROJECTIONS, FORM, xG AND SHOT MAPS APPEAR HERE ONCE THE ENGINE AND MATCH ARCHIVE ARE LIVE
          </div>
        </div>
      </aside>
    </div>
  );
}

function CompareDrawer({ players, fxOf, onClose }) {
  const colors = [T.green, T.cyan, T.tag];
  const rows = [
    ["PRICE", (p) => `£${p.price.toFixed(1)}`, (p) => -p.price],
    ["OWN%", (p) => `${p.own.toFixed(1)}%`, (p) => -p.own],
    ["CHANCE NEXT GW", (p) => (p.chance_of_playing === null ? "100%" : `${p.chance_of_playing}%`), (p) => (p.chance_of_playing === null ? 100 : p.chance_of_playing)],
    ["NEXT", (p) => { const f = fxOf(p)[0]; return f ? fixLabel(f) : "—"; }, null],
    ["STATUS", (p) => (riskInfo(p) || "Fit").toUpperCase(), null],
  ];
  const best = (row) => {
    if (!row[2]) return -1;
    const vals = players.map(row[2]);
    return vals.indexOf(Math.max(...vals));
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", justifyContent: "flex-end", background: "rgba(6,0,10,0.6)" }}>
      <aside className="fb-drawer" onClick={(e) => e.stopPropagation()} style={{ width: 340 + players.length * 170, maxWidth: 820, height: "100%", overflowY: "auto", background: T.bgRaise, borderLeft: `1px solid ${T.line}` }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 26px", borderBottom: `1px solid ${T.line}` }}>
          <div>
            <div style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12.5, letterSpacing: "0.1em", textTransform: "uppercase" }}>Player comparison</div>
            <div style={{ marginTop: 6, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 13 }}>GREEN PLATE = BEST IN ROW · OWN% AND PRICE BEST = LOWEST</div>
          </div>
          <CloseBtn onClick={onClose} />
        </header>
        <div style={{ padding: "22px 26px", display: "grid", gap: 9, gridTemplateColumns: `128px repeat(${players.length}, 1fr)` }}>
          <span />
          {players.map((p, i) => (
            <div key={p.fpl_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, background: T.card, border: `1px solid ${colors[i]}`, borderRadius: 14, padding: "12px 6px" }}>
              <Face code={p.code} team={p.team} size={46} />
              <span style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14.5, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{p.web_name}</span>
              <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team} · {POS_LABEL[p.position]}</span>
            </div>
          ))}
          {rows.map((row) => {
            const b = best(row);
            return (
              <React.Fragment key={row[0]}>
                <span style={{ display: "flex", alignItems: "center", color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{row[0]}</span>
                {players.map((p, i) => (
                  <Plate key={p.fpl_id} h={38} bg={i === b ? "#06331D" : T.card} color={i === b ? T.green : "#FFFFFF"}>{row[1](p)}</Plate>
                ))}
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ padding: "0 26px 26px", color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, lineHeight: 1.65 }}>
          PROJECTION FANS, FORM AND xG ROWS JOIN THIS VIEW ONCE THE ENGINE IS LIVE
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
  const [maxP, setMaxP] = React.useState("ALL");
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

  // Esc closes drawers · "/" focuses search
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setProfileP(null); setCmpOpen(false); }
      if (e.key === "/" && document.activeElement !== searchRef.current) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clubs = React.useMemo(() => core ? ["ALL", ...Object.values(core.teamById).map((t) => t.short_name).sort()] : ["ALL"], [core]);
  const fxOf = React.useCallback((p) => core ? nextFixtures(core.fixtures, core.teamById, p.team_id, 6) : [], [core]);

  const list = React.useMemo(() => {
    if (!core) return [];
    let l = core.players;
    if (pos !== "ALL") l = l.filter((p) => POS_LABEL[p.position] === pos);
    if (q) l = l.filter((p) => (p.web_name + " " + p.name + " " + p.team).toLowerCase().includes(q.toLowerCase()));
    if (club !== "ALL") l = l.filter((p) => p.team === club);
    if (maxP !== "ALL") l = l.filter((p) => p.price <= Number(maxP));
    if (diffs) l = l.filter((p) => p.own <= 15 && p.price >= 5.5);
    const by = {
      "OWN%": (a, b) => b.own - a.own,
      "PRICE ↓": (a, b) => b.price - a.price,
      "PRICE ↑": (a, b) => a.price - b.price,
      "NAME": (a, b) => a.web_name.localeCompare(b.web_name),
    }[sort];
    return [...l].sort(by);
  }, [core, pos, q, club, maxP, diffs, sort]);

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
          <Search size={16} color={T.faint} />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search name or club… ("/" to focus)'
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#FFFFFF", fontFamily: FB, fontSize: 15, fontWeight: 600 }} />
        </div>
        <span style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>{list.length} SHOWN</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Sel label="Club" value={club} onChange={setClub} options={clubs} />
        <Sel label="Max £" value={maxP} onChange={setMaxP} options={["ALL", "5.0", "6.0", "7.5", "9.0", "11.0"]} />
        <Sel label="Sort" value={sort} onChange={setSort} options={["OWN%", "PRICE ↓", "PRICE ↑", "NAME"]} />
        <Toggle on={diffs} onClick={() => setDiffs(!diffs)} tag>DIFFERENTIALS</Toggle>
        <Toggle on={cmpMode} onClick={() => { setCmpMode(!cmpMode); if (cmpMode) { setCmp([]); setCmpOpen(false); } }}>COMPARE</Toggle>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 14 }}>
        {!core ? <SkeletonRows n={9} h={S.row} /> : (
          <div style={{ maxHeight: "62vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ position: "sticky", top: 0, zIndex: 1, background: T.card, display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "0 10px", height: 30 }}>
              {COLS.map((c, i) => (
                <span key={c} style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: i === 0 ? "left" : "center" }}>{c}</span>
              ))}
            </div>
            {list.slice(0, 200).map((p) => {
              const selected = cmp.some((x) => x.fpl_id === p.fpl_id);
              const f = fxOf(p)[0];
              const risk = riskInfo(p);
              return (
                <button key={p.fpl_id} onClick={() => (cmpMode ? toggleCmp(p) : setProfileP(p))} className="fb-hover"
                  style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "0 10px", height: S.row, borderRadius: S.radiusSm, textAlign: "left",
                    background: selected ? "#06331D" : T.bgRaise, border: `1px solid ${selected ? T.green : "transparent"}` }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Kit team={p.team} size={23} />
                    <span style={{ color: "#FFFFFF", fontFamily: FB, fontSize: S.name, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                    <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12.5, flexShrink: 0 }}>{p.team} · {POS_LABEL[p.position]}</span>
                    {p.own >= 40 && <span style={{ flexShrink: 0, display: "flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999, background: T.tag, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, lineHeight: 1 }}>TPL</span>}
                  </span>
                  <Plate>{f ? fixLabel(f) : "—"}</Plate>
                  <Plate color={T.dim}>£{p.price.toFixed(1)}</Plate>
                  <Plate>{p.own.toFixed(1)}%</Plate>
                  <Plate color={p.chance_of_playing !== null && p.chance_of_playing < 70 ? T.pink : T.dim}>
                    {p.chance_of_playing === null ? "100%" : `${p.chance_of_playing}%`}
                  </Plate>
                  <Plate color={risk ? T.pink : T.green}>{risk ? "FLAG" : "FIT"}</Plate>
                </button>
              );
            })}
            {list.length === 0 && <div style={{ padding: "40px 0", textAlign: "center", color: T.dim, fontFamily: FB, fontSize: 16 }}>No players match.</div>}
          </div>
        )}
      </div>
      <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
        CLICK A ROW FOR THE PROFILE · COMPARE MODE: CLICK ROWS TO SELECT 2–3 · ESC CLOSES DRAWERS · SHOWING TOP 200 OF {list.length}
      </div>

      {cmpMode && cmp.length > 0 && (
        <div style={{ position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)", zIndex: 30, display: "flex", alignItems: "center", gap: 9,
          background: T.bgRaise, border: `1px solid ${T.line}`, borderRadius: 999, padding: "9px 13px", boxShadow: "0 10px 34px rgba(0,0,0,0.55)" }}>
          {cmp.map((p) => (
            <span key={p.fpl_id} style={{ display: "flex", alignItems: "center", gap: 7, height: 36, padding: "0 12px", borderRadius: 999, background: T.card, color: "#FFFFFF", fontFamily: FB, fontSize: 14, fontWeight: 700 }}>
              {p.web_name}
              <button onClick={() => toggleCmp(p)} style={{ display: "flex" }}><X size={13} color={T.dim} /></button>
            </span>
          ))}
          <button disabled={cmp.length < 2} onClick={() => setCmpOpen(true)} className="fb-press"
            style={{ height: 36, padding: "0 18px", borderRadius: 999, fontFamily: FB, fontSize: 14, fontWeight: 700,
              background: cmp.length >= 2 ? T.green : T.card, color: cmp.length >= 2 ? "#04130A" : T.faint }}>
            COMPARE {cmp.length}
          </button>
        </div>
      )}
      {profileP && <Profile p={profileP} fx={fxOf(profileP)} onClose={() => setProfileP(null)} onCompare={addFromProfile} />}
      {cmpOpen && cmp.length >= 2 && <CompareDrawer players={cmp} fxOf={fxOf} onClose={() => setCmpOpen(false)} />}
    </div>
  );
}
