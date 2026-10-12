"use client";
import React from "react";
import { EXTERNAL_XPTS_GW_TO } from "../lib/external_xpts.mjs";
import { Search } from "lucide-react";
import { POS_LABEL, Stepper } from "../lib/ui";
import { SORT_KEYS, cycleSort, sortArrow } from "../lib/sorting.mjs";
import { numericRangeOptions, rangeWithMin, rangeWithMax } from "../lib/range-options.mjs";
import GameweekRange from "./GameweekRange";
import { Panel, PanelRow, Field, Button, Select, Pair, Disclosure, PanelNote } from "./Panel";

/* THE PLAYER FILTERS.
 *
 * One panel, two rows on a desktop. The first row is what you reach for every time: search, position,
 * club and sort. The second is price, the gameweeks the totals cover, RESET, and one grey "More
 * filters" toggle that opens ownership, minutes and whatever the page adds (conditions, a season
 * toggle). Every filter stays a live control at every width: a closed toggle hides nothing from the
 * query, only from the eye, and the toggle's label counts what is applied inside it so a hidden filter
 * is never a silent one. On a phone the same rows stack two to a line. */

/* One field of a typed range. Kept separate so each input owns the text being typed into it, which a
   single shared component cannot do without the two fields fighting over one draft value. */
function TypedField({ value, min, max, onCommit, ariaLabel, step = 0.1, decimals = 1 }) {
  const show = (number) => Number(number).toFixed(decimals);
  const [draft, setDraft] = React.useState(show(value));
  const [editing, setEditing] = React.useState(false);

  /* While the cursor is elsewhere the field mirrors the range; while it is here it mirrors what is being
     typed. Without this the box would fight the user on every render. */
  React.useEffect(() => { if (!editing) setDraft(show(value)); }, [value, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    setEditing(false);
    const parsed = Number(draft);
    /* An empty or nonsense entry returns to what it was rather than jumping to a bound: someone who
       cleared the field and thought better of it has not asked for the minimum. */
    if (draft.trim() === "" || !Number.isFinite(parsed)) { setDraft(show(value)); return; }
    onCommit(Math.min(Math.max(parsed, Number(min)), Number(max)));
  };

  const nudge = (dir) => {
    const next = Math.round((Number(value) + dir * step) * 100) / 100;
    onCommit(Math.min(Math.max(next, Number(min)), Number(max)));
  };

  return (
    <Stepper onStep={nudge} label={ariaLabel} size="panel">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.currentTarget.blur(); }
          if (event.key === "Escape") { setDraft(show(value)); setEditing(false); event.currentTarget.blur(); }
        }}
        aria-label={ariaLabel}
        className="zeus-ctl zeus-input zeus-input-num"
      />
    </Stepper>
  );
}

