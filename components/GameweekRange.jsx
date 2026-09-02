"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";
import { clampGameweekRange, gameweekRangeLabel } from "../lib/gameweek-range.mjs";
import { EXTERNAL_XPTS_GW_TO } from "../lib/external_xpts.mjs";

function WeekSelect({ label, value, min, max, onChange, compact = false }) {
  const options = Array.from({ length: Math.max(0, Number(max) - Number(min) + 1) }, (_, index) => Number(min) + index);
  return (
    <label className={`zeus-gw-select-field${compact ? " zeus-gw-select-field-compact" : ""}`}>
      <span style={code(compact ? 12 : 13)}>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${label} gameweek`} className={`zeus-gw-select${compact ? " zeus-gw-select-compact" : ""}`}
        style={{ background: T.plate, border: `1px solid ${T.line}`, ...val(compact ? 12.5 : 14.5, T.xp) }}>
        {options.map((gw) => <option key={gw} value={gw} style={{ background: T.card }}>GW{gw}</option>)}
      </select>
    </label>
  );
}

export default function GameweekRange({ from, to, min = 1, max = EXTERNAL_XPTS_GW_TO, onChange, showPresets = false, description = true, compact = false }) {
  const range = clampGameweekRange(from, to, min, max);
  const setFrom = (value) => onChange(value, Math.max(value, range.to));
  const setTo = (value) => onChange(Math.min(range.from, value), value);
  /* The longest shortcut used to be eight weeks, which was the whole horizon when it was written and is
     now a fifth of it. The presets scale with what is served, so the season-long view is one tap rather
     than two dropdowns. Duplicates collapse, so a short horizon still shows a sensible few. */
  const span = Math.max(1, Number(max) - Number(min) + 1);
  const presetLengths = [...new Set([1, 4, 8, Math.ceil(span / 2), span])]
    .filter((length) => length >= 1 && length <= span)
    .sort((a, b) => a - b);
  const presets = presetLengths.map((length) => ({
    length,
    from: Number(min),
    to: Math.min(Number(max), Number(min) + length - 1),
  })).filter((item, index, all) => all.findIndex((other) => other.to === item.to) === index);

  /* The description used to occupy its own line inside the box and was the single largest part of the
     75px desktop height. In compact mode it becomes the box tooltip instead, so the sentence is still
     available on hover and to assistive technology without costing a row. */
  const descriptionText = typeof description === "string"
    ? description
    : (description ? "xPTS and optimisation use this selected total." : "");

  const presetButtons = showPresets ? (
    <div className={`zeus-gw-presets${compact ? " zeus-gw-presets-compact" : ""}`} aria-label="Gameweek range presets">
      {presets.map(({ length, from: presetFrom, to: presetTo }) => {
        const active = range.from === presetFrom && range.to === presetTo;
        return (
          <button type="button" key={length} className="fb-press zeus-gw-preset" aria-pressed={active}
            onClick={() => onChange(presetFrom, presetTo)}
            style={{ background: active ? T.xp : T.plate, border: `1px solid ${active ? T.xp : T.line}`,
              ...lang(compact ? 12 : 13, 700, active ? "#04130A" : "#FFFFFF") }}>
            {length === 1 ? "1 GW" : `${length} GWs`}
          </button>
        );
      })}
    </div>
  ) : null;

  if (compact) {
    return (
      <section aria-label="Gameweek range" className="zeus-gw-range zeus-gw-range-inline"
        title={descriptionText || undefined}
        style={{ borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.xp}` }}>
        <div className="zeus-gw-selects zeus-gw-selects-compact">
          <WeekSelect compact label="FROM" value={range.from} min={Number(min)} max={Number(max)} onChange={setFrom} />
          <WeekSelect compact label="TO" value={range.to} min={Number(min)} max={Number(max)} onChange={setTo} />
        </div>
        {presetButtons}
        {descriptionText ? <span className="zeus-sr-only">{descriptionText}</span> : null}
      </section>
    );
  }

  return (
    <section aria-label="Gameweek range" className="zeus-gw-range"
      style={{ borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.xp}` }}>
      <div className="zeus-gw-summary">
        <span style={code(13, T.xp)}>GAMEWEEK RANGE</span>
        <span style={val(18, T.xp)}>{gameweekRangeLabel(range.from, range.to)}</span>
      </div>

      <div className="zeus-gw-selects">
        <WeekSelect label="FROM" value={range.from} min={Number(min)} max={Number(max)} onChange={setFrom} />
        <WeekSelect label="TO" value={range.to} min={Number(min)} max={Number(max)} onChange={setTo} />
      </div>

      {presetButtons}

      {description ? <span className="zeus-gw-description" style={lang(13.5, 600)}>
        {descriptionText}
      </span> : null}
    </section>
  );
}
