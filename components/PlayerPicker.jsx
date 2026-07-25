"use client";
import React from "react";
import { Search, X, Plus, Flag } from "lucide-react";
import { T, S, Kit, lang, val, code, Label, Plate } from "../lib/ui";
import { COMPOSITION, MAX_PER_CLUB, posCount, clubCount, bankOf, POS_LABEL } from "../lib/squad";

export const SORTS = ["SCORE", "PRICE HIGH", "PRICE LOW", "VALUE", "POINTS", "OWNERSHIP", "NAME"];
export const DEFAULT_FILTERS = { club: "ALL", maxPrice: "ALL", sort: "SCORE", hideFlagged: false, hideOwned: true };
const PRICE_BANDS = ["ALL", 4.5, 5.5, 6.5, 8.0, 10.0, 13.0];

export function filterPool(pool, pos, squad, query, f) {
  let list = pos ? pool.filter((p) => p.position === pos) : pool;
  if (query) {
    const q = query.toLowerCase();
    list = list.filter((p) => (p.web_name + " " + p.name + " " + p.team).toLowerCase().includes(q));
  }
  if (f.club !== "ALL") list = list.filter((p) => p.team === f.club);
  if (f.maxPrice !== "ALL") list = list.filter((p) => Number(p.price) <= Number(f.maxPrice));
  if (f.hideFlagged) list = list.filter((p) => !p.status || p.status === "a");
  if (f.hideOwned) list = list.filter((p) => !squad.some((x) => x.id === p.id));
  const valueOf = (p) => (Number(p.price) > 0 ? Number(p.score) / Number(p.price) : 0);
  const by = {
    "SCORE": (a, b) => Number(b.score) - Number(a.score),
    "PRICE HIGH": (a, b) => Number(b.price) - Number(a.price),
    "PRICE LOW": (a, b) => Number(a.price) - Number(b.price),
    "VALUE": (a, b) => valueOf(b) - valueOf(a),
    "POINTS": (a, b) => Number(b.total_points || 0) - Number(a.total_points || 0),
    "OWNERSHIP": (a, b) => Number(b.own || 0) - Number(a.own || 0),
    "NAME": (a, b) => a.web_name.localeCompare(b.web_name),
  }[f.sort];
  return [...list].sort(by);
}

function Toggle({ on, onClick, children }) {
  return (
    <button onClick={onClick} className="fb-press"
      style={{ height: 38, padding: "0 14px", borderRadius: 999, ...lang(13, 700, on ? "#04130A" : "#FFFFFF"),
        background: on ? T.green : T.card, border: `1px solid ${on ? T.green : T.line}` }}>
      {children}
    </button>
  );
}
function Sel({ label, value, onChange, options }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, background: T.card, border: `1px solid ${T.line}`,
      borderRadius: 12, padding: "0 12px", height: 38 }}>
      <span style={lang(13, 600)}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: "transparent", border: "none", outline: "none", ...lang(13.5, 700) }}>
        {options.map((o) => <option key={o} value={o} style={{ background: T.row, color: "#FFFFFF" }}>{o}</option>)}
      </select>
    </label>
  );
}

export function FilterBar({ f, setF, clubs }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Sel label="Club" value={f.club} options={clubs} onChange={(v) => setF({ ...f, club: v })} />
      <Sel label="Max £" value={f.maxPrice} options={PRICE_BANDS} onChange={(v) => setF({ ...f, maxPrice: v === "ALL" ? "ALL" : Number(v) })} />
      <Sel label="Sort" value={f.sort} options={SORTS} onChange={(v) => setF({ ...f, sort: v })} />
      <Toggle on={f.hideFlagged} onClick={() => setF({ ...f, hideFlagged: !f.hideFlagged })}>HIDE FLAGGED</Toggle>
      <Toggle on={f.hideOwned} onClick={() => setF({ ...f, hideOwned: !f.hideOwned })}>HIDE IN SQUAD</Toggle>
    </div>
  );
}

