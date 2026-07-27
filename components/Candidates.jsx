"use client";
import React from "react";
import { Search } from "lucide-react";
import { T, S, Kit, Label, Plate, POS_LABEL, lang, val, code, Value } from "../lib/ui";
import Opp from "./Opp";
import { bank, squadCountPos, clubCount } from "../lib/solver/squad";

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
export default function Candidates({ pos, pool, squad, scoreOf, bandOf, gateOpen, onAdd, max, oppOf, scale, xpOf, run5Of }) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("xP NEXT");
  const [hideFlagged, setHideFlagged] = React.useState(true);
  const [maxPrice, setMaxPrice] = React.useState("ALL");

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
  const [posFilter, setPosFilter] = React.useState("ALL");
  React.useEffect(() => { setPosFilter(pos || "ALL"); }, [pos]);

  const list = React.useMemo(() => {
    const owned = new Set(squad.players.map((p) => p.fpl_id));
    let l = pool.filter((p) => !owned.has(p.fpl_id));
    if (posFilter !== "ALL") l = l.filter((p) => p.position === posFilter);
    if (q) l = l.filter((p) => (p.web_name + " " + p.name + " " + p.team).toLowerCase().includes(q.toLowerCase()));
    if (hideFlagged) l = l.filter((p) => p.status === "a");
    if (maxPrice !== "ALL") l = l.filter((p) => Number(p.price) <= Number(maxPrice));
    const by = {
      "xP NEXT": (a, b) => (xpOf ? (xpOf(b) ?? -99) - (xpOf(a) ?? -99) : scoreOf(b) - scoreOf(a)),
      "xP NEXT 5": (a, b) => (run5Of ? (run5Of(b) ?? -99) - (run5Of(a) ?? -99) : scoreOf(b) - scoreOf(a)),
      SCORE: (a, b) => scoreOf(b) - scoreOf(a),
      VALUE: (a, b) => scoreOf(b) / Number(b.price) - scoreOf(a) / Number(a.price),
      OWNED: (a, b) => Number(b.own) - Number(a.own),
      PRICE: (a, b) => Number(b.price) - Number(a.price),
      NAME: (a, b) => a.web_name.localeCompare(b.web_name),
    }[sort] || ((a, b) => scoreOf(b) - scoreOf(a));
    return [...l].sort(by).slice(0, 80);
  }, [pool, posFilter, q, sort, hideFlagged, maxPrice, squad, scoreOf, xpOf, run5Of]);

  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Label color={T.green}>All players · {squad.structure}</Label>
          <h2 style={{ margin: "5px 0 0", ...lang(20, 700) }}>
            {posFilter === "ALL" ? `${list.length} available` : left > 0 ? `Pick ${left} more ${POS_LABEL[posFilter]}` : `${POS_LABEL[posFilter]} filled`}
          </h2>
        </div>
        <Plate w={104} h={40} size={14}>{envelope.toFixed(1)} max</Plate>
      </header>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 170, display: "flex", alignItems: "center", gap: 9, background: T.row, border: `1px solid ${T.line}`, borderRadius: 12, padding: "0 13px", height: 40 }}>
          <Search size={15} color="#FFFFFF" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or club"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", ...lang(14.5) }} />
        </div>
        {["ALL", "GKP", "DEF", "MID", "FWD"].map((k) => (
          <button key={k} onClick={() => setPosFilter(k)} className="fb-press"
            style={{ height: 40, padding: "0 14px", borderRadius: 999, ...lang(13.5, 700, posFilter === k ? "#04130A" : "#FFFFFF"),
              background: posFilter === k ? T.green : T.card, border: `1px solid ${posFilter === k ? T.green : T.line}` }}>
            {k === "ALL" ? "ALL" : POS_LABEL[k]}
          </button>
        ))}
        {[["xP NEXT", "xP next"], ["xP NEXT 5", "xP next 5"], ["VALUE", "Value"], ["OWNED", "Owned"], ["PRICE", "Price"], ["NAME", "Name"]].map(([k, label]) => (
          <button key={k} onClick={() => setSort(k)} className="fb-press"
            style={{ height: 40, padding: "0 14px", borderRadius: 999, background: sort === k ? T.green : T.row,
              border: `1px solid ${sort === k ? T.green : T.line}`, ...lang(13.5, 700, sort === k ? "#04130A" : "#FFFFFF") }}>
            {label.toUpperCase()}
          </button>
        ))}
        <button onClick={() => setHideFlagged(!hideFlagged)} className="fb-press"
          style={{ height: 40, padding: "0 14px", borderRadius: 999, background: hideFlagged ? T.tag : T.row,
            border: `1px solid ${hideFlagged ? T.tag : T.line}`, ...lang(13.5, 700) }}>
          HIDE FLAGGED
        </button>
        <select value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
          style={{ height: 40, borderRadius: 12, background: T.row, border: `1px solid ${T.line}`, padding: "0 10px", ...lang(14, 700) }}>
          {["ALL", "4.5", "5.5", "6.5", "8.0", "10.0", "13.0"].map((o) => (
            <option key={o} value={o} style={{ background: T.row }}>{o === "ALL" ? "Any price" : `Up to ${o}`}</option>
          ))}
        </select>
      </div>

      <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
        {list.map((p) => {
          const affordable = Number(p.price) <= envelope + 1e-9;
          const clubFull = clubCount(squad, p.team_id) >= RULES.maxPerClub;
          const blocked = !affordable || clubFull || left <= 0;
          return (
            <div key={p.fpl_id} style={{ display: "grid", gridTemplateColumns: "minmax(150px,1fr) 92px 72px 72px 96px", gap: 10, alignItems: "center",
              height: S.row, padding: "0 12px", borderRadius: S.radiusSm, background: T.row, opacity: blocked ? 0.5 : 1 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Kit team={p.team} size={22} />
                <span style={{ ...lang(S.name, 700), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</span>
                <span style={{ ...code(), flexShrink: 0 }}>{p.team}</span>
              </span>
              <span style={{ display: "flex", justifyContent: "center" }}><Opp fx={oppOf ? oppOf(p) : null} scale={scale} size="sm" showNumber={false} /></span>
              <Value>{Number(p.price).toFixed(1)}</Value>
              <span style={{ ...val(S.data), textAlign: "center" }}>{scoreOf(p).toFixed(1)}</span>
              <button onClick={() => onAdd(p)} disabled={blocked} className="fb-press"
                style={{ height: 36, borderRadius: 999, background: blocked ? T.plate : T.green, ...lang(13.5, 700, blocked ? "#FFFFFF" : "#04130A") }}>
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
