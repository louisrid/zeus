"use client";
import React from "react";
import { Search } from "lucide-react";
import { T, S, POS_LABEL, lang, val, code } from "../lib/ui";
import { SORT_KEYS, cycleSort, sortArrow } from "../lib/sorting.mjs";

/* THE PLAYER CONTROLS, shared by the Players page and the Builder's player list.
 *
 * One control set, one piece of sort state, so the dropdown and the table headings can never disagree.
 * Every numeric filter is continuous and every dropdown defaults to ANY: no bands, no presets.
 *
 * SORT_KEYS is the single list. The SORT BY dropdown and the sortable table columns are both generated
 * from it, in this order, so they cannot drift apart.
 */

const Field = ({ label, children }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    <span style={code(13)}>{label}</span>
    {children}
  </label>
);

const dropdownStyle = {
  height: 48, padding: "0 14px", borderRadius: S.radiusSm, background: T.card,
  border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(14.5, 700), outline: "none", minWidth: 150,
};

/* Two-handle range. Used for price, and reusable for anything else continuous. */
function Range({ lo, hi, min, max, step = 0.1, onChange, suffix = "" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240,
      height: 48, justifyContent: "center", padding: "0 14px", borderRadius: S.radiusSm,
      background: T.card, border: `1px solid ${T.line}` }}>
      <span style={val(13.5)}>{lo.toFixed(1)}{suffix} to {hi.toFixed(1)}{suffix}</span>
      <span style={{ position: "relative", height: 14 }}>
        <input type="range" min={min} max={max} step={step} value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          style={{ position: "absolute", inset: 0, width: "100%", accentColor: T.green, background: "transparent" }} />
        <input type="range" min={min} max={max} step={step} value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          style={{ position: "absolute", inset: 0, width: "100%", accentColor: T.green, background: "transparent" }} />
      </span>
    </div>
  );
}

export default function PlayerControls({
  q, setQ, position, setPosition, price, setPrice, priceBounds,
  sort, setSort, gwFrom = 1, gwTo = 1, setRange = null, maxGw = 8, firstGw = 1, club = "ANY", setClub = null, clubs = null,
  compare, setCompare, onReset,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", paddingBottom: 8 }}>
      {/* Search, centred and tall */}
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: 4 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, height: 56, width: "100%", maxWidth: 720,
          padding: "0 18px", borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}` }}>
          <Search size={18} color="#FFFFFF" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player or club"
            style={{ flex: 1, background: "transparent", border: "none", color: "#FFFFFF",
              ...lang(16, 600), outline: "none" }} />
        </label>
      </div>

      {/* The four controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", justifyContent: "center" }}>
        <Field label="POSITION">
          <select value={position} onChange={(e) => setPosition(e.target.value)} style={dropdownStyle}>
            {["ANY", "GKP", "DEF", "MID", "FWD"].map((k) => (
              <option key={k} value={k} style={{ background: T.card }}>
                {k === "ANY" ? "ANY" : POS_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>

        {setClub && (
          <Field label="CLUB">
            <select value={club} onChange={(e) => setClub(e.target.value)} style={dropdownStyle}>
              <option value="ANY" style={{ background: T.card }}>ANY</option>
              {(clubs || []).map((c) => (
                <option key={c.short_name} value={c.short_name} style={{ background: T.card }}>
                  {c.name || c.short_name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="PRICE">
          <Range lo={price[0]} hi={price[1]} min={priceBounds[0]} max={priceBounds[1]} onChange={setPrice} />
        </Field>

        <Field label="SORT BY">
          <select value={sort.key} onChange={(e) => setSort(cycleSort(sort, e.target.value))} style={dropdownStyle}>
            {SORT_KEYS.map((s) => (
              <option key={s.key} value={s.key} style={{ background: T.card }}>
                {s.label}{sortArrow(sort, s.key)}
              </option>
            ))}
          </select>
        </Field>

        {setCompare && (
        <Field label="COMPARE">
          <button onClick={() => setCompare(!compare)} className="fb-press"
            style={{ ...dropdownStyle, minWidth: 120, cursor: "pointer",
              background: compare ? T.green : T.card,
              border: compare ? "none" : `1px solid ${T.line}`,
              color: compare ? "#04130A" : "#FFFFFF" }}>
            {compare ? "ON" : "OFF"}
          </button>
        </Field>
        )}

        {onReset && (
          <button onClick={onReset} className="fb-press"
            style={{ ...dropdownStyle, minWidth: 100, cursor: "pointer", alignSelf: "flex-end" }}>
            RESET
          </button>
        )}
      </div>

      {/* The gameweek control, only while sorting by xPTS */}
      {sort.key === "XPTS" && setRange && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          padding: "12px 16px", borderRadius: S.radiusSm, background: T.card,
          border: `1px solid ${T.xp}` }}>
          <span style={code(13, T.xp)}>GAMEWEEKS</span>
          {/* A RANGE, with both ends draggable, so GW2 to GW4 is reachable and not only GW1 to N. Two inputs
              stacked on the same track: the browser has no two-thumb slider, and two separate controls
              would let the pair cross over. */}
          <span style={val(16, T.xp)}>
            {gwFrom === gwTo ? `GW${gwFrom}` : `GW${gwFrom}-GW${gwTo}`}
          </span>
          <span style={{ position: "relative", flex: 1, minWidth: 220, height: 28 }}>
            <span style={{ position: "absolute", top: 13, left: 0, right: 0, height: 4, borderRadius: 2,
              background: "rgba(255,255,255,0.18)" }} />
            <span style={{ position: "absolute", top: 13, height: 4, borderRadius: 2, background: T.xp,
              left: `${((gwFrom - firstGw) / Math.max(1, maxGw - firstGw)) * 100}%`,
              right: `${100 - ((gwTo - firstGw) / Math.max(1, maxGw - firstGw)) * 100}%` }} />
            <input type="range" min={firstGw} max={maxGw} step={1} value={gwFrom}
              aria-label="First gameweek"
              onChange={(e) => { const v = Math.min(Number(e.target.value), gwTo); setRange(v, gwTo); }}
              style={{ position: "absolute", inset: 0, width: "100%", margin: 0, background: "transparent",
                accentColor: T.xp, pointerEvents: "auto" }} />
            <input type="range" min={firstGw} max={maxGw} step={1} value={gwTo}
              aria-label="Last gameweek"
              onChange={(e) => { const v = Math.max(Number(e.target.value), gwFrom); setRange(gwFrom, v); }}
              style={{ position: "absolute", inset: 0, width: "100%", margin: 0, background: "transparent",
                accentColor: T.xp, pointerEvents: "auto" }} />
          </span>
          <span style={{ ...lang(13.5, 600) }}>
            xPTS and VALUE add up across these, on the pitch and in the list.
          </span>
        </div>
      )}
    </div>
  );
}
