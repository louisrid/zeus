"use client";
import React from "react";
import { Search } from "lucide-react";
import { T, POS_LABEL, lang, val, code } from "../lib/ui";
import { SORT_KEYS, cycleSort, sortArrow } from "../lib/sorting.mjs";
import { numericRangeOptions, rangeWithMin, rangeWithMax } from "../lib/range-options.mjs";
import GameweekRange from "./GameweekRange";
import ControlShelf from "./ControlShelf";

/* THE FILTER STRIP.
 *
 * The search box, the filter fields and the gameweek box used to be three stacked blocks totalling
 * 326px before the first player row. They are now two dense rows inside one shelf. Labels shrink
 * rather than disappear, so nothing has to be guessed, and the gameweek sentence becomes a tooltip.
 * Every filter is still a live control at every width: on a phone the extras are hidden by the
 * stylesheet until the shelf is opened, never unmounted, so any combination already applied stays
 * applied. */

const Field = ({ label, children, title }) => (
  <label className="zeus-strip-field" title={title}>
    <span style={code(12)}>{label}</span>
    {children}
  </label>
);

const dropdownStyle = {
  background: T.card, border: `1px solid ${T.line}`, color: "#FFFFFF", ...lang(13, 700), outline: "none",
};

function RangeSelect({ label, value, min, max, step, prefix = "", suffix = "", onChange }) {
  const values = React.useMemo(() => numericRangeOptions(min, max, step), [min, max, step]);
  const lo = Number(value?.[0] ?? min);
  const hi = Number(value?.[1] ?? max);
  const decimals = Number(step) < 1 ? 1 : 0;
  const format = (number) => `${prefix}${Number(number).toFixed(decimals)}${suffix}`;

  return (
    <div className="zeus-filter-range zeus-filter-range-compact" aria-label={`${label} range`}>
      <span style={code(12, T.xp)}>{label}</span>
      <div className="zeus-filter-range-selects">
        <select value={lo}
          onChange={(event) => onChange(rangeWithMin([lo, hi], Number(event.target.value)))}
          aria-label={`${label} minimum`} className="zeus-strip-select"
          style={{ background: T.plate, border: `1px solid ${T.line}`, ...val(13, T.xp) }}>
          {values.map((number) => (
            <option key={number} value={number} style={{ background: T.card }}>{format(number)}</option>
          ))}
        </select>
        <span style={code(12, T.xp)}>to</span>
        <select value={hi}
          onChange={(event) => onChange(rangeWithMax([lo, hi], Number(event.target.value)))}
          aria-label={`${label} maximum`} className="zeus-strip-select"
          style={{ background: T.plate, border: `1px solid ${T.line}`, ...val(13, T.xp) }}>
          {values.map((number) => (
            <option key={number} value={number} style={{ background: T.card }}>{format(number)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function PlayerControls({
  q, setQ, position, setPosition, price, setPrice, priceBounds,
  ownership = null, setOwnership = null, ownershipBounds = [0, 100],
  sort, setSort, sortKeys = SORT_KEYS, gwFrom = 1, gwTo = 1, setRange = null, maxGw = 8, firstGw = 1,
  club = "ANY", setClub = null, clubs = null,
  onReset, showGameweekRange = true, gameweekDescription = true,
}) {
  return (
    <div data-zeus-controls-version="dropdown-ranges-v1" className="zeus-filter-shelf">
      <ControlShelf ariaLabel="Player filters">
        <section className="zeus-control-strip zeus-filter-strip" aria-label="Player search and filters">
          <label className="zeus-search-field">
            <Search size={15} color="#FFFFFF" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player or club"
              aria-label="Search player or club"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: "#FFFFFF",
                ...lang(14, 600), outline: "none" }} />
          </label>

          <div className="zeus-player-filter-row">
            <Field label="POSITION">
              <select value={position} onChange={(e) => setPosition(e.target.value)}
                aria-label="Position" className="zeus-strip-select" style={dropdownStyle}>
                {["ANY", "GKP", "DEF", "MID", "FWD"].map((key) => (
                  <option key={key} value={key} style={{ background: T.card }}>
                    {key === "ANY" ? "ANY" : POS_LABEL[key]}
                  </option>
                ))}
              </select>
            </Field>

            {setClub && (
              <Field label="CLUB">
                <select value={club} onChange={(e) => setClub(e.target.value)}
                  aria-label="Club" className="zeus-strip-select" style={dropdownStyle}>
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
              <select value={sort.key} onChange={(e) => setSort(cycleSort(sort, e.target.value))}
                aria-label="Sort by" className="zeus-strip-select" style={dropdownStyle}>
                {sortKeys.map((s) => (
                  <option key={s.key} value={s.key} style={{ background: T.card }}>
                    {s.label}{sortArrow(sort, s.key)}
                  </option>
                ))}
              </select>
            </Field>

            {showGameweekRange && setRange && (
              <GameweekRange from={gwFrom} to={gwTo} min={firstGw} max={maxGw} compact
                onChange={setRange} description={gameweekDescription} />
            )}

            {onReset && (
              <button onClick={onReset} className="fb-press zeus-strip-select"
                aria-label="Reset filters" title="Clear every filter and go back to the default sort."
                style={{ ...dropdownStyle, cursor: "pointer", minWidth: 74 }}>
                RESET
              </button>
            )}
          </div>
        </section>
      </ControlShelf>
    </div>
  );
}
