"use client";
import React from "react";
import Link from "next/link";
import { loadCore, nextFixtures } from "../../lib/data";
import { useIsMobile } from "../../lib/use-viewport.mjs";
import MobilePlayerList from "../../components/MobilePlayerList";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { buildXPrice } from "../../lib/xprice.mjs";
import { filterPlayerRows, sortPlayerRows, sumGameweekValues } from "../../lib/player-query.mjs";
import DEFCON from "../../config/defcon-2026-27.mjs";
import { T, S, Kit, ClubBar, Value, Label, Skeleton, SkeletonRows, ErrorCard, lang, code } from "../../lib/ui";
import Opp from "../../components/Opp";
import PlayerControls from "../../components/PlayerControls";
import { SORT_KEYS, DEFAULT_SORT, cycleSort, sortArrow, COL_WIDTH, metricColor, formatMetric } from "../../lib/sorting.mjs";

/* THE PLAYERS PAGE.
 *
 * One sort state read by both the SORT BY dropdown and the column headings, so the two can never show
 * different things. Filtering, range totals, deterministic sorting and pagination semantics live in
 * lib/player-query.mjs, which is also the source used by the external API and the full projections page.
 */

const ROW_H = 66;

const COLS = [
  { key: "FIXTURES", label: "NEXT THREE", w: "176px", sortable: false },
  ...SORT_KEYS.map((s) => ({ key: s.key, label: s.label, w: COL_WIDTH[s.key], sortable: true })),
];

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export default function Players() {
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const [q, setQ] = React.useState("");
  const [position, setPosition] = React.useState("ANY");
  const [club, setClub] = React.useState("ANY");
  const [price, setPrice] = React.useState(null);
  const [ownership, setOwnership] = React.useState(null);
  const [sort, setSort] = React.useState(DEFAULT_SORT);
  const isMobile = useIsMobile();
  const [gwFrom, setGwFrom] = React.useState(1);
  const [gwTo, setGwTo] = React.useState(1);
  const rangeInitialisedForGw = React.useRef(null);
  const setRange = React.useCallback((a, b) => { setGwFrom(a); setGwTo(b); }, []);
  /* COMPARE ARRIVING FROM A PLAYER PAGE.
   *
   * The Compare button on a player page linked here with ?compare=1 and nothing read it, so the mode
   * never switched on: you were sent to a list with comparison off and the player you came from
   * forgotten. Both halves are read now. ?with=<fpl_id> carries that player through so he is already
   * selected and you only have to pick who to measure him against. */
  const [compare, setCompare] = React.useState(false);
  const [picked, setPicked] = React.useState([]);
  const seededFrom = React.useRef(null);
  /* The query string is read from the browser rather than through useSearchParams, which opts a page out
     of static prerendering and failed the build. This runs after mount, where window exists and the page
     stays static. */
  React.useEffect(() => {
    if (!core || typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("compare") === "1") setCompare(true);
    const id = Number(q.get("with"));
    if (!Number.isFinite(id) || id <= 0 || seededFrom.current === id) return;
    const found = core.players.find((pl) => Number(pl.fpl_id) === id);
    if (!found) return;
    seededFrom.current = id;
    setCompare(true);
    setPicked((current) => (current.some((pl) => pl.fpl_id === id) ? current : [found, ...current].slice(0, 3)));
  }, [core]);

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
    return ps.length ? [Math.floor(Math.min(...ps) * 2) / 2, Math.ceil(Math.max(...ps) * 2) / 2] : [4, 15.5];
  }, [core]);
  React.useEffect(() => { if (price === null && core) setPrice(priceBounds); }, [core, price, priceBounds]);

  // Ownership uses fixed 5% dropdown steps from 0% to 100%.
  const ownershipBounds = React.useMemo(() => [0, 100], []);
  React.useEffect(() => {
    if (ownership === null && core) setOwnership(ownershipBounds);
  }, [core, ownership, ownershipBounds]);

  const firstGw = model && Number.isFinite(Number(model.gw)) ? Number(model.gw) : 1;
  const lastGw = React.useMemo(() => {
    const fixtureGws = core ? (core.fixtures || []).map((f) => Number(f.gw)).filter(Number.isFinite) : [];
    const seasonLast = fixtureGws.length ? Math.max(...fixtureGws) : 8;
    return Math.max(firstGw, Math.min(8, seasonLast));
  }, [core, firstGw]);
  React.useEffect(() => {
    if (!model || rangeInitialisedForGw.current === firstGw) return;
    setRange(firstGw, firstGw);
    rangeInitialisedForGw.current = firstGw;
  }, [model, firstGw, setRange]);

  /* The three tags follow the gameweek range, so changing the start moves the opponents with the
     numbers. Reading a GW5 projection beside a GW1 opponent is the kind of mistake the table should
     make impossible rather than merely unlikely. */
  const fixturesOf = React.useCallback((p) => (core
    ? nextFixtures(core.fixtures, core.teamById, p.team_id, 3, gwFrom)
    : []), [core, gwFrom]);

  const xpts = React.useCallback((p) => {
    if (!model || !core) return null;
    const byGameweek = new Map();
    for (let gw = gwFrom; gw <= gwTo; gw++) {
      byGameweek.set(gw, model.scoreForGw(p, gw));
    }
    return sumGameweekValues({ gwFrom, gwTo, read: (gw) => byGameweek.get(gw) }).total;
  }, [model, core, gwFrom, gwTo]);

  const xprice = React.useMemo(() => {
    if (!core || !model) return null;
    return buildXPrice(core.players,
      (p) => model.lastSeasonPoints(p) ?? 0,
      (p) => (model.lastSeasonPoints(p) === null ? "none" : "archive"));
  }, [core, model]);

  const valueOf = React.useCallback((p) => {
    const x = xpts(p);
    const pr = Number(p.price);
    return x === null || !pr ? null : x / pr;
  }, [xpts]);

  const gametimeOf = React.useCallback((p) => {
    const s = model ? model.startProbOf(p) : null;
    return s === null ? null : s * 100;
  }, [model]);

  const defconById = React.useMemo(() => new Map(DEFCON.rows.map((r) => [r.fpl_id, r])), []);
  const defconOf = React.useCallback((p) => defconById.get(Number(p.fpl_id)) || null, [defconById]);

  const readers = React.useMemo(() => ({
    PRICE: (p) => Number(p.price),
    XPTS: xpts,
    VALUE: valueOf,
    XPRICE: (p) => { const x = xprice ? xprice.of(p) : null; return x ? x.xprice : null; },
    FORM: (p) => (p.form === null || p.form === undefined ? null : Number(p.form)),
    PTS_LAST_YEAR: (p) => (model ? model.lastSeasonPoints(p) : null),
    GAMETIME: gametimeOf,
    OWNERSHIP: (p) => (p.own === null || p.own === undefined ? null : Number(p.own)),
    /* Null rather than zero when a player has not played a full ninety. A goalkeeper cannot earn DEFCON
       at all and a player with forty minutes behind him has no meaningful rate, and showing either as
       0.0 would rank them alongside someone who genuinely does nothing defensively. A dash says the
       honest thing: there is no rate to report yet. */
    DEFCON: (p) => defconOf(p)?.per90 ?? null,
  }), [xpts, valueOf, xprice, model, gametimeOf, defconOf]);

  /* The number says how many actions per ninety; the colour says whether that clears the threshold for
     his position. A defender needs ten and a midfielder twelve, so 11.5 is comfortable for one and short
     for the other, and the rate alone cannot tell you which.
     Only clearing the line is coloured. Falling short is white, because pink reads as a warning and
     failing to reach a defensive bonus is not a warning: most of the league does not reach it, and
     colouring every one of them made a routine fact look like a problem. */
  const defconColour = React.useCallback((p) => {
    const row = defconOf(p);
    if (!row || row.headroom === null || row.headroom <= 0) return "#FFFFFF";
    return T.green;
  }, [defconOf]);

  const list = React.useMemo(() => {
    if (!core || !price || !ownership) return [];
    const rows = core.players.map((player) => ({
      _player: player,
      player_id: finite(player.id ?? player.fpl_id),
      name: player.web_name,
      full_name: player.name || null,
      club: player.team,
      position: player.position,
      price: finite(player.price),
      ownership: finite(player.own),
      sort_value: (readers[sort.key] || readers.PRICE)(player),
    }));
    const filtered = filterPlayerRows(rows, {
      clubs: club === "ANY" ? [] : [club],
      positions: position === "ANY" ? [] : [position],
      name: q,
      priceMin: price[0],
      priceMax: price[1],
      ownershipMin: ownership[0],
      ownershipMax: ownership[1],
    });
    return sortPlayerRows(filtered, { sortBy: "sort_value", sortDirection: sort.dir })
      .map((row) => row._player);
  }, [core, price, ownership, position, club, q, sort, readers]);

  const reset = () => {
    setQ(""); setPosition("ANY"); setClub("ANY"); setPrice(priceBounds); setOwnership(ownershipBounds);
    setSort(DEFAULT_SORT); setRange(firstGw, firstGw); setCompare(false); setPicked([]);
  };

  const fmt = (key, v) => formatMetric(key, v);

  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || !price || !ownership) {
    return <div data-zeus-ui-version="range-select-bench-v1" style={{ display: "flex", flexDirection: "column", gap: S.gap }}><Skeleton h={150} /><SkeletonRows n={10} h={ROW_H} /></div>;
  }

  const grid = COLS.map((c) => c.w).join(" ");
  const gridWithName = `minmax(210px,1fr) ${grid}`;

  return (
    <div data-zeus-ui-version="range-select-bench-v1" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <PlayerControls
        q={q} setQ={setQ} position={position} setPosition={setPosition}
        price={price} setPrice={setPrice} priceBounds={priceBounds}
        ownership={ownership} setOwnership={setOwnership} ownershipBounds={ownershipBounds}
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

      {/* A phone gets cards, not a squeezed table. Eleven grid tracks totalling about 1330px cannot be
          narrowed into 390 without either shrinking every number past reading or scrolling the player's
          name off screen while you look at his ownership. The desktop table below is untouched. */}
      {isMobile ? (
        <MobilePlayerList
          list={list}
          sort={sort}
          onSort={(key) => setSort(cycleSort(sort, key))}
          readers={readers}
          fixturesOf={fixturesOf}
          scale={scale}
          defconColour={defconColour}
        />
      ) : (
      /* The table is a fixed grid about 1330px wide. Below 768 the card list replaces it entirely, but
         at exactly 768, an iPad held upright, the desktop table is what renders and it pushed the page
         628px sideways. The class lets it scroll inside its own box at tablet widths instead. */
      <section className="zeus-players-table" style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 14 }}>
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
          {list.map((p) => {
            const fx = fixturesOf(p);
            const chosen = picked.some((x) => x.fpl_id === p.fpl_id);
            const cells = (
              <>
                <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <ClubBar team={p.team} height={24} />
                  <Kit team={p.team} size={22} />
                  <span style={{ ...lang(14.5, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.web_name}
                  </span>
                  <span style={code(13)}>{p.team}</span>
                </span>

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
                    <Value color={c.key === "DEFCON" ? defconColour(p) : metricColor(c.key)}>
                      {fmt(c.key, readers[c.key](p))}
                    </Value>
                  </span>
                ))}

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
      )}
    </div>
  );
}
