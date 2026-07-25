"use client";
import React from "react";
import { T, FB, FN, FNW, Kit, Label, Plate, Donut, POS_LABEL, riskInfo } from "../_lib/ui";
import { loadCore, nextFixtures, fixLabel } from "../_lib/data";

const GRID = "minmax(200px,1fr) 90px 70px 70px 90px 110px";
const COLS = ["Player", "Next", "Price", "Own%", "Start %", "Status"];

function Toggle({ on, onClick, children, tag }) {
  return (
    <button onClick={onClick} style={{ height: 36, padding: "0 14px", borderRadius: 999, fontFamily: FB, fontSize: 12.5, fontWeight: 700,
      background: on ? (tag ? T.tag : T.green) : T.card, color: on ? (tag ? "#FFFFFF" : "#04130A") : T.dim,
      border: `1px solid ${on ? (tag ? T.tag : T.green) : T.line}` }}>
      {children}
    </button>
  );
}
function Sel({ label, value, onChange, options }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: "0 10px", height: 38 }}>
      <span style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12, textTransform: "uppercase" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: "transparent", border: "none", outline: "none", color: "#FFFFFF", fontFamily: FB, fontSize: 13.5, fontWeight: 700 }}>
        {options.map((o) => <option key={o} value={o} style={{ background: T.bgRaise, color: "#FFFFFF" }}>{o}</option>)}
      </select>
    </label>
  );
}