export function PlayerRow({ p, squad, onAdd, next, actionLabel, cap }) {
  const owned = squad.some((x) => x.id === p.id);
  const posFull = posCount(squad, p.position) >= COMPOSITION[p.position];
  const clubFull = clubCount(squad, p.team_id) >= MAX_PER_CLUB;
  const overCap = cap !== undefined && cap !== null && Number(p.price) > Number(cap);
  const blocked = !owned && (posFull || clubFull || overCap);
  const valueScore = Number(p.price) > 0 ? (Number(p.score) / Number(p.price)) * 10 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.card, borderRadius: S.radiusSm,
      height: 56, padding: "0 12px", flexShrink: 0, opacity: blocked ? 0.45 : 1 }}>
      <Kit team={p.team} size={22} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...lang(15, 700), lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.web_name}</div>
        <div style={{ marginTop: 5 }}>
          <span style={code(12.5)}>{p.team} · {POS_LABEL[p.position]}</span>
          <span style={val(12, "#FFFFFF", 500)}> £{Number(p.price).toFixed(1)}</span>
        </div>
      </div>
      {next && <Plate h={30} w={78} bg={T.plate}>{next}</Plate>}
      <Plate h={30} w={62} bg={T.plate} color={T.green}>{Number(p.score).toFixed(1)}</Plate>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 30, minWidth: 52,
        borderRadius: 10, padding: "0 8px", background: T.tag, ...val(12, "#FFFFFF", 700) }}>
        {valueScore.toFixed(1)}
      </span>
      {p.status && p.status !== "a" && <Flag size={13} color={T.pink} />}
      {owned ? (
        <span style={{ display: "flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 999,
          background: "#06331D", ...lang(12.5, 700, T.green) }}>IN SQUAD</span>
      ) : (
        <button onClick={() => onAdd(p)} disabled={blocked} className="fb-press"
          style={{ display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 14px", borderRadius: 999,
            background: blocked ? T.plate : T.green, border: blocked ? `1px solid ${T.line}` : "none",
            ...lang(12.5, 700, blocked ? "#FFFFFF" : "#04130A") }}>
          <Plus size={13} /> {actionLabel || "ADD"}
        </button>
      )}
    </div>
  );
}

/* Modal picker for one position — opened by clicking an empty pitch slot. */
export function PlayerModal({ pos, pool, squad, clubs, nextFor, onAdd, onClose, cap }) {
  const [q, setQ] = React.useState("");
  const [f, setF] = React.useState({ ...DEFAULT_FILTERS, hideOwned: true });
  const list = filterPool(pool, pos, squad, q, f);
  const picked = posCount(squad, pos);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", alignItems: "center",
      justifyContent: "center", background: "rgba(6,0,10,0.72)" }}>
      <div onClick={(e) => e.stopPropagation()} className="fb-drawer"
        style={{ width: 720, maxHeight: "82vh", background: T.row, border: `1px solid ${T.line}`,
          borderRadius: S.radius, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "20px 24px", borderBottom: `1px solid ${T.line}` }}>
          <div>
            <Label color={T.green}>Add {POS_LABEL[pos]}</Label>
            <div style={{ marginTop: 7 }}>
              <span style={val(13, "#FFFFFF", 500)}>
                {picked}/{COMPOSITION[pos]} PICKED · £{bankOf(squad).toFixed(1)} LEFT
                {cap !== undefined && cap !== null ? ` · CAP £${Number(cap).toFixed(1)}` : ""} · {list.length} SHOWN
              </span>
            </div>
          </div>
          <button onClick={onClose} className="fb-press" style={{ width: 38, height: 38, borderRadius: 19,
            border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={17} color="#FFFFFF" />
          </button>
        </header>
        <div style={{ padding: "16px 24px 12px", borderBottom: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.card,
            border: `1px solid ${T.line}`, borderRadius: 12, padding: "0 14px", height: 44 }}>
            <Search size={15} color="#FFFFFF" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or club"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", ...lang(15, 600) }} />
          </div>
          <FilterBar f={f} setF={setF} clubs={clubs} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((p) => <PlayerRow key={p.id} p={p} squad={squad} onAdd={onAdd} next={nextFor(p)} cap={cap} />)}
          {list.length === 0 && <div style={{ padding: "30px 0", textAlign: "center", ...lang(15, 600) }}>No players match those filters.</div>}
        </div>
      </div>
    </div>
  );
}

/* Inline browser under the pitch — quick add without opening a slot. */
export function Browser({ pool, squad, clubs, nextFor, onAdd }) {
  const [pos, setPos] = React.useState("MID");
  const [q, setQ] = React.useState("");
  const [f, setF] = React.useState(DEFAULT_FILTERS);
  const list = filterPool(pool, pos, squad, q, f);
  return (
    <section style={{ background: T.row, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 20,
      display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Label color={T.green}>Player database</Label>
        <span style={val(12, "#FFFFFF", 500)}>{list.length} SHOWN · SORTED {f.sort}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {["GKP", "DEF", "MID", "FWD"].map((k) => (
          <button key={k} onClick={() => setPos(k)} className="fb-press"
            style={{ height: 38, padding: "0 18px", borderRadius: 999, ...lang(13.5, 700, pos === k ? "#04130A" : "#FFFFFF"),
              background: pos === k ? T.green : T.card, border: `1px solid ${pos === k ? T.green : T.line}` }}>
            {POS_LABEL[k]}
          </button>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.card, border: `1px solid ${T.line}`,
          borderRadius: 12, padding: "0 12px", height: 38, flex: 1, minWidth: 180 }}>
          <Search size={14} color="#FFFFFF" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", ...lang(14, 600) }} />
        </div>
      </div>
      <FilterBar f={f} setF={setF} clubs={clubs} />
      <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((p) => <PlayerRow key={p.id} p={p} squad={squad} onAdd={onAdd} next={nextFor(p)} />)}
        {list.length === 0 && <div style={{ padding: "30px 0", textAlign: "center", ...lang(15, 600) }}>No players match those filters.</div>}
      </div>
    </section>
  );
}
