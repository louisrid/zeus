"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";
import { clampGameweekRange, gameweekRangeLabel } from "../lib/gameweek-range.mjs";

function WeekSelect({ label, value, min, max, onChange }) {
  const options = Array.from({ length: Math.max(0, Number(max) - Number(min) + 1) }, (_, index) => Number(min) + index);
  return (
    <label className="zeus-gw-select-field">
      <span style={code(13)}>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${label} gameweek`} className="zeus-gw-select"
        style={{ background: T.plate, border: `1px solid ${T.line}`, ...val(14.5, T.xp) }}>
        {options.map((gw) => <option key={gw} value={gw} style={{ background: T.card }}>GW{gw}</option>)}
      </select>
    </label>
  );
}

export default function GameweekRange({ from, to, min = 1, max = 8, onChange, showPresets = false, description = true }) {
  const range = clampGameweekRange(from, to, min, max);
  const setFrom = (value) => onChange(value, Math.max(value, range.to));
  const setTo = (value) => onChange(Math.min(range.from, value), value);
  const presetLengths = [1, 4, 8];
  const presets = presetLengths.map((length) => ({
    length,
    from: Number(min),
    to: Math.min(Number(max), Number(min) + length - 1),
  })).filter((item, index, all) => all.findIndex((other) => other.to === item.to) === index);

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

      {showPresets && (
        <div className="zeus-gw-presets" aria-label="Gameweek range presets">
          {presets.map(({ length, from: presetFrom, to: presetTo }) => {
            const active = range.from === presetFrom && range.to === presetTo;
            return (
              <button type="button" key={length} className="fb-press zeus-gw-preset" aria-pressed={active}
                onClick={() => onChange(presetFrom, presetTo)}
                style={{ background: active ? T.xp : T.plate, border: `1px solid ${active ? T.xp : T.line}`,
                  ...lang(13, 700, active ? "#04130A" : "#FFFFFF") }}>
                {length === 1 ? "1 GW" : `${length} GWs`}
              </button>
            );
          })}
        </div>
      )}

      {description && <span className="zeus-gw-description" style={lang(13.5, 600)}>
        {typeof description === "string" ? description : "xPTS and optimisation use this selected total."}
      </span>}
    </section>
  );
}
