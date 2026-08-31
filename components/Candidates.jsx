"use client";
import React from "react";
import { T, S, Kit, ClubBar, Label, POS_LABEL, lang, code, Value } from "../lib/ui";
import Opp from "./Opp";
import { RULES, bank, squadCountPos, clubCount } from "../lib/solver/squad";
import PlayerControls from "./PlayerControls";
import { SORT_KEYS, cycleSort, sortArrow, metricColor, formatMetric } from "../lib/sorting.mjs";

const POS_ORDER = ["GKP", "DEF", "MID", "FWD"];

export default function Candidates({ pos, pool, squad, scoreOf, bandOf, gateOpen, onAdd, max, oppOf, scale, xpOf, run5Of,
  gwFrom = 1, gwTo = 1, setRange = null, maxGw = 8, firstGw = 1, xpRange = null, clubs = null,
  showGameweekRange = true, extraFunds = 0 }) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState({ key: "XPTS", dir: "desc" });
  const [price, setPrice] = React.useState(null);

  const priceBounds = React.useMemo(() => {
    const ps = pool.map((p) => Number(p.price)).filter(Number.isFinite);
    return ps.length ? [Math.floor(Math.min(...ps) * 2) / 2, Math.ceil(Math.max(...ps) * 2) / 2] : [4, 15.5];
  }, [pool]);
  React.useEffect(() => { if (price === null) setPrice(priceBounds); }, [price, priceBounds]);

  const readers = React.useMemo(() => ({
    PRICE: (p) => Number(p.price),
    XPTS: (p) => (xpRange ? xpRange(p) : (xpOf ? xpOf(p) : scoreOf(p))),
    VALUE: (p) => {
      const x = xpRange ? xpRange(p) : (xpOf ? xpOf(p) : scoreOf(p));
      const pr = Number(p.price);
      return x === null || !pr ? null : x / pr;
    },
    FORM: (p) => (p.form === null || p.form === undefined ? null : Number(p.form)),
    PTS_LAST_YEAR: (p) => (p.total_points === null || p.total_points === undefined ? null : Number(p.total_points)),
    GAMETIME: (p) => (p.chance_of_playing === null || p.chance_of_playing === undefined ? 100 : Number(p.chance_of_playing)),
    OWNERSHIP: (p) => (p.own === null || p.own === undefined ? null : Number(p.own)),
  }), [xpOf, xpRange, scoreOf]);

  const pickerSortKeys = React.useMemo(() => SORT_KEYS.filter((item) => item.key !== "XPRICE"), []);

  const cheapest = React.useMemo(() => {
    const out = {};
    for (const p of pool) {
      const cur = out[p.position];
      if (!cur || Number(p.price) < cur) out[p.position] = Number(p.price);
    }
    return out;
  }, [pool]);

  const reserve = React.useMemo(() => {
    let r = 0;
    for (const other of POS_ORDER) {
      const missing = RULES.composition[other] - squadCountPos(squad, other);
      const count = other === pos ? missing - 1 : missing;
      if (count > 0) r += count * (cheapest[other] ?? 0);
    }
    return Math.max(0, r);
  }, [squad, pos, cheapest]);

  /* THE MONEY ON THE TABLE.
   *
   * This was the bank alone, which is right when filling an empty slot and wrong for every transfer.
   * Replacing a player sells him first, so his sale value is spendable too. With a full fifteen and an
   * empty bank the envelope was 0.0, so every candidate read OVER and no transfer could be started at
   * all. extraFunds is the outgoing player's sale value, the same figure the pitch already shows as
   * spendable, and it is 0 when nothing is being sold. */
  const envelope = +(bank(squad) + (Number(extraFunds) || 0) - reserve).toFixed(1);
  const left = RULES.composition[pos] - squadCountPos(squad, pos);

  const [posFilter, setPosFilter] = React.useState("ANY");
  const [club, setClub] = React.useState("ANY");
  React.useEffect(() => { setPosFilter(pos || "ALL"); }, [pos]);

  const list = React.useMemo(() => {
    const owned = new Set(squad.players.map((p) => p.fpl_id));
    let l = pool.filter((p) => !owned.has(p.fpl_id));
    if (posFilter !== "ANY" && posFilter !== "ALL") l = l.filter((p) => p.position === posFilter);
    if (q) {
      const needle = q.toLowerCase();
      l = l.filter((p) => (`${p.web_name} ${p.name || ""} ${p.team}`).toLowerCase().includes(needle));
    }
    if (club !== "ANY") l = l.filter((p) => p.team === club);
    if (price) l = l.filter((p) => Number(p.price) >= price[0] - 1e-9 && Number(p.price) <= price[1] + 1e-9);

    const read = readers[sort.key] || readers.PRICE;
    const missing = sort.dir === "desc" ? -Infinity : Infinity;
    return [...l].sort((a, b) => {
      const av = read(a) ?? missing, bv = read(b) ?? missing;
      return sort.dir === "desc" ? bv - av : av - bv;
    }).slice(0, 80);
  }, [pool, posFilter, club, q, sort, price, squad, readers]);

  const baseMetricKeys = ["PRICE", "XPTS", "VALUE"];
  const visibleMetricKeys = baseMetricKeys.includes(sort.key) ? baseMetricKeys : [...baseMetricKeys, sort.key];
  const metricLabels = Object.fromEntries(SORT_KEYS.map((item) => [item.key, item.label]));
  /* The metric and action columns were fixed pixels, so the row could not shrink to fit the narrow
     column this list actually lives in, and it scrolled sideways inside its own box on a full desktop.
     minmax lets each column give way instead. */
  const rowGrid = `minmax(140px,1fr) minmax(76px,104px) ${visibleMetricKeys.map(() => "minmax(62px,92px)").join(" ")} minmax(74px,96px)`;

  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20,
      display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Label color={T.green}>Players</Label>
          <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>
            {left > 0 && posFilter !== "ANY" ? `Pick ${left} more ${POS_LABEL[posFilter]}` : "Click a player to add him"}
          </h2>
        </div>
      </header>

      <PlayerControls
        q={q} setQ={setQ} position={posFilter} setPosition={setPosFilter}
        price={price || priceBounds} setPrice={setPrice} priceBounds={priceBounds}
        sort={sort} setSort={setSort} sortKeys={pickerSortKeys}
        club={club} setClub={setClub} clubs={clubs}
        gwFrom={gwFrom} gwTo={gwTo} setRange={setRange} maxGw={maxGw} firstGw={firstGw}
        showGameweekRange={showGameweekRange}
        onReset={() => {
          setQ(""); setPosFilter("ANY"); setClub("ANY"); setPrice(priceBounds);
          setSort({ key: "XPTS", dir: "desc" });
          if (showGameweekRange && setRange) setRange(firstGw, firstGw);
        }} />

      <div className="zeus-candidate-table">
        <div className="zeus-candidate-head" style={{ display: "grid", gridTemplateColumns: rowGrid, gap: 10,
          alignItems: "center", padding: "0 12px", height: S.ctrlSm }}>
          <span style={code(12.5)}>PLAYER</span>
          <span style={{ ...code(12.5), textAlign: "center" }}>FIXTURE</span>
          {visibleMetricKeys.map((key) => (
            <button type="button" key={key} onClick={() => setSort(cycleSort(sort, key))}
              style={{ ...code(12.5, sort.key === key ? metricColor(key) : "#FFFFFF"), textAlign: "center" }}>
              {metricLabels[key]}{sortArrow(sort, key)}
            </button>
          ))}
          <span style={{ ...code(12.5), textAlign: "center" }}>ACTION</span>
        </div>

        <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
          {list.map((p) => {
            const affordable = Number(p.price) <= envelope + 1e-9;
            const clubFull = clubCount(squad, p.team_id) >= RULES.maxPerClub;
            /* Price is a warning, not a wall. The three-per-club limit and a full position are rules the
             * game itself enforces, so those still block. Being over the envelope is a money question the
             * save step checks properly, and refusing the click here left no way to even attempt the
             * transfer. The button turns red and reads OVER, and the attempt is allowed. */
            const blocked = clubFull || left <= 0;
            const overBudget = !affordable && !blocked;
            return (
              <div key={p.fpl_id} className="zeus-candidate-row" style={{ display: "grid", gridTemplateColumns: rowGrid,
                gap: 10, alignItems: "center", height: S.row, padding: "0 12px", borderRadius: S.radiusSm,
                background: T.row, opacity: blocked ? 0.5 : 1 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <ClubBar team={p.team} height={24} />
                  <Kit team={p.team} size={22} />
                  <span style={{ ...lang(S.name, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                  <span style={{ ...code(), flexShrink: 0 }}>{p.team}</span>
                </span>
                <span style={{ display: "flex", justifyContent: "center" }}>
                  <Opp fx={oppOf ? oppOf(p) : null} scale={scale} size="sm" showNumber={false} />
                </span>
                {visibleMetricKeys.map((key) => (
                  <span key={key} data-metric={metricLabels[key]} style={{ display: "flex", justifyContent: "center" }}>
                    <Value color={metricColor(key)}>{formatMetric(key, readers[key] ? readers[key](p) : null)}</Value>
                  </span>
                ))}
                <button onClick={() => onAdd(p)} disabled={blocked} className="fb-press"
                  style={{ height: S.ctrl, borderRadius: S.radiusSm,
                    background: blocked ? T.plate : overBudget ? T.pink : T.green,
                    ...lang(13.5, 700, blocked || overBudget ? "#FFFFFF" : "#04130A") }}>
                  {clubFull ? "3 MAX" : left <= 0 ? "FULL" : overBudget ? "OVER" : "ADD"}
                </button>
              </div>
            );
          })}
          {!list.length && <div style={{ padding: "30px 0", textAlign: "center", ...lang(15) }}>
            Nothing fits that filter inside the budget envelope.
          </div>}
        </div>
      </div>
    </section>
  );
}
