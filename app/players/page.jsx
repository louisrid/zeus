"use client";
import React from "react";
import Link from "next/link";
import { loadCore, nextFixtures } from "../../lib/data";
import { useIsMobile, useIsNarrow } from "../../lib/use-viewport.mjs";
import MobilePlayerList from "../../components/MobilePlayerList";
import { loadModel } from "../../lib/projections";
import { buildOpponentScale } from "../../lib/opponent";
import { buildXPrice } from "../../lib/xprice.mjs";
import { filterPlayerRows, sortPlayerRows, sumGameweekValues } from "../../lib/player-query.mjs";
import DEFCON from "../../config/defcon-2026-27.mjs";
import DEFCON_LIVE from "../../config/defcon-live-2026-27.mjs";
import { clubFixtureDifficulty } from "../../lib/fdr.mjs";
import SEASON_ACTUALS from "../../config/season-actuals-2026-27.mjs";
import { T, S, Kit, ClubBar, Value, Label, Skeleton, SkeletonRows, ErrorCard, lang, code } from "../../lib/ui";
import Opp from "../../components/Opp";
import PlayerControls from "../../components/PlayerControls";
import MetricFilters from "../../components/MetricFilters";
import { passesConditions } from "../../components/MetricFilters";
import { usePersistentState, clearPersistentState } from "../../lib/use-persistent-state.jsx";
import { xrOf, XR_ENABLED } from "../../lib/xr.mjs";
import { EmptyState, usePaged, ShowMore } from "../../lib/ui";
import { CONDITION_KEYS, SORT_KEYS, DEFAULT_SORT, cycleSort, sortArrow, COL_WIDTH, metricColor, formatMetric } from "../../lib/sorting.mjs";
import { EXTERNAL_XPTS_GW_TO } from "../../lib/external_xpts.mjs";

/* THE PLAYERS PAGE.
 *
 * One sort state read by both the SORT BY dropdown and the column headings, so the two can never show
 * different things. Filtering, range totals, deterministic sorting and pagination semantics live in
 * lib/player-query.mjs, which is also the source used by the external API and the full projections page.
 */

const ROW_H = 66;

/* xR IS A SORT OPTION THAT BRINGS ITS COLUMN WITH IT.
 *
 * It is not a permanent column: the table is at its width budget, and xR is a lens someone switches to
 * rather than a figure they read on every row. Choosing it in SORT BY adds the column and sorts by it,
 * and PTS LAST YEAR steps aside while it is showing, since last season's total is the column that matters
 * least when hunting differentials for this one. Everything else stays where it is. */
const XR_KEY = { key: "XR", label: "xR" };
const SORT_OPTIONS = XR_ENABLED ? [...SORT_KEYS, XR_KEY] : SORT_KEYS;

