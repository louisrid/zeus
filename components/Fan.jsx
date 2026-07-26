"use client";
import React from "react";
import { T, val, lang } from "../lib/ui";

/* Projection fan (03 §1 signature element): p10 → p90 band with a bright median tick.
   `real` false means the band is the interim symmetric estimate, drawn hollow so the
   difference between a measured distribution and a placeholder is visible, never implied. */
export default function Fan({ band, max, width = 120, height = 22, color = T.green }) {
  if (!band || !max || max <= 0) return <span style={val(13)}>—</span>;
  const clamp = (v) => Math.max(0, Math.min(1, v / max));
  const x1 = clamp(band.p10) * width;
  const x2 = clamp(band.p90) * width;
  const mid = clamp(band.p50) * width;
  const w = Math.max(2, x2 - x1);
  return (
    <svg width={width} height={height} style={{ display: "block" }} aria-hidden="true">
      <rect x="0" y={height / 2 - 1} width={width} height="2" rx="1" fill="rgba(255,255,255,0.10)" />
      {band.real ? (
        <>
          <defs>
            <linearGradient id={`fan-${Math.round(mid * 1000)}`} x1="0" x2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="50%" stopColor={color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={color} stopOpacity="0.18" />
            </linearGradient>
          </defs>
          <rect x={x1} y={height / 2 - 6} width={w} height="12" rx="6" fill={`url(#fan-${Math.round(mid * 1000)})`} />
        </>
      ) : (
        <rect x={x1} y={height / 2 - 6} width={w} height="12" rx="6" fill="none" stroke={color} strokeOpacity="0.38" strokeWidth="1" strokeDasharray="3 3" />
      )}
      <rect x={Math.max(0, mid - 1.5)} y={height / 2 - 9} width="3" height="18" rx="1.5" fill={color} />
    </svg>
  );
}

/* Large fan for profiles and the captain picker, with the three numbers rendered on plates. */
export function FanLarge({ band, max, label, color = T.green }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Fan band={band} max={max} width={300} height={30} color={color} />
      <div style={{ display: "flex", gap: 8 }}>
        {[["FLOOR", band?.p10], ["MEDIAN", band?.p50], ["CEILING", band?.p90]].map(([l, v]) => (
          <div key={l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
            background: T.plate, borderRadius: 10, padding: "8px 0" }}>
            <span style={{ ...lang(13, 700), letterSpacing: "0.14em" }}>{l}</span>
            <span style={val(15, color)}>{v === null || v === undefined ? "" : Number(v).toFixed(1)}</span>
          </div>
        ))}
      </div>
      {label && <span style={lang(13, 600)}>{label}</span>}
    </div>
  );
}
