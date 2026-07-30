"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";

function WeekSlider({ label, value, min, max, onChange }) {
  const disabled = min === max;
  return (
    <label className="zeus-gw-slider">
      <span className="zeus-gw-slider-head">
        <span style={code(12.5)}>{label}</span>
        <span style={val(15, T.xp)}>GW{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={`${label} gameweek`}
        aria-valuetext={`Gameweek ${value}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="zeus-gw-range-input"
      />
    </label>
  );
}

/* One dependable gameweek-range control shared by Players and Builder. Separate tracks avoid the old
   overlapping-thumb bug, while the presets make the common GW1, GW1-GW4 and eight-week choices one click. */
export default function GameweekRange({
  from,
  to,
  min = 1,
  max = 8,
  onChange,
  compact = false,
  description = true,
  showPresets = false,
}) {
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : 1;
  const safeMax = Math.max(safeMin, Number.isFinite(Number(max)) ? Number(max) : safeMin);
  const safeFrom = Math.max(safeMin, Math.min(safeMax, Number(from) || safeMin));
  const safeTo = Math.max(safeFrom, Math.min(safeMax, Number(to) || safeFrom));
  const changeFrom = (value) => onChange(Math.min(value, safeTo), safeTo);
  const changeTo = (value) => onChange(safeFrom, Math.max(value, safeFrom));
  const text = typeof description === "string"
    ? description
    : "xPTS and optimisation use the total across this range.";
  const presets = [
    { label: "1 GW", end: safeMin },
    { label: "4 GWS", end: Math.min(safeMax, safeMin + 3) },
    { label: "8 GWS", end: safeMax },
  ].filter((item, index, list) => list.findIndex((other) => other.end === item.end) === index);

  return (
    <section
      aria-label="Gameweek range"
      data-zeus-feature="gameweek-range-v2"
      className={`zeus-gw-range${compact ? " zeus-gw-range-compact" : ""}`}
      style={{ borderRadius: S.radiusSm, background: T.card, border: `1px solid ${T.xp}` }}
    >
      <div className="zeus-gw-summary">
        <span style={code(13, T.xp)}>GAMEWEEK RANGE</span>
        <span style={val(compact ? 15 : 18, T.xp)}>
          {safeFrom === safeTo ? `GW${safeFrom}` : `GW${safeFrom} TO GW${safeTo}`}
        </span>
      </div>

      <div className="zeus-gw-tracks">
        <WeekSlider label="FROM" value={safeFrom} min={safeMin} max={safeTo} onChange={changeFrom} />
        <WeekSlider label="TO" value={safeTo} min={safeFrom} max={safeMax} onChange={changeTo} />
      </div>

      {showPresets && (
        <div className="zeus-gw-presets" aria-label="Gameweek range presets">
          {presets.map((preset) => {
            const active = safeFrom === safeMin && safeTo === preset.end;
            return (
              <button
                type="button"
                key={`${preset.label}-${preset.end}`}
                className="fb-press zeus-gw-preset"
                aria-pressed={active}
                onClick={() => onChange(safeMin, preset.end)}
                style={{
                  background: active ? T.xp : T.plate,
                  border: `1px solid ${active ? T.xp : T.line}`,
                  ...lang(12.5, 700, active ? "#04130A" : "#FFFFFF"),
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      )}

      {description && <span className="zeus-gw-description" style={{ ...lang(13.25, 600) }}>{text}</span>}
    </section>
  );
}