function columnsFor(sortKey) {
  const showXr = XR_ENABLED && sortKey === "XR";
  const metrics = SORT_KEYS
    .filter((s) => !(showXr && s.key === "PTS_LAST_YEAR"))
    .map((s) => ({ key: s.key, label: s.label, w: COL_WIDTH[s.key], sortable: true }));
  if (showXr) {
    /* Beside xPTS, since it is xPTS reweighted, and the two are read together. */
    const at = metrics.findIndex((c) => c.key === "XPTS") + 1;
    metrics.splice(at, 0, { key: "XR", label: "xR", w: COL_WIDTH.PTS_LAST_YEAR, sortable: true });
  }
  return [{ key: "FIXTURES", label: "NEXT THREE", w: "176px", sortable: false }, ...metrics];
}

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export default function Players() {
  /* Client page, so the title is set here rather than through metadata. */
  React.useEffect(() => { document.title = "Players · FPLBot"; }, []);
  const [core, setCore] = React.useState(null);
  const [model, setModel] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const [q, setQ] = usePersistentState("players.q", "");
  const [position, setPosition] = usePersistentState("players.position", "ANY");
  /* A list of clubs, empty meaning any. A remembered single string from before is revived as a list. */
  const [club, setClub] = usePersistentState("players.club", [], {
    revive: (stored) => (Array.isArray(stored) ? stored : (stored && stored !== "ANY" ? [stored] : [])),
  });
  /* priceBounds is computed further down from `core`, so the clamp reads it through a ref rather than
     depending on declaration order. */
  const priceBoundsRef = React.useRef([4, 15.5]);
  /* Held until `core` arrives, then clamped to the bounds the pool actually has. Persisting these without
     that guard would write the null placeholder over a real stored choice on every load, which is how an
     earlier attempt at a sticky range destroyed the value instead of restoring it. */
  const [price, setPrice, priceRestored] = usePersistentState("players.price", null, {
    ready: Boolean(core),
    revive: (stored) => (Array.isArray(stored) && stored.length === 2
      ? [Math.max(stored[0], priceBoundsRef.current[0]), Math.min(stored[1], priceBoundsRef.current[1])]
      : undefined),
  });
  /* Minutes played this season, as a remembered range. Bounds come from the season actuals, so the top of
     the range is the most any player has played so far and grows week by week. */
  const minutesBounds = React.useMemo(() => {
    const most = (SEASON_ACTUALS.rows || []).reduce((top, row) => Math.max(top, Number(row.minutes) || 0), 0);
    return [0, Math.ceil(most / 90) * 90];
  }, []);
  const [minutes, setMinutes, minutesRestored] = usePersistentState("players.minutes", null, {
    revive: (stored) => (Array.isArray(stored) && stored.length === 2
      ? [Math.max(0, stored[0]), Math.min(stored[1], minutesBounds[1])] : undefined),
  });
  React.useEffect(() => {
    if (minutesRestored && minutes === null) setMinutes(minutesBounds);
  }, [minutes, minutesBounds, minutesRestored]);

  const [ownership, setOwnership, ownershipRestored] = usePersistentState("players.ownership", null, {
    ready: Boolean(core),
    revive: (stored) => (Array.isArray(stored) && stored.length === 2 ? stored : undefined),
  });
  const [sort, setSort] = usePersistentState("players.sort", DEFAULT_SORT);
  const isPhone = useIsMobile();
  const isNarrow = useIsNarrow();
  /* Either condition means the 1330px table has nowhere to render, so the card list covers both. A phone
     is the obvious case; a tablet in portrait is the one that was missed, because it sits one pixel above
     the phone breakpoint and was handed the full table inside a 410px column. */
  const isMobile = isPhone || isNarrow;
  /* Remembered, and clamped to the fixtures once they are known. An effect below used to reset this to
     the first gameweek on every load. */
  const [gwRange, setGwRange] = usePersistentState("players.range", null, {
    ready: Boolean(model),
    revive: (stored) => (Array.isArray(stored) && stored.length === 2 ? stored : undefined),
  });
  const gwFrom = gwRange ? gwRange[0] : 1;
  const gwTo = gwRange ? gwRange[1] : 1;
  const setGwFrom = React.useCallback((value) => setGwRange((current) => {
    const to = current ? current[1] : Number(value);
    return [Number(value), Math.max(Number(value), to)];
  }), [setGwRange]);
  const setGwTo = React.useCallback((value) => setGwRange((current) => {
    const from = current ? current[0] : Number(value);
    return [from, Math.max(Number(value), from)];
  }), [setGwRange]);
  const rangeInitialisedForGw = React.useRef(null);
  const setRange = React.useCallback((a, b) => { setGwFrom(a); setGwTo(b); }, []);
  /* COMPARE removed. It never worked properly, and a control that looks live and does nothing is worse
     than no control. Rows are plain links to the player page again. */
  const compare = false;

  /* FILTERS SURVIVE LEAVING THE PAGE.
   *
   * Opening a player and coming back used to drop everything: the search, the position, the price band,
   * the sort. Twenty seconds of narrowing gone for one click. They are held in the tab's session
   * storage, so the back button returns you to the list you were looking at, and closing the tab starts
   * you clean. */
  /* ONE PERSISTENCE MECHANISM, NOT TWO.
   *
   * A second copy of this lived here, writing the same filters to sessionStorage on every change and
   * restoring them on mount. Two systems restoring the same state on the same render is a race: whichever
   * effect ran last won, and since the sessionStorage one restored a price of null before the pool had
   * loaded, it could hand back an empty range over a real remembered one. It also only survived while the
   * tab stayed open, which is not what remembering a filter means. usePersistentState does the same job,
   * waits for the data before touching anything, and outlives the tab. */
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
    /* Tenths, matching the candidate picker. Halves put real prices like 4.6 outside the bounds. */
    return ps.length
      ? [Math.floor(Math.min(...ps) * 10) / 10, Math.ceil(Math.max(...ps) * 10) / 10]
      : [4, 15.5];
  }, [core]);
  React.useEffect(() => { priceBoundsRef.current = priceBounds; }, [priceBounds]);
  /* THE DEFAULT WAITS FOR THE RESTORE.
   *
   * Coming back from a player page remounts this one. The remembered range and this default both fired
   * in the same pass: the restore set your range, then this saw `price` still null in that render and
   * overwrote it with the full bounds. Last write wins, and it was the wrong one, so a price filter of
   * 4.0 to 6.0 came back as 3.8 to 15.6 every time you opened a player and returned. The default now
   * runs only after the restore has finished and found nothing. */
  React.useEffect(() => {
    if (priceRestored && price === null && core) setPrice(priceBounds);
  }, [core, price, priceBounds, priceRestored]);

  // Ownership uses fixed 5% dropdown steps from 0% to 100%.
  const ownershipBounds = React.useMemo(() => [0, 100], []);
  React.useEffect(() => {
    if (ownershipRestored && ownership === null && core) setOwnership(ownershipBounds);
  }, [core, ownership, ownershipBounds, ownershipRestored]);

  const firstGw = model && Number.isFinite(Number(model.gw)) ? Number(model.gw) : 1;
  const lastGw = React.useMemo(() => {
    const fixtureGws = core ? (core.fixtures || []).map((f) => Number(f.gw)).filter(Number.isFinite) : [];
    const seasonLast = fixtureGws.length ? Math.max(...fixtureGws) : 8;
    return Math.max(firstGw, Math.min(EXTERNAL_XPTS_GW_TO, seasonLast));
  }, [core, firstGw]);
  React.useEffect(() => {
    if (!model || rangeInitialisedForGw.current === firstGw) return;
    rangeInitialisedForGw.current = firstGw;
    setGwRange((current) => {
      if (Array.isArray(current) && current.length === 2) {
        const from = Math.max(current[0], firstGw);
        return [from, Math.max(current[1], from)];
      }
      return [firstGw, firstGw];
    });
  }, [model, firstGw, setGwRange]);

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

  /* LAST SEASON OR THIS ONE, AND NEVER BOTH AT ONCE.
   *
   * The DEFCON column was last season's total, captured once and settled. That is the right number for
   * judging a player's record and the wrong one for judging his current form, and nothing on screen said
   * which it was. Both are kept, because early-season minutes make this year's figure volatile and last
   * year's is the only stable read there is, and the toggle says which you are looking at. */
  /* THIS SEASON BY DEFAULT.
   *
   * The table opened on last season while the player page leads with this one, so the same player showed
   * two different defensive rates depending on which screen was open, and for anyone new this season the
   * table showed nothing at all. Last season was the sensible default in August with no minutes played;
   * four gameweeks in it is the wrong one. The toggle is still there for the full-year read. */
  const [defconSeason, setDefconSeason] = usePersistentState("players.defconSeason", "this");
  const defconById = React.useMemo(() => {
    const rows = defconSeason === "this" ? (DEFCON_LIVE.rows || []) : DEFCON.rows;
    return new Map(rows.map((r) => [r.fpl_id, r]));
  }, [defconSeason]);
  const defconOf = React.useCallback((p) => defconById.get(Number(p.fpl_id)) || null, [defconById]);
  /* What each player has actually scored this season, keyed by id so a shared surname cannot merge two
     records the way name matching once did. */
  const actualsById = React.useMemo(
    () => new Map((SEASON_ACTUALS.rows || []).map((row) => [row.fpl_id, row])),
    [],
  );
  const medianOwnership = React.useMemo(() => {
    const values = (core?.players || []).map((p) => Number(p.own))
      .filter((v, i) => Number.isFinite(v) && core.players[i].own !== null && core.players[i].own !== undefined)
      .sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)] : 0;
  }, [core]);

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
    PTS_THIS_YEAR: (p) => actualsById.get(Number(p.fpl_id))?.total_points ?? null,
    /* xR = xPTS × (1 − ownership/100). Same formula and same median fallback as /api/xpts. */
    XR: (p) => {
      const score = xpts(p);
      if (score === null || score === undefined) return null;
      return xrOf(score, p.own, medianOwnership);
    },
    /* Real minutes this season. A filter, not a column: see CONDITION_ONLY_KEYS. */
    MINUTES: (p) => actualsById.get(Number(p.fpl_id))?.minutes ?? null,
    /* Measured over the gameweek range currently selected, so changing the range changes what the rule
       means, which is the behaviour anyone filtering on fixtures expects. */
    FDR: (p) => clubFixtureDifficulty(p.team, gwFrom, gwTo),
  }), [xpts, valueOf, xprice, model, gametimeOf, defconOf, actualsById, gwFrom, gwTo, medianOwnership]);

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

  /* Stacked conditions on any metric the table computes. They read through the same `readers` map the
     columns use, so a filter and the column it filters can never disagree about the number. */
  const [conditions, setConditions] = usePersistentState("players.conditions", []);

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
    const shared = filterPlayerRows(rows, {
      clubs: Array.isArray(club) ? club : (club && club !== "ANY" ? [club] : []),
      positions: position === "ANY" ? [] : [position],
      name: q,
      priceMin: price[0],
      priceMax: price[1],
      ownershipMin: ownership[0],
      ownershipMax: ownership[1],
    });
    /* Stacked conditions narrow the same rows the shared filter produced, before the shared sorter runs,
       so ordering stays the one deterministic path every page uses. */
    /* The minutes range applies here, after the shared filter, using the same reader the stacked
       condition uses, so the two can never disagree about how many minutes a player has. A range left
       at its full bounds excludes nobody, including players with no record yet. */
    const byMinutes = minutes && (minutes[0] > minutesBounds[0] || minutes[1] < minutesBounds[1])
      ? shared.filter((row) => {
        const played = readers.MINUTES(row._player);
        const value = played === null || played === undefined ? 0 : Number(played);
        return value >= minutes[0] && value <= minutes[1];
      })
      : shared;
    const filtered = conditions.length
      ? byMinutes.filter((row) => passesConditions(row._player, conditions, readers))
      : byMinutes;
    return sortPlayerRows(filtered, { sortBy: "sort_value", sortDirection: sort.dir })
      .map((row) => row._player);
  }, [core, price, ownership, minutes, minutesBounds, position, club, q, sort, readers, conditions]);
  /* Forty rows at a time on the desktop table as well; see usePaged. */
  const paged = usePaged(list, 40);

  const reset = () => {
    /* RESET clears the memory as well as the screen. A reset that leaves the old filters stored quietly
       brings them back on the next visit, which is worse than not remembering at all. */
    for (const key of ["players.q", "players.position", "players.club", "players.sort",
      "players.conditions", "players.price", "players.ownership"]) {
      clearPersistentState(key);
    }
    setQ(""); setPosition("ANY"); setClub([]); setMinutes(minutesBounds); setPrice(priceBounds); setOwnership(ownershipBounds);
    setSort(DEFAULT_SORT); setRange(firstGw, firstGw); setPicked([]); setConditions([]);
    /* The remembered filters are cleared by the loop above. This used to also wipe a sessionStorage key
       that no longer exists, which would have thrown on every reset the moment that copy was removed. */
  };

  const fmt = (key, v) => formatMetric(key, v);

  /* Above the early returns, because React counts hooks by call order and a render that bails at the
     error card must call the same number as one that does not. This sat below them once and took the
     page down with error #310. */
  const COLS = React.useMemo(() => columnsFor(sort.key), [sort.key]);
  if (err) return <ErrorCard onRetry={load} />;
  if (!core || !model || !price || !ownership) {
    return <div data-zeus-ui-version="range-select-bench-v1" style={{ display: "flex", flexDirection: "column", gap: S.gap }}><Skeleton h={150} /><SkeletonRows n={10} h={ROW_H} /></div>;
  }

  const grid = COLS.map((c) => c.w).join(" ");
  const gridWithName = `minmax(210px,1fr) ${grid}`;

  return (
    <div data-zeus-ui-version="range-select-bench-v1" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Every figure in the table below comes from this import, so its age belongs above the table
          rather than being something to remember or go and look up. */}
      {/* The DEFCON season toggle. Updating the data itself lives on the dashboard now: it is one action
          for the whole product, so repeating it per page only raised the question of whether the copies
          did different things. */}
      <span style={{ display: "flex", justifyContent: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px",
          borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}` }}>
          <span style={code(12, T.xp)}>DEFCON</span>
          {[["last", "LAST YEAR"], ["this", "THIS YEAR"]].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setDefconSeason(key)} className="fb-press"
              aria-pressed={defconSeason === key}
              style={{ height: S.ctrlSm, padding: "0 10px", borderRadius: S.radiusSm, border: "none",
                background: defconSeason === key ? T.tag : T.plate,
                ...lang(12, 700, defconSeason === key ? T.onTag : "#FFFFFF") }}>
              {label}
            </button>
          ))}
        </span>
      </span>
      <PlayerControls
        q={q} setQ={setQ} position={position} setPosition={setPosition}
        price={price} setPrice={setPrice} priceBounds={priceBounds}
        ownership={ownership} setOwnership={setOwnership} ownershipBounds={ownershipBounds}
        minutes={minutes} setMinutes={setMinutes} minutesBounds={minutesBounds}
        sort={sort} setSort={setSort} sortKeys={SORT_OPTIONS}
        club={club} setClub={setClub} clubs={clubList}
        gwFrom={gwFrom} gwTo={gwTo} setRange={setRange} maxGw={lastGw}
        gameweekDescription="xPTS and VALUE add up across the selected gameweeks."
        onReset={reset} firstGw={firstGw} />

      <MetricFilters conditions={conditions} setConditions={setConditions} metrics={CONDITION_KEYS} />

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
                title={c.key === "DEFCON" ? `Defensive actions per 90, ${defconSeason === "this" ? "this season" : "last season"}` : undefined}
                style={{ ...code(13, sort.key === c.key ? T.green : "#FFFFFF"), textAlign: "center", cursor: "pointer" }}>
                {c.label}{sortArrow(sort, c.key)}
                {/* The column says which season it is showing. The toggle that decides this is remembered,
                    so a table left on last season looks wrong against a player page that always shows
                    this one, with nothing on the column itself to explain the difference. */}
                {c.key === "DEFCON" && (
                  <span style={{ ...code(12, defconSeason === "this" ? T.tag : "#FF9F43"), display: "block", lineHeight: 1 }}>
                    {defconSeason === "this" ? "THIS SEASON" : "LAST SEASON"}
                  </span>
                )}
              </button>
            ) : (
              <span key={c.key} style={{ ...code(13), textAlign: "center" }}>{c.label}</span>
            )
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          {paged.visible.map((p) => {
            const fx = fixturesOf(p);
            const chosen = picked.some((x) => x.fpl_id === p.fpl_id);
            const cells = (
              <>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <ClubBar team={p.team} height={24} />
                  <Kit team={p.team} size={22} />
                  <span style={{ ...lang(14.5, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.web_name}
                  </span>
                  <span style={code(13)}>{p.team}</span>
                </span>

                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
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
          <ShowMore remaining={paged.remaining} onMore={paged.more} />
          {list.length === 0 && (
            <EmptyState action="Reset filters" onAction={reset}>
              No players match these filters. Widen the price or minutes range, or clear a condition.
            </EmptyState>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
