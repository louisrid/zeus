"use client";
import React from "react";
import Link from "next/link";
import { loadCore, nextFixtures } from "../../lib/data";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { buildXPrice } from "../../lib/xprice.mjs";
import { T, S, Kit, Value, Status, Label, Skeleton, SkeletonRows, ErrorCard, lang, code } from "../../lib/ui";
import Opp from "../../components/Opp";
import PlayerControls from "../../components/PlayerControls";
import { SORT_KEYS, DEFAULT_SORT, cycleSort, sortArrow, COL_WIDTH } from "../../lib/sorting.mjs";

/* THE PLAYERS PAGE.
 *
 * One sort state read by both the SORT BY dropdown and the column headings, so the two can never show
 * different things. Every filter is continuous or defaults to ANY. The fixtures column always shows the
 * next three regardless of the gameweek slider, because the slider is about how far xPTS looks ahead, not
 * about which fixtures a player has.
 */

const ROW_H = 66;   // taller than the old 58, so a row is easier to read

/* The columns, generated from the same list that fills the SORT BY dropdown. */
const COLS = [
  { key: "FIXTURES", label: "NEXT THREE", w: "176px", sortable: false },
  ...SORT_KEYS.map((s) => ({ key: s.key, label: s.label, w: COL_WIDTH[s.key], sortable: true })),
  { key: "STATUS", label: "STATUS", w: "88px", sortable: false },
];

