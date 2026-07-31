"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";
import { clampGameweekRange, gameweekRangeLabel } from "../lib/gameweek-range.mjs";

function WeekSlider({ label, value, min, max, onChange }) {
  return (
    <label className="zeus-gw-slider">
      <span className="zeus-gw-slider-head">
        <span style={code(13)}>{label}</span>
        <span style={val(15, T.xp)}>GW{value}</span>
      </span>
      <input type="range" min={min} max={max} step={1} value={value} disabled={min === max}
        aria-label={`${label} gameweek`} aria-valuetext={`Gameweek ${value}`}
        onChange={(event) => onChange(Number(event.target.value))} className="zeus-gw-range-input" />
    </label>
  );
}

export default function GameweekRange({ from, to, min = 1, max = 8, onChange, showPresets = false, description = true }) {
  const range = clampGameweekRange(from, to, min, max);
  const setFrom = (value) => onChange(Math.min(value, range.to), range.to);
  const setTo = (value) => onChange(range.from, Math.max(value, range.from));
  const presetLengths = [1, 4, 8];
  const presets = presetLengths.map((length) => ({
    length,
    to: Math.min(Number(max), Number(min) + length - 1),
  })).filter((item, index, all) => all.findIndex((other) => other.to === item.to) === index);

  return (
    <section aria-label="Gameweek range" className="zeus-gw-range"
      style={{ borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.xp}` }}>
      <div className="zeus-gw-summary">
        <span style={code(13, T.xp)}>GAMEWEEK RANGE</span>
        <span style={val(18, T.xp)}>{gameweekRangeLabel(range.from, range.to)}</span>
      </div>
      <div className="zeus-gw-tracks">
        <WeekSlider label="FROM" value={range.from} min={Number(min)} max={range.to} onChange={setFrom} />
        <WeekSlider label="TO" value={range.to} min={range.from} max={Number(max)} onChange={setTo} />
      </div>
      {showPresets && (
        <div className="zeus-gw-presets" aria-label="Gameweek range presets">
          {presets.map(({ length, to: presetTo }) => {
            const active = range.from === Number(min) && range.to === presetTo;
            return (
              <button type="button" key={length} className="fb-press zeus-gw-preset" aria-pressed={active}
                onClick={() => onChange(Number(min), presetTo)}
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
