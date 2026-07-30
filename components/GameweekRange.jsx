"use client";
import React from "react";
import { T, S, lang, val, code } from "../lib/ui";

function WeekSlider({ label, value, min, max, onChange }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 190, flex: "1 1 210px" }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={code(12.5)}>{label}</span>
        <span style={val(15, T.xp)}>GW{value}</span>
      </span>
      <input type="range" min={min} max={max} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", height: 24, accentColor: T.green, cursor: "pointer" }} />
    </label>
  );
}

/* A visible, discrete range control shared by Players and Builder. The two handles are separate tracks so
   neither can cover the other, while FROM and TO are clamped so the range can never invert. */
export default function GameweekRange({ from, to, min = 1, max = 8, onChange, compact = false, description = true }) {
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : 1;
  const safeMax = Math.max(safeMin, Number.isFinite(Number(max)) ? Number(max) : safeMin);
  const safeFrom = Math.max(safeMin, Math.min(safeMax, Number(from) || safeMin));
  const safeTo = Math.max(safeFrom, Math.min(safeMax, Number(to) || safeFrom));
  const changeFrom = (v) => onChange(Math.min(v, safeTo), safeTo);
  const changeTo = (v) => onChange(safeFrom, Math.max(v, safeFrom));

  return (
    <section aria-label="Gameweek range" style={{
      display: "flex", alignItems: "center", gap: compact ? 12 : 16, flexWrap: "wrap",
      padding: compact ? "10px 14px" : "14px 16px", borderRadius: S.radiusSm,
      background: T.card, border: `1px solid ${T.xp}`, width: "100%",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: compact ? 120 : 170 }}>
        <span style={code(13, T.xp)}>GAMEWEEK RANGE</span>
        <span style={val(compact ? 15 : 17, T.xp)}>
          {safeFrom === safeTo ? `GW${safeFrom}` : `GW${safeFrom} to GW${safeTo}`}
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flex: 1, flexWrap: "wrap", minWidth: 280 }}>
        <WeekSlider label="FROM" value={safeFrom} min={safeMin} max={safeTo} onChange={changeFrom} />
        <WeekSlider label="TO" value={safeTo} min={safeFrom} max={safeMax} onChange={changeTo} />
      </div>
      {description && (
        <span style={{ ...lang(13.5, 600), lineHeight: 1.4, maxWidth: 320 }}>
          xPTS, Best XI and Optimise use the total across this range.
        </span>
      )}
    </section>
  );
}
