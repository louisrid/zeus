"use client";
import React from "react";
import { Search } from "lucide-react";
import { T, S, POS_LABEL, lang, val, code } from "../lib/ui";
import { SORT_KEYS, cycleSort, sortArrow } from "../lib/sorting.mjs";
import { numericRangeOptions, rangeWithMin, rangeWithMax } from "../lib/range-options.mjs";
import GameweekRange from "./GameweekRange";

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

function RangeSelect({ label, value, min, max, step, prefix = "", suffix = "", onChange }) {
  const values = React.useMemo(() => numericRangeOptions(min, max, step), [min, max, step]);
  const lo = Number(value?.[0] ?? min);
  const hi = Number(value?.[1] ?? max);
  const decimals = Number(step) < 1 ? 1 : 0;
  const format = (number) => `${prefix}${Number(number).toFixed(decimals)}${suffix}`;

  return (
    <div className="zeus-filter-range" aria-label={`${label} range`}>
      <span style={code(13, T.xp)}>{label}</span>
      <div className="zeus-filter-range-selects">
        <label className="zeus-gw-select-field">
          <span style={code(12.5, T.xp)}>MIN</span>
          <select value={lo}
            onChange={(event) => onChange(rangeWithMin([lo, hi], Number(event.target.value)))}
            aria-label={`${label} minimum`} className="zeus-gw-select"
            style={{ background: T.plate, border: `1px solid ${T.line}`, ...val(14.5, T.xp) }}>
            {values.map((number) => (
              <option key={number} value={number} style={{ background: T.card }}>{format(number)}</option>
            ))}
          </select>
        </label>
        <label className="zeus-gw-select-field">
          <span style={code(12.5, T.xp)}>MAX</span>
          <select value={hi}
            onChange={(event) => onChange(rangeWithMax([lo, hi], Number(event.target.value)))}
            aria-label={`${label} maximum`} className="zeus-gw-select"
            style={{ background: T.plate, border: `1px solid ${T.line}`, ...val(14.5, T.xp) }}>
            {values.map((number) => (
              <option key={number} value={number} style={{ background: T.card }}>{format(number)}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export default function PlayerControls({
  q, setQ, position, setPosition, price, setPrice, priceBounds,
  ownership = null, setOwnership = null, ownershipBounds = [0, 100],
  sort, setSort, sortKeys = SORT_KEYS, gwFrom = 1, gwTo = 1, setRange = null, maxGw = 8, firstGw = 1,
  club = "ANY", setClub = null, clubs = null,
  compare, setCompare, onReset, showGameweekRange = true, gameweekDescription = true,
}) {
  return (
    <div data-zeus-controls-version="dropdown-ranges-v1"
      style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", paddingBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: 4 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, height: 56, width: "100%", maxWidth: 720,
          padding: "0 18px", borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.line}` }}>
          <Search size={18} color="#FFFFFF" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player or club"
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: "#FFFFFF",
              ...lang(16, 600), outline: "none" }} />
        </label>
      </div>

      <div className="zeus-player-filter-row">
        <Field label="POSITION">
          <select value={position} onChange={(e) => setPosition(e.target.value)} style={dropdownStyle}>
            {["ANY", "GKP", "DEF", "MID", "FWD"].map((key) => (
              <option key={key} value={key} style={{ background: T.card }}>
                {key === "ANY" ? "ANY" : POS_LABEL[key]}
              </option>
            ))}
          </select>
        </Field>

        {setClub && (
          <Field label="CLUB">
            <select value={club} onChange={(e) => setClub(e.target.value)} style={dropdownStyle}>
              <option value="ANY" style={{ background: T.card }}>ANY</option>
              {(clubs || []).map((item) => (
                <option key={item.short_name} value={item.short_name} style={{ background: T.card }}>
                  {item.name || item.short_name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <RangeSelect label="PRICE" value={price || priceBounds} min={priceBounds[0]} max={priceBounds[1]}
          step={0.5} prefix="£" suffix="m" onChange={setPrice} />

        {setOwnership && ownership && (
          <RangeSelect label="OWNERSHIP" value={ownership} min={ownershipBounds[0]} max={ownershipBounds[1]}
            step={5} suffix="%" onChange={setOwnership} />
        )}

        <Field label="SORT BY">
          <select value={sort.key} onChange={(e) => setSort(cycleSort(sort, e.target.value))} style={dropdownStyle}>
            {sortKeys.map((s) => (
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

      {showGameweekRange && setRange && (
        <GameweekRange from={gwFrom} to={gwTo} min={firstGw} max={maxGw}
          onChange={setRange} description={gameweekDescription} />
      )}
    </div>
  );
}
