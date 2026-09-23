"use client";
import React from "react";
import { EXTERNAL_XPTS_GW_TO } from "../lib/external_xpts.mjs";
import { Search } from "lucide-react";
import { T, S, POS_LABEL, lang, val, code } from "../lib/ui";
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


/* One field of a typed range. Kept separate so each input owns the text being typed into it, which a
   single shared component cannot do without the two fields fighting over one draft value. */
function TypedField({ value, min, max, onCommit, ariaLabel }) {
  const [draft, setDraft] = React.useState(String(value));
  const [editing, setEditing] = React.useState(false);

  /* While the cursor is elsewhere the field mirrors the range; while it is here it mirrors what is being
     typed. Without this the box would fight the user on every render. */
  React.useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = Number(draft);
    /* An empty or nonsense entry returns to what it was rather than jumping to a bound: someone who
       cleared the field and thought better of it has not asked for the minimum. */
    if (draft.trim() === "" || !Number.isFinite(parsed)) { setDraft(String(value)); return; }
    onCommit(Math.min(Math.max(parsed, Number(min)), Number(max)));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.currentTarget.blur(); }
        if (event.key === "Escape") { setDraft(String(value)); setEditing(false); event.currentTarget.blur(); }
      }}
      aria-label={ariaLabel}
      style={{ width: 78, height: S.ctrl, background: T.plate, border: `1px solid ${T.line}`,
        borderRadius: S.radiusXs, padding: "0 8px", ...val(13, T.xp), outline: "none" }}
    />
  );
}

function TypedRange({ label, lo, hi, min, max, onChange }) {
  return (
    <div className="zeus-filter-range zeus-filter-range-compact" aria-label={`${label} range`}>
      <span style={code(12, T.xp)}>{label}</span>
      <div className="zeus-filter-range-selects">
        <TypedField value={lo} min={min} max={max} ariaLabel={`${label} minimum`}
          onCommit={(next) => onChange(rangeWithMin([lo, hi], next))} />
        <span style={code(12, T.xp)}>to</span>
        <TypedField value={hi} min={min} max={max} ariaLabel={`${label} maximum`}
          onCommit={(next) => onChange(rangeWithMax([lo, hi], next))} />
      </div>
    </div>
  );
}

function RangeSelect({ label, value, min, max, step, prefix = "", suffix = "", onChange, typed = false }) {
  const values = React.useMemo(() => numericRangeOptions(min, max, step), [min, max, step]);
  const lo = Number(value?.[0] ?? min);
  const hi = Number(value?.[1] ?? max);
  const decimals = Number(step) < 1 ? 1 : 0;
  const format = (number) => `${prefix}${Number(number).toFixed(decimals)}${suffix}`;

  /* TYPED, NOT JUST PICKED.
   *
   * A dropdown built at half-million steps can only ever offer 4.0, 4.5, 5.0. FPL prices move in tenths,
   * so a filter for 4.6 was simply not expressible and the nearest option quietly changed the question.
   * The number is typed here and clamped to the pool's real bounds; the step only decides how the arrow
   * keys nudge it. */
  if (typed) {
    /* CLAMPING ON EVERY KEYSTROKE MAKES THE FIELD UNUSABLE.
     *
     * Each input clamped what you typed the instant you typed it. Clearing the box gives an empty string,
     * Number("") is 0, 0 is a finite number, so it clamped straight to the lower bound before a single
     * digit could be entered: the field snapped back to 4 and then to 15.5, and there was no way to type
     * 6 at all. On a phone, where you cannot select-all-and-overtype as easily, it was simply broken.
     *
     * The field now holds whatever you are typing, as text, and is only interpreted when you leave it or
     * press Enter. Half-typed states like "", "1" on the way to "12", and "6." are all legal while the
     * cursor is in the box, which is the whole point of letting someone type a number.
     */
    return (
      <TypedRange label={label} lo={lo} hi={hi} min={min} max={max}
        onChange={onChange} prefix={prefix} suffix={suffix} />
    );
  }

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
  /* Minutes played this season, as a range. Null hides the control. */
  minutes = null, setMinutes = null, minutesBounds = [0, 0],
  sort, setSort, sortKeys = SORT_KEYS, gwFrom = 1, gwTo = 1, setRange = null, maxGw = EXTERNAL_XPTS_GW_TO, firstGw = 1,
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
              /* Escape clears the search and leaves the box; a second Escape does nothing. Enter leaves
                 the box so the list can be scrolled with the keys. */
              onKeyDown={(e) => {
                if (e.key === "Escape") { if (q) setQ(""); else e.currentTarget.blur(); }
                if (e.key === "Enter") e.currentTarget.blur();
              }}
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

            {setClub && (() => {
              /* SEVERAL CLUBS AT ONCE.
               *
               * One club at a time is the wrong shape for the question this filter answers. "Who is worth
               * having from the three clubs with the easiest run" cannot be asked one club at a time, and
               * comparing across them meant flipping the dropdown and holding the previous list in your
               * head. The dropdown adds a club; each chosen club sits as a chip that removes on tap;
               * nothing chosen means any club, exactly as before. A single stored string from before this
               * change is read as a list of one, so a remembered filter carries over. */
              const chosen = Array.isArray(club) ? club : (club && club !== "ANY" ? [club] : []);
              const remaining = (clubs || []).filter((item) => !chosen.includes(item.short_name));
              return (
                <Field label="CLUB">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {chosen.map((short) => {
                      const item = (clubs || []).find((c) => c.short_name === short);
                      return (
                        <button key={short} type="button" className="fb-press"
                          onClick={() => setClub(chosen.filter((c) => c !== short))}
                          aria-label={`Remove ${item?.name || short}`}
                          title="Remove"
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: S.ctrlSm,
                            padding: "0 9px", borderRadius: S.radiusSm, background: T.tag, border: "none",
                            cursor: "pointer", ...lang(12, 700, T.onTag) }}>
                          {short}<span aria-hidden="true">×</span>
                        </button>
                      );
                    })}
                    <select value="" onChange={(e) => { if (e.target.value) setClub([...chosen, e.target.value]); }}
                      aria-label={chosen.length ? "Add another club" : "Club"}
                      className="zeus-strip-select" style={dropdownStyle}>
                      <option value="" style={{ background: T.card }}>{chosen.length ? "+ ADD" : "ANY"}</option>
                      {remaining.map((item) => (
                        <option key={item.short_name} value={item.short_name} style={{ background: T.card }}>
                          {item.name || item.short_name}
                        </option>
                      ))}
                    </select>
                  </span>
                </Field>
              );
            })()}

            <RangeSelect label="PRICE" value={price || priceBounds} min={priceBounds[0]} max={priceBounds[1]}
              step={0.1} prefix="£" suffix="m" onChange={setPrice} typed />

            {setOwnership && ownership && (
              <RangeSelect label="OWNERSHIP" value={ownership} min={ownershipBounds[0]} max={ownershipBounds[1]}
                step={5} suffix="%" onChange={setOwnership} />
            )}
            {/* Real minutes this season, beside ownership. It existed as a stacked condition, which is the
                right place for a rule you add occasionally and the wrong place for one you reach for every
                time: a per-90 or a points total off two substitute appearances is noise, and filtering it
                out should be one control, not a condition to build. */}
            {setMinutes && minutes && minutesBounds[1] > 0 && (
              <RangeSelect label="MINUTES" value={minutes} min={minutesBounds[0]} max={minutesBounds[1]}
                step={90} onChange={setMinutes} />
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