export default function Players() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const [q, setQ] = React.useState("");
  const [position, setPosition] = React.useState("ANY");
  const [club, setClub] = React.useState("ANY");
  const [price, setPrice] = React.useState(null);
  const [sort, setSort] = React.useState(DEFAULT_SORT);
  const [gwFrom, setGwFrom] = React.useState(1);
  const [gwTo, setGwTo] = React.useState(1);
  const rangeInitialisedForGw = React.useRef(null);
  const setRange = React.useCallback((a, b) => { setGwFrom(a); setGwTo(b); }, []);
  const [compare, setCompare] = React.useState(false);
  const [picked, setPicked] = React.useState([]);

  const load = React.useCallback(() => {
    setErr(false);
    loadCore().then((c) => { setCore(c); return loadModel(c).then(setModel); }).catch(() => setErr(true));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const scale = React.useMemo(() => (core ? buildOpponentScale(core.teamById) : null), [core]);

  const clubList = React.useMemo(() => (core
    ? Object.values(core.teamById).sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    : []), [core]);

  const priceBounds = React.useMemo(() => {
    if (!core) return [4, 15];
    const ps = core.players.map((p) => Number(p.price)).filter(Number.isFinite);
    return ps.length ? [Math.floor(Math.min(...ps) * 10) / 10, Math.ceil(Math.max(...ps) * 10) / 10] : [4, 15];
  }, [core]);
  React.useEffect(() => { if (price === null && core) setPrice(priceBounds); }, [core, price, priceBounds]);

  /* The selected window starts at the live model gameweek and exposes the next eight fixtures. Future
     weeks remain scoreable through direct engine rows first and the engine-anchored fixture route after
     the stored projection horizon. */
  const firstGw = model && Number.isFinite(Number(model.gw)) ? Number(model.gw) : 1;
  const lastGw = React.useMemo(() => {
    const fixtureGws = core ? (core.fixtures || []).map((f) => Number(f.gw)).filter(Number.isFinite) : [];
    const seasonLast = fixtureGws.length ? Math.max(...fixtureGws) : firstGw;
    return Math.max(firstGw, Math.min(seasonLast, firstGw + 7));
  }, [core, firstGw]);
  React.useEffect(() => {
    if (!model || rangeInitialisedForGw.current === firstGw) return;
    setRange(firstGw, firstGw);
    rangeInitialisedForGw.current = firstGw;
  }, [model, firstGw, setRange]);

  const fixturesOf = React.useCallback((p) => (core
    ? nextFixtures(core.fixtures, core.teamById, p.team_id, 3)
    : []), [core]);

  /* xPTS across the selected gameweeks. The fixtures column ignores this entirely. */
  const xpts = React.useCallback((p) => {
    if (!model || !core) return null;
    // Sum the chosen gameweeks, not the next N, so GW2 to GW4 works. A blank in the window contributes
    // nothing; a double contributes both fixtures.
    let total = 0, seen = 0;
    for (let gw = gwFrom; gw <= gwTo; gw++) {
      const v = model.scoreForGw(p, gw);
      if (v !== null && v !== undefined) { total += Number(v); seen++; }
    }
    return seen ? total : null;
  }, [model, core, gwFrom, gwTo]);

  const xprice = React.useMemo(() => {
    if (!core || !model) return null;
    return buildXPrice(core.players,
      (p) => model.lastSeasonPoints(p) ?? 0,
      (p) => (model.lastSeasonPoints(p) === null ? "none" : "archive"));
  }, [core, model]);

  /* VALUE is projected points per million, so it moves with the gameweek slider. x£ answers a different
     question, what he should COST from last season's points, and never moves with it. */
  const valueOf = React.useCallback((p) => {
    const x = xpts(p);
    const pr = Number(p.price);
    return x === null || !pr ? null : x / pr;
  }, [xpts]);

  const gametimeOf = React.useCallback((p) => {
    const s = model ? model.startProbOf(p) : null;
    return s === null ? null : s * 100;
  }, [model]);

  const readers = React.useMemo(() => ({
    PRICE: (p) => Number(p.price),
    XPTS: xpts,
    VALUE: valueOf,
    XPRICE: (p) => { const x = xprice ? xprice.of(p) : null; return x ? x.xprice : null; },
    FORM: (p) => (p.form === null || p.form === undefined ? null : Number(p.form)),
    PTS_LAST_YEAR: (p) => (model ? model.lastSeasonPoints(p) : null),
    GAMETIME: gametimeOf,
    OWNERSHIP: (p) => (p.own === null || p.own === undefined ? null : Number(p.own)),
  }), [xpts, valueOf, xprice, model, gametimeOf]);

  const list = React.useMemo(() => {
    if (!core || !price) return [];
    let l = core.players;
    if (position !== "ANY") l = l.filter((p) => p.position === position);
    if (club !== "ANY") l = l.filter((p) => p.team === club);
    if (q) {
      const needle = q.toLowerCase();
      l = l.filter((p) => (`${p.web_name} ${p.name || ""} ${p.team}`).toLowerCase().includes(needle));
    }
    l = l.filter((p) => Number(p.price) >= price[0] - 1e-9 && Number(p.price) <= price[1] + 1e-9);

    const read = readers[sort.key] || readers.PRICE;
    const missing = sort.dir === "desc" ? -Infinity : Infinity;
    return [...l].sort((a, b) => {
      const av = read(a) ?? missing, bv = read(b) ?? missing;
      return sort.dir === "desc" ? bv - av : av - bv;
    });
  }, [core, price, position, club, q, sort, readers]);

  const reset = () => {
    setQ(""); setPosition("ANY"); setClub("ANY"); setPrice(priceBounds);
    setSort(DEFAULT_SORT); setRange(firstGw, firstGw); setCompare(false); setPicked([]);
  };

  const fmt = (key, v) => {
    if (v === null || v === undefined) return ",";
    if (key === "PRICE" || key === "XPRICE") return Number(v).toFixed(1);
    if (key === "VALUE") return Number(v).toFixed(2);
    if (key === "GAMETIME" || key === "OWNERSHIP") return `${Math.round(v)}%`;
    if (key === "PTS_LAST_YEAR") return String(Math.round(v));
    return Number(v).toFixed(1);
  };

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || !price) {
    return <div data-zeus-ui-version="core-restoration-v2" style={{ display: "flex", flexDirection: "column", gap: S.gap }}><Skeleton h={150} /><SkeletonRows n={10} h={ROW_H} /></div>;
  }

  const grid = COLS.map((c) => c.w).join(" ");
  const gridWithName = `minmax(210px,1fr) ${grid}`;

  return (
    <div data-zeus-ui-version="core-restoration-v2" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <PlayerControls
        q={q} setQ={setQ} position={position} setPosition={setPosition}
        price={price} setPrice={setPrice} priceBounds={priceBounds}
        sort={sort} setSort={setSort}
        club={club} setClub={setClub} clubs={clubList}
        gwFrom={gwFrom} gwTo={gwTo} setRange={setRange} maxGw={lastGw}
        gameweekDescription="xPTS and VALUE add up across the selected gameweeks."
        compare={compare} setCompare={setCompare} onReset={reset} firstGw={firstGw} />

      {compare && picked.length > 0 && (
        <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 16,
          display: "flex", flexDirection: "column", gap: 8 }}>
          <Label color={T.cyan}>Comparing {picked.length} of 3</Label>
          <div style={{ display: "grid", gridTemplateColumns: `150px repeat(${picked.length}, 1fr)`, gap: 8 }}>
            <span />
            {picked.map((p) => <span key={p.fpl_id} style={{ ...lang(14.5, 700), textAlign: "center" }}>{p.web_name}</span>)}
            {COLS.filter((c) => c.sortable).map((c) => (
              <React.Fragment key={c.key}>
                <span style={code(13)}>{c.label}</span>
                {picked.map((p) => (
                  <span key={p.fpl_id} style={{ display: "flex", justifyContent: "center" }}>
                    <Value>{fmt(c.key, readers[c.key](p))}</Value>
                  </span>
                ))}
              </React.Fragment>
            ))}
          </div>
        </section>
      )}

      <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 14 }}>
        {/* Headings. Clicking a sortable one cycles exactly as the dropdown does. */}
        <div style={{ display: "grid", gridTemplateColumns: gridWithName, gap: 8, alignItems: "center",
          padding: "0 10px", height: 34 }}>
          <span style={code(13)}>PLAYER</span>
          {COLS.map((c) => (
            c.sortable ? (
              <button key={c.key} onClick={() => setSort(cycleSort(sort, c.key))}
                style={{ ...code(13, sort.key === c.key ? T.green : "#FFFFFF"), textAlign: "center", cursor: "pointer" }}>
                {c.label}{sortArrow(sort, c.key)}
              </button>
            ) : (
              <span key={c.key} style={{ ...code(13), textAlign: "center" }}>{c.label}</span>
            )
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
          {list.slice(0, 200).map((p) => {
            const fx = fixturesOf(p);
            const chosen = picked.some((x) => x.fpl_id === p.fpl_id);
            const cells = (
              <>
                <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <Kit team={p.team} size={22} />
                  <span style={{ ...lang(14.5, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.web_name}
                  </span>
                  <span style={code(13)}>{p.team}</span>
                </span>

                {/* The next three. The first is full size, the two after it smaller. Never affected by the
                    gameweek slider. */}
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  {fx[0] ? <Opp fx={fx[0]} scale={scale} size="md" showNumber={false} /> : <span style={lang(13, 600)}>-</span>}
                  {fx.slice(1, 3).map((f, i) => (
                    <span key={i} style={{ transform: "scale(0.82)", transformOrigin: "center" }}>
                      <Opp fx={f} scale={scale} size="sm" showNumber={false} />
                    </span>
                  ))}
                </span>

                {COLS.filter((c) => c.sortable).map((c) => (
                  <span key={c.key} style={{ display: "flex", justifyContent: "center" }}>
                    <Value color={c.key === "XPTS" ? T.xp : c.key === "XPRICE" && xprice
                      ? (() => { const x = xprice.of(p); return !x ? "#FFFFFF" : x.verdict === "under" ? T.green : x.verdict === "over" ? T.pink : "#FFFFFF"; })()
                      : "#FFFFFF"}>
                      {fmt(c.key, readers[c.key](p))}
                    </Value>
                  </span>
                ))}

                <span style={{ display: "flex", justifyContent: "center" }}><Status p={p} /></span>
              </>
            );
            const style = {
              display: "grid", gridTemplateColumns: gridWithName, gap: 8, alignItems: "center",
              padding: "0 10px", height: ROW_H, borderRadius: S.radiusSm, textAlign: "left",
              background: chosen ? "#06331D" : T.row,
              border: `1px solid ${chosen ? T.green : "transparent"}`, width: "100%",
            };
            if (compare) {
              return (
                <button key={p.fpl_id} className="fb-hover" style={style}
                  onClick={() => setPicked((cur) => cur.some((x) => x.fpl_id === p.fpl_id)
                    ? cur.filter((x) => x.fpl_id !== p.fpl_id)
                    : cur.length >= 3 ? cur : [...cur, p])}>
                  {cells}
                </button>
              );
            }
            return (
              <Link key={p.fpl_id} href={`/player/${p.fpl_id}`} className="fb-hover"
                style={{ ...style, textDecoration: "none", color: "inherit" }}>
                {cells}
              </Link>
            );
          })}
          {list.length === 0 && <span style={{ ...lang(15, 600), padding: 12 }}>No players match.</span>}
        </div>
      </section>
    </div>
  );
}
