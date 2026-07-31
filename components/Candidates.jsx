"use client";
import React from "react";
import { T, S, Kit, Label, POS_LABEL, lang, val, code, Value } from "../lib/ui";
import Opp from "./Opp";
import { RULES, bank, squadCountPos, clubCount } from "../lib/solver/squad";
import PlayerControls from "./PlayerControls";

// Was a module constant in BuilderClient and did not travel with the extraction.
const POS_ORDER = ["GKP", "DEF", "MID", "FWD"];

/* THE PLAYER LIST, shared by the Builder and the Squad screen.
 *
 * It lived inside BuilderClient, so the Squad screen had a modal transfer picker instead: a different
 * interaction, different filters, different sorting, for the same job. One component now, so swapping a
 * player works identically wherever you are.
 *
 * `onAdd` means "put this player in". On the Builder that fills an empty slot. On the Squad screen a
 * player has already been selected to come out, so it completes a transfer. The list does not need to
 * know which.
 */
export default function Candidates({ pos, pool, squad, scoreOf, bandOf, gateOpen, onAdd, max, oppOf, scale, xpOf, run5Of,
  gwFrom = 1, gwTo = 1, setRange = null, maxGw = 8, firstGw = 1, xpRange = null, clubs = null,
  showGameweekRange = true }) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState({ key: "XPTS", dir: "desc" });
  const [price, setPrice] = React.useState(null);

  const priceBounds = React.useMemo(() => {
    const ps = pool.map((p) => Number(p.price)).filter(Number.isFinite);
    return ps.length ? [Math.floor(Math.min(...ps) * 10) / 10, Math.ceil(Math.max(...ps) * 10) / 10] : [4, 15];
  }, [pool]);
  React.useEffect(() => { if (price === null) setPrice(priceBounds); }, [price, priceBounds]);

  /* The same readers the Players page sorts by, built from what this component already has. */
  const readers = React.useMemo(() => ({
    PRICE: (p) => Number(p.price),
    /* Sums the selected gameweeks. Reading only the next fixture is what made the slider decorative. */
    XPTS: (p) => (xpRange ? xpRange(p) : (xpOf ? xpOf(p) : scoreOf(p))),
    VALUE: (p) => { const x = xpRange ? xpRange(p) : (xpOf ? xpOf(p) : scoreOf(p)); const pr = Number(p.price); return x === null || !pr ? null : x / pr; },
    XPRICE: () => null,
    FORM: (p) => (p.form === null || p.form === undefined ? null : Number(p.form)),
    PTS_LAST_YEAR: (p) => (p.total_points === null || p.total_points === undefined ? null : Number(p.total_points)),
    GAMETIME: (p) => (p.chance_of_playing === null || p.chance_of_playing === undefined ? 100 : Number(p.chance_of_playing)),
    OWNERSHIP: (p) => (p.own === null || p.own === undefined ? null : Number(p.own)),
  }), [xpOf, xpRange, scoreOf]);

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

  const envelope = +(bank(squad) - reserve).toFixed(1);
  const left = RULES.composition[pos] - squadCountPos(squad, pos);

  // Position is a filter, not a gate. ALL searches the whole pool; the position pills narrow it.
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

  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Label color={T.green}>Players</Label>
          <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>
            {left > 0 && posFilter !== "ANY" ? `Pick ${left} more ${POS_LABEL[posFilter]}` : "Click a player to add him"}
          </h2>
        </div>
      </header>

      {/* The same controls as the Players page, so filtering and sorting behave identically here. */}
      <PlayerControls
        q={q} setQ={setQ} position={posFilter} setPosition={setPosFilter}
        price={price || priceBounds} setPrice={setPrice} priceBounds={priceBounds}
        sort={sort} setSort={setSort}
        club={club} setClub={setClub} clubs={clubs}
        gwFrom={gwFrom} gwTo={gwTo} setRange={setRange} maxGw={maxGw} firstGw={firstGw}
        showGameweekRange={showGameweekRange}
        onReset={() => { setQ(""); setPosFilter("ANY"); setClub("ANY"); setPrice(priceBounds); setSort({ key: "XPTS", dir: "desc" }); if (showGameweekRange && setRange) setRange(firstGw, firstGw); }}
        firstGw={firstGw} />

      <div style={{ marginTop: 8, maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
        {list.map((p) => {
          const affordable = Number(p.price) <= envelope + 1e-9;
          const clubFull = clubCount(squad, p.team_id) >= RULES.maxPerClub;
          const blocked = !affordable || clubFull || left <= 0;
          return (
            <div key={p.fpl_id} className="zeus-candidate-row" style={{ display: "grid", gap: 10, alignItems: "center",
              height: S.row, padding: "0 12px", borderRadius: S.radiusSm, background: T.row, opacity: blocked ? 0.5 : 1 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Kit team={p.team} size={22} />
                <span style={{ ...lang(S.name, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                <span style={{ ...code(), flexShrink: 0 }}>{p.team}</span>
              </span>
              <span style={{ display: "flex", justifyContent: "center" }}><Opp fx={oppOf ? oppOf(p) : null} scale={scale} size="sm" showNumber={false} /></span>
              <Value>{Number(p.price).toFixed(1)}</Value>
              <span style={{ ...val(S.data, T.xp), textAlign: "center" }}>{scoreOf(p).toFixed(1)}</span>
              <button onClick={() => onAdd(p)} disabled={blocked} className="fb-press"
                style={{ height: 36, borderRadius: S.radiusSm, background: blocked ? T.plate : T.green, ...lang(13.5, 700, blocked ? "#FFFFFF" : "#04130A") }}>
                {clubFull ? "3 MAX" : !affordable ? "OVER" : left <= 0 ? "FULL" : "ADD"}
              </button>
            </div>
          );
        })}
        {!list.length && <div style={{ padding: "30px 0", textAlign: "center", ...lang(15) }}>Nothing fits that filter inside the budget envelope.</div>}
      </div>
    </section>
  );
}
