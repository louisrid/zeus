"use client";
import React from "react";
import { Search, X, Flag } from "lucide-react";
import { T, FB, S, Kit, Face, Label, Plate, Donut, POS_LABEL, riskInfo, SkeletonRows, ErrorCard, Status, lang, val, code } from "../../lib/ui";
import { loadCore, nextFixtures, fixLabel } from "../../lib/data";

const GRID = "minmax(220px,1fr) 96px 74px 74px 66px 66px 92px 96px";
const COLS = ["Player", "Next", "Price", "Own%", "Pts", "Form", "Start %", "Status"];

function Toggle({ on, onClick, children, tag }) {
  return (
    <button onClick={onClick} className="fb-press" style={{ height: 40, padding: "0 16px", borderRadius: 999, ...lang(13.5, 700, on ? (tag ? "#FFFFFF" : "#04130A") : "#FFFFFF"),
      background: on ? (tag ? T.tag : T.green) : T.card,
      border: `1px solid ${on ? (tag ? T.tag : T.green) : T.line}` }}>
      {children}
    </button>
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
  "OWN%": "Ownership is template exposure, not quality. High means the field already owns him, so he protects rank rather than gaining it.",
  "PTS": "Season total. Backward looking and minutes-inflated, so treat it as a floor check rather than a forecast.",
  "FORM": "Points per game over the last five. Short sample, so it moves on one big score.",
  "PRICE ↓": "Most expensive first. Use it to see what the premium tier actually costs before committing budget.",
  "PRICE ↑": "Cheapest first. This is the enabler search, judge these on start probability rather than points.",
  "NAME": "Alphabetical. No decision basis, use it to find a specific player.",
};
const DIFF_OWN = 15;
const DIFF_PRICE = 5.5;
const CloseBtn = ({ onClick }) => (
  <button onClick={onClick} className="fb-press" style={{ width: 38, height: 38, borderRadius: 19, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <X size={17} color="#FFFFFF" />
  </button>
);

function Profile({ p, fx, onClose, onCompare }) {
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
                  <span style={lang(14.5)}>{l}</span><Plate h={S.plate} w={78} color={c}>{v}</Plate>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span style={lang(14.5)}>Next 6 fixtures</span>
            <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
              {fx.length === 0 && <span style={lang(14)}>Not published yet</span>}
              {fx.map((f, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <div style={{ width: "100%", height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8,
                    background: f.home ? "#123B27" : T.plate, border: `1px solid ${T.line}` }}>
                    <span style={code(13)}>{f.home ? f.opp : f.opp.toLowerCase()}</span>
                  </div>
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
          <button onClick={() => onCompare(p)} className="fb-press" style={{ height: S.btn, borderRadius: 999, background: T.green, ...lang(15, 700, "#04130A") }}>
            ADD TO COMPARISON
          </button>
        </div>
      </aside>
    </div>
  );
}

function CompareDrawer({ players, fxOf, onClose }) {
  const colors = [T.green, T.cyan, T.tag];
  const rows = [
    ["Price", (p) => p.price.toFixed(1), (p) => -p.price],
    ["Own%", (p) => `${p.own.toFixed(1)}%`, (p) => -p.own],
    ["Points", (p) => `${p.total_points ?? 0}`, (p) => p.total_points ?? 0],
    ["Form", (p) => (p.form === null || p.form === undefined ? "0.0" : Number(p.form).toFixed(1)), (p) => Number(p.form) || 0],
    ["Chance next GW", (p) => (p.chance_of_playing === null ? "100%" : `${p.chance_of_playing}%`), (p) => (p.chance_of_playing === null ? 100 : p.chance_of_playing)],
    ["Next", (p) => { const f = fxOf(p)[0]; return f ? fixLabel(f) : "—"; }, null],
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
            <div key={p.fpl_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, background: T.card, border: `1px solid ${colors[i]}`, borderRadius: 14, padding: "12px 6px" }}>
              <Face code={p.code} team={p.team} size={46} />
              <span style={{ ...lang(15, 700), textAlign: "center", lineHeight: 1.2 }}>{p.web_name}</span>
              <span style={val(12, "#FFFFFF", 500)}>{p.team} · {POS_LABEL[p.position]}</span>
            </div>
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
                      ? <div key={p.fpl_id} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 38, borderRadius: 10, background: T.card }}><span style={code(13)}>{row[1](p)}</span></div>
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
  }, [core, pos, q, club, maxP, diffs, sort]);

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

  const filtered = pos !== "ALL" || q !== "" || club !== "ALL" || maxP !== "ALL" || diffs || sort !== "OWN%";
  const clearAll = () => { setPos("ALL"); setQ(""); setClub("ALL"); setMaxP("ALL"); setDiffs(false); setSort("OWN%"); };

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
        <Sel label="Max price" value={maxP} onChange={setMaxP} options={["ALL", "5.0", "6.0", "7.5", "9.0", "11.0"]}
          labelOf={(o) => (o === "ALL" ? `ALL (${counts.total})` : `${o} (${counts.price[o] ?? 0})`)} />
        <Sel label="Sort" value={sort} onChange={setSort} options={["OWN%", "PTS", "FORM", "PRICE ↓", "PRICE ↑", "NAME"]} />
        <Toggle on={diffs} onClick={() => setDiffs(!diffs)} tag>{`DIFFERENTIALS ≤${DIFF_OWN}% · ≥${DIFF_PRICE.toFixed(1)} (${counts.diffs})`}</Toggle>
        <Toggle on={cmpMode} onClick={() => { setCmpMode(!cmpMode); if (cmpMode) { setCmp([]); setCmpOpen(false); } }}>COMPARE</Toggle>
        {filtered && <Toggle on={false} onClick={clearAll}>CLEAR ALL</Toggle>}
      </div>
      <p style={{ ...lang(14, 600), lineHeight: 1.55, margin: 0 }}>{SORT_BASIS[sort]}</p>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 14 }}>
        {!core ? <SkeletonRows n={9} h={S.row} /> : (
          <div style={{ maxHeight: "66vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ position: "sticky", top: 0, zIndex: 1, background: T.card, display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "0 10px", height: 30 }}>
              {COLS.map((c, i) => (
                <span key={c} style={{ ...lang(13.5, 600), textAlign: i === 0 ? "left" : "center" }}>{c}</span>
              ))}
            </div>
            {list.slice(0, 200).map((p) => {
              const selected = cmp.some((x) => x.fpl_id === p.fpl_id);
              const f = fxOf(p)[0];
              return (
                <button key={p.fpl_id} onClick={() => (cmpMode ? toggleCmp(p) : setProfileP(p))} className="fb-hover"
                  style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "0 10px", height: S.row, borderRadius: S.radiusSm, textAlign: "left",
                    background: selected ? "#06331D" : T.row, border: `1px solid ${selected ? T.green : "transparent"}` }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Kit team={p.team} size={23} />
                    <span style={{ ...lang(S.name, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                    <span style={{ ...code(), flexShrink: 0 }}>{p.team} · {POS_LABEL[p.position]}</span>
                    {p.own >= 40 && <span style={{ flexShrink: 0, display: "flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999, background: T.tag, ...val(12, "#FFFFFF", 500) }}>TPL</span>}
                  </span>
                  <span style={{ ...code(13), textAlign: "center" }}>{f ? fixLabel(f) : "—"}</span>
                  <Plate>{p.price.toFixed(1)}</Plate>
                  <Plate>{p.own.toFixed(1)}%</Plate>
                  <span style={{ ...val(S.data), textAlign: "center" }}>{p.total_points ?? 0}</span>
                  <span style={{ ...val(S.data), textAlign: "center" }}>{p.form === null || p.form === undefined ? "0.0" : Number(p.form).toFixed(1)}</span>
                  <span style={{ ...val(S.data, p.chance_of_playing !== null && p.chance_of_playing < 70 ? T.pink : "#FFFFFF"), textAlign: "center" }}>
                    {p.chance_of_playing === null ? "100%" : `${p.chance_of_playing}%`}
                  </span>
                  <span style={{ textAlign: "center" }}><Status p={p} /></span>
                </button>
              );
            })}
            {list.length === 0 && <div style={{ padding: "40px 0", textAlign: "center", ...lang(16) }}>No players match.</div>}
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
      {profileP && <Profile p={profileP} fx={fxOf(profileP)} onClose={() => setProfileP(null)} onCompare={addFromProfile} />}
      {cmpOpen && cmp.length >= 2 && <CompareDrawer players={cmp} fxOf={fxOf} onClose={() => setCmpOpen(false)} />}
    </div>
  );
}