function TypedRange({ label, lo, hi, min, max, onChange }) {
  return (
    <Field label={label} className="zeus-field-pair" role="group" ariaLabel={`${label} range`}>
      <Pair>
        <TypedField value={lo} min={min} max={max} ariaLabel={`${label} minimum`}
          onCommit={(next) => onChange(rangeWithMin([lo, hi], next))} />
        <span aria-hidden="true" className="zeus-pair-sep">to</span>
        <TypedField value={hi} min={min} max={max} ariaLabel={`${label} maximum`}
          onCommit={(next) => onChange(rangeWithMax([lo, hi], next))} />
      </Pair>
    </Field>
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
   * keys nudge it. The field holds whatever is being typed, as text, and is only interpreted when you
   * leave it or press Enter, so half-typed states like "" and "6." are legal while the cursor is there. */
  if (typed) {
    return (
      <TypedRange label={label} lo={lo} hi={hi} min={min} max={max}
        onChange={onChange} prefix={prefix} suffix={suffix} />
    );
  }

  return (
    <Field label={label} className="zeus-field-pair" role="group" ariaLabel={`${label} range`}>
      <Pair>
        <Select value={lo} aria-label={`${label} minimum`}
          onChange={(event) => onChange(rangeWithMin([lo, hi], Number(event.target.value)))}>
          {values.map((number) => <option key={number} value={number}>{format(number)}</option>)}
        </Select>
        <span aria-hidden="true" className="zeus-pair-sep">to</span>
        <Select value={hi} aria-label={`${label} maximum`}
          onChange={(event) => onChange(rangeWithMax([lo, hi], Number(event.target.value)))}>
          {values.map((number) => <option key={number} value={number}>{format(number)}</option>)}
        </Select>
      </Pair>
    </Field>
  );
}

/* How many of the folded filters are narrowing the list, for the toggle's label. */
function countApplied({ ownership, ownershipBounds, minutes, minutesBounds, moreCount }) {
  let n = 0;
  if (ownership && (Number(ownership[0]) > Number(ownershipBounds[0]) || Number(ownership[1]) < Number(ownershipBounds[1]))) n += 1;
  if (minutes && minutesBounds[1] > 0 && (Number(minutes[0]) > Number(minutesBounds[0]) || Number(minutes[1]) < Number(minutesBounds[1]))) n += 1;
  return n + (Number(moreCount) || 0);
}

export default function PlayerControls({
  q, setQ, position, setPosition, price, setPrice, priceBounds,
  ownership = null, setOwnership = null, ownershipBounds = [0, 100],
  /* Minutes played this season, as a range. Null hides the control. */
  minutes = null, setMinutes = null, minutesBounds = [0, 0],
  sort, setSort, sortKeys = SORT_KEYS, gwFrom = 1, gwTo = 1, setRange = null, maxGw = EXTERNAL_XPTS_GW_TO, firstGw = 1,
  club = "ANY", setClub = null, clubs = null,
  onReset, showGameweekRange = true, gameweekDescription = true,
  /* Anything the page wants inside "More filters", after ownership and minutes: conditions, a toggle. */
  more = null,
  /* How many of those extras are applied, so the closed toggle can say so. */
  moreCount = 0,
  /* A short line at the end of the second row: the count of players shown. */
  aside = null,
  /* The old name for `more`, kept so a caller that still passes it is not silently ignored. */
  extra = null,
}) {
  const [moreOpen, setMoreOpen] = React.useState(false);

  /* "/" puts the cursor in the search box from anywhere on the page, unless something else is already
     being typed into. Escape clears it. One key, no mouse, on every list. */
  const searchRef = React.useRef(null);
  React.useEffect(() => {
    const onKey = (event) => {
      const tag = (event.target && event.target.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (event.target && event.target.isContentEditable);
      if (event.key === "/" && !typing && searchRef.current) { event.preventDefault(); searchRef.current.focus(); }
      if (event.key === "Escape" && event.target === searchRef.current) { setQ(""); searchRef.current.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setQ]);

  const applied = countApplied({ ownership, ownershipBounds, minutes, minutesBounds, moreCount });
  const hasMore = Boolean((setOwnership && ownership) || (setMinutes && minutes && minutesBounds[1] > 0) || more || extra);

  /* SEVERAL CLUBS AT ONCE.
   *
   * "Who is worth having from the three clubs with the easiest run" cannot be asked one club at a time.
   * The dropdown adds a club; each chosen club sits as a blue tag that removes on tap; nothing chosen
   * means any club. A single stored string from before this change is read as a list of one. */
  const chosen = Array.isArray(club) ? club : (club && club !== "ANY" ? [club] : []);
  const remaining = (clubs || []).filter((item) => !chosen.includes(item.short_name));

  return (
    <div data-zeus-controls-version="dropdown-ranges-v1" className="zeus-filter-shelf">
      <Panel label="Player filters">
        <PanelRow ariaLabel="Player search and filters">
          <label className="zeus-ctl zeus-search">
            <Search size={18} color="#FFFFFF" aria-hidden="true" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players"
              aria-label="Search player or club"
              /* Escape clears the search and leaves the box; a second Escape does nothing. Enter leaves
                 the box so the list can be scrolled with the keys. */
              onKeyDown={(e) => {
                if (e.key === "Escape") { if (q) setQ(""); else e.currentTarget.blur(); }
                if (e.key === "Enter") e.currentTarget.blur();
              }} />
            {q ? (
              <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="fb-press zeus-search-clear">×</button>
            ) : null}
          </label>

          <Field label="Position">
            <Select value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Position">
              {["ANY", "GKP", "DEF", "MID", "FWD"].map((key) => (
                <option key={key} value={key}>{key === "ANY" ? "Any" : POS_LABEL[key]}</option>
              ))}
            </Select>
          </Field>

          {setClub && (
            <Field label="Club" className="zeus-field-club">
              <div className="zeus-club-picker">
                {chosen.map((short) => {
                  const item = (clubs || []).find((c) => c.short_name === short);
                  return (
                    <Button key={short} tone="blue" className="zeus-club-tag"
                      onClick={() => setClub(chosen.filter((c) => c !== short))}
                      aria-label={`Remove ${item?.name || short}`} title="Remove">
                      {short} <span aria-hidden="true">×</span>
                    </Button>
                  );
                })}
                <Select value="" onChange={(e) => { if (e.target.value) setClub([...chosen, e.target.value]); }}
                  aria-label={chosen.length ? "Add another club" : "Club"}>
                  <option value="">{chosen.length ? "Add a club" : "Any"}</option>
                  {remaining.map((item) => (
                    <option key={item.short_name} value={item.short_name}>{item.name || item.short_name}</option>
                  ))}
                </Select>
              </div>
            </Field>
          )}

          <Field label="Sort by" className="zeus-field-sort">
            <Select value={sort.key} onChange={(e) => setSort(cycleSort(sort, e.target.value))} aria-label="Sort by">
              {sortKeys.map((s) => (
                <option key={s.key} value={s.key}>{s.label}{sortArrow(sort, s.key)}</option>
              ))}
            </Select>
          </Field>
        </PanelRow>

        <PanelRow ariaLabel="Price, gameweeks and more filters">
          <RangeSelect label="Price" value={price || priceBounds} min={priceBounds[0]} max={priceBounds[1]}
            step={0.1} prefix="£" suffix="m" onChange={setPrice} typed />

          {showGameweekRange && setRange && (
            <GameweekRange from={gwFrom} to={gwTo} min={firstGw} max={maxGw} compact
              onChange={setRange} description={gameweekDescription} />
          )}

          {onReset && (
            <Button tone="red" onClick={onReset} aria-label="Reset filters"
              title="Clear every filter and go back to the default sort.">RESET</Button>
          )}

          {hasMore && (
            <Disclosure label="More filters" summary={applied > 0 ? `${applied} applied` : null}
              open={moreOpen} onToggle={() => setMoreOpen((value) => !value)} ariaLabel="More filters">
              <PanelRow>
                {setOwnership && ownership && (
                  <RangeSelect label="Ownership" value={ownership} min={ownershipBounds[0]} max={ownershipBounds[1]}
                    step={5} suffix="%" onChange={setOwnership} />
                )}
                {/* Real minutes this season, beside ownership. A per-90 or a points total off two
                    substitute appearances is noise, and filtering it out should be one control, not a
                    condition to build. */}
                {setMinutes && minutes && minutesBounds[1] > 0 && (
                  <RangeSelect label="Minutes" value={minutes} min={minutesBounds[0]} max={minutesBounds[1]}
                    step={90} onChange={setMinutes} />
                )}
                {more}
                {extra}
              </PanelRow>
            </Disclosure>
          )}

          {aside && <PanelNote className="zeus-push">{aside}</PanelNote>}
        </PanelRow>
      </Panel>
    </div>
  );
}