function Profile({ p, fx, onClose, onCompare }) {
  const risk = riskInfo(p);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", justifyContent: "flex-end", background: "rgba(6,0,10,0.6)" }}>
      <aside onClick={(e) => e.stopPropagation()} style={{ width: 460, height: "100%", overflowY: "auto", background: T.bgRaise, borderLeft: `1px solid ${T.line}` }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, background: T.bgRaise, zIndex: 1 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Kit team={p.team} size={36} />
            <div>
              <div style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{p.web_name}</div>
              <div style={{ marginTop: 6, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>
                {p.team} · {POS_LABEL[p.position]} · £{p.price.toFixed(1)}
              </div>
              {risk && <div style={{ marginTop: 5, color: T.pink, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>⚑ {risk.toUpperCase()}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 17, border: `1px solid ${T.line}`, color: T.dim, fontFamily: FB, fontSize: 15, fontWeight: 700 }}>✕</button>
        </header>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <Donut value={p.own} total={100} label="OWNED" sub={"SHARE OF ALL MANAGERS\nWHO OWN HIM"} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Label>Price</Label><Plate h={32} w={70}>£{p.price.toFixed(1)}</Plate>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Label>Ownership</Label><Plate h={32} w={70}>{p.own.toFixed(1)}%</Plate>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Label>Chance next GW</Label>
                <Plate h={32} w={70} color={p.chance_of_playing !== null && p.chance_of_playing < 70 ? T.pink : "#FFFFFF"}>
                  {p.chance_of_playing === null ? "100%" : `${p.chance_of_playing}%`}
                </Plate>
              </div>
            </div>
          </div>
          <div>
            <Label>Next 6 fixtures</Label>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {fx.length === 0 && <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>NOT PUBLISHED YET</span>}
              {fx.map((f, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: "100%", height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6,
                    background: f.home ? "#123B27" : "#0D0014", border: `1px solid ${T.line}`, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
                    {f.home ? f.opp : f.opp.toLowerCase()}
                  </div>
                  <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>GW{f.gw}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>GREEN TINT = HOME</div>
          </div>
          {p.news && (
            <div style={{ background: "#3A0217", borderRadius: 12, padding: "12px 14px", color: "#FFFFFF", fontFamily: FB, fontSize: 13.5, lineHeight: 1.5 }}>
              ⚑ {p.news}
            </div>
          )}
          <button onClick={() => onCompare(p)} style={{ height: 46, borderRadius: 999, background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14, fontWeight: 700 }}>
            ADD TO COMPARISON
          </button>
          <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, lineHeight: 1.6 }}>
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
    ["NEXT", (p) => { const f = fxOf(p)[0]; return f ? fixLabel(f) : "TBC"; }, null],
    ["STATUS", (p) => (riskInfo(p) || "Fit").toUpperCase(), null],
  ];
  const best = (row) => {
    if (!row[2]) return -1;
    const vals = players.map(row[2]);
    return vals.indexOf(Math.max(...vals));
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", justifyContent: "flex-end", background: "rgba(6,0,10,0.6)" }}>
      <aside onClick={(e) => e.stopPropagation()} style={{ width: 320 + players.length * 160, maxWidth: 780, height: "100%", overflowY: "auto", background: T.bgRaise, borderLeft: `1px solid ${T.line}` }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${T.line}` }}>
          <div>
            <div style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>Player comparison</div>
            <div style={{ marginTop: 5, color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12.5 }}>GREEN PLATE = BEST IN ROW · OWN% AND PRICE BEST = LOWEST</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 17, border: `1px solid ${T.line}`, color: T.dim, fontFamily: FB, fontSize: 15, fontWeight: 700 }}>✕</button>
        </header>
        <div style={{ padding: "20px 24px", display: "grid", gap: 8, gridTemplateColumns: `120px repeat(${players.length}, 1fr)` }}>
          <span />
          {players.map((p, i) => (
            <div key={p.fpl_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: T.card, border: `1px solid ${colors[i]}`, borderRadius: 12, padding: "10px 4px" }}>
              <Kit team={p.team} size={24} />
              <span style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 13.5, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{p.web_name}</span>
              <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{p.team} · {POS_LABEL[p.position]}</span>
            </div>
          ))}
          {rows.map((row) => {
            const b = best(row);
            return (
              <React.Fragment key={row[0]}>
                <span style={{ display: "flex", alignItems: "center", color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{row[0]}</span>
                {players.map((p, i) => (
                  <Plate key={p.fpl_id} h={34} bg={i === b ? "#06331D" : T.card} color={i === b ? T.green : "#FFFFFF"}>{row[1](p)}</Plate>
                ))}
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ padding: "0 24px 24px", color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, lineHeight: 1.6 }}>
          PROJECTION FANS, FORM AND xG ROWS JOIN THIS VIEW ONCE THE ENGINE IS LIVE
        </div>
      </aside>
    </div>
  );
}

export default function Players() {
  const [core, setCore] = React.useState(null);
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

  React.useEffect(() => { loadCore().then(setCore); }, []);

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

  if (!core) return <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 13, paddingTop: 24 }}>LOADING LIVE DATA…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {["ALL", "GK", "DEF", "MID", "FWD"].map((k) => (
          <Toggle key={k} on={pos === k} onClick={() => setPos(k)}>{k}</Toggle>
        ))}
        <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 8, background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: "0 12px", height: 38 }}>
          <span style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or club…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#FFFFFF", fontFamily: FB, fontSize: 14, fontWeight: 600 }} />
        </div>
        <span style={{ color: T.dim, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>{list.length} SHOWN</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Sel label="Club" value={club} onChange={setClub} options={clubs} />
        <Sel label="Max £" value={maxP} onChange={setMaxP} options={["ALL", "5.0", "6.0", "7.5", "9.0", "11.0"]} />
        <Sel label="Sort" value={sort} onChange={setSort} options={["OWN%", "PRICE ↓", "PRICE ↑", "NAME"]} />
        <Toggle on={diffs} onClick={() => setDiffs(!diffs)} tag>DIFFERENTIALS</Toggle>
        <Toggle on={cmpMode} onClick={() => { setCmpMode(!cmpMode); if (cmpMode) { setCmp([]); setCmpOpen(false); } }}>COMPARE</Toggle>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 16, padding: 12 }}>
        <div style={{ maxHeight: "62vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ position: "sticky", top: 0, zIndex: 1, background: T.card, display: "grid", gridTemplateColumns: GRID, gap: 6, alignItems: "center", padding: "0 8px", height: 28 }}>
            {COLS.map((c, i) => (
              <span key={c} style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: i === 0 ? "left" : "center" }}>{c}</span>
            ))}
          </div>
          {list.slice(0, 200).map((p) => {
            const selected = cmp.some((x) => x.fpl_id === p.fpl_id);
            const f = fxOf(p)[0];
            const risk = riskInfo(p);
            return (
              <button key={p.fpl_id} onClick={() => (cmpMode ? toggleCmp(p) : setProfileP(p))}
                style={{ display: "grid", gridTemplateColumns: GRID, gap: 6, alignItems: "center", padding: "0 8px", height: 50, borderRadius: 12, textAlign: "left",
                  background: selected ? "#06331D" : T.bgRaise, border: `1px solid ${selected ? T.green : "transparent"}` }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Kit team={p.team} size={20} />
                  <span style={{ color: "#FFFFFF", fontFamily: FB, fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                  <span style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, flexShrink: 0 }}>{p.team} · {POS_LABEL[p.position]}</span>
                  {p.own >= 40 && <span style={{ flexShrink: 0, display: "flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: 999, background: T.tag, color: "#FFFFFF", fontFamily: FN, fontWeight: FNW, fontSize: 12, lineHeight: 1 }}>TPL</span>}
                </span>
                <Plate>{f ? fixLabel(f) : "TBC"}</Plate>
                <Plate color={T.dim}>£{p.price.toFixed(1)}</Plate>
                <Plate>{p.own.toFixed(1)}%</Plate>
                <Plate color={p.chance_of_playing !== null && p.chance_of_playing < 70 ? T.pink : T.dim}>
                  {p.chance_of_playing === null ? "100%" : `${p.chance_of_playing}%`}
                </Plate>
                <Plate color={risk ? T.pink : T.green}>{risk ? "⚑ FLAG" : "FIT"}</Plate>
              </button>
            );
          })}
          {list.length === 0 && <div style={{ padding: "36px 0", textAlign: "center", color: T.dim, fontFamily: FB, fontSize: 15 }}>No players match.</div>}
        </div>
      </div>
      <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12 }}>
        CLICK A ROW FOR THE PROFILE · COMPARE MODE: CLICK ROWS TO SELECT 2–3 · SHOWING TOP 200 OF {list.length}
      </div>

      {cmpMode && cmp.length > 0 && (
        <div style={{ position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)", zIndex: 30, display: "flex", alignItems: "center", gap: 8,
          background: T.bgRaise, border: `1px solid ${T.line}`, borderRadius: 999, padding: "8px 12px", boxShadow: "0 10px 34px rgba(0,0,0,0.55)" }}>
          {cmp.map((p) => (
            <span key={p.fpl_id} style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 999, background: T.card, color: "#FFFFFF", fontFamily: FB, fontSize: 13, fontWeight: 700 }}>
              {p.web_name}
              <button onClick={() => toggleCmp(p)} style={{ color: T.dim, fontSize: 12, fontFamily: FB, fontWeight: 700 }}>✕</button>
            </span>
          ))}
          <button disabled={cmp.length < 2} onClick={() => setCmpOpen(true)}
            style={{ height: 32, padding: "0 16px", borderRadius: 999, fontFamily: FB, fontSize: 13, fontWeight: 700,
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
