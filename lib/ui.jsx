"use client";
import React from "react";

/* LOCKED SYSTEM — Michroma (identity) · Outfit 600+ (body) · Martian Mono 800 (data).
   White text · 12px floor · numbers centred on dark plates · green = live/actions ·
   #E90052 = risk · #FF2ECC = sparing neon tags only · right rail 240 · content 1480. */
export const FB = "'Outfit',sans-serif";
export const FN = "'Martian Mono',monospace";
export const FNW = 800;
export const D = { fontFamily: "'Michroma',sans-serif", fontWeight: 400 };
export const T = {
  bg: "#0D0014", bgRaise: "#16021F", card: "#1E0630", line: "#3A1150",
  text: "#FFFFFF", dim: "rgba(255,255,255,0.85)", faint: "rgba(255,255,255,0.62)",
  green: "#00FF85", cyan: "#04F5FF", pink: "#E90052", tag: "#FF2ECC",
};
export const KITS = {
  ARS: ["#EF0107", "#FFFFFF"], LIV: ["#C8102E", "#8E0C20"], MUN: ["#DA291C", "#1A1A1A"],
  NFO: ["#E53233", "#E53233"], BOU: ["#B50E12", "#000000"], BRE: ["#E30613", "#FFFFFF"],
  MCI: ["#6CABDD", "#6CABDD"], CHE: ["#034694", "#034694"], EVE: ["#003399", "#003399"],
  BHA: ["#0057B8", "#FFFFFF"], CRY: ["#1B458F", "#C4122E"], TOT: ["#FFFFFF", "#132257"],
  NEW: ["#241F20", "#FFFFFF"], FUL: ["#FFFFFF", "#000000"], WOL: ["#FDB913", "#FDB913"],
  AVL: ["#670E36", "#95BFE5"], WHU: ["#7A263A", "#1BB1E7"], SUN: ["#EB172B", "#FFFFFF"],
  BUR: ["#6C1D45", "#99D6EA"], LEE: ["#FFFFFF", "#1D428A"],
};
export function Kit({ team, size = 22 }) {
  const [body, sleeve] = KITS[team] || ["#31114A", "#31114A"];
  return (
    <div style={{ width: size, height: size * 0.9, flexShrink: 0 }}>
      <svg viewBox="0 0 40 36" width={size} height={size * 0.9}>
        <path d="M13 2 L16 4 Q20 6.5 24 4 L27 2 L38 8 L34 16 L28 12.5 L28 34 L12 34 L12 12.5 L6 16 L2 8 Z" fill={body} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
        <path d="M13 2 L2 8 L6 16 L12 12.5 L12 5 Z" fill={sleeve} />
        <path d="M27 2 L38 8 L34 16 L28 12.5 L28 5 Z" fill={sleeve} />
        <path d="M16 4 Q20 6.5 24 4" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.4" />
      </svg>
    </div>
  );
}
export const Label = ({ children, color = T.dim }) => (
  <div style={{ color, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>{children}</div>
);
export const Plate = ({ children, color = "#FFFFFF", w, h = 30, bg = "#0D0014", size = 12.5 }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, padding: "0 8px",
    background: bg, height: h, minWidth: w, color, fontFamily: FN, fontWeight: FNW, fontSize: size, lineHeight: 1, whiteSpace: "nowrap" }}>
    {children}
  </div>
);
export function Card({ eyebrow, title, accent = T.green, children, right }) {
  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: accent, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase" }}>{eyebrow}</div>
          <h2 style={{ margin: "4px 0 0", fontFamily: FB, fontSize: 22, fontWeight: 700, color: T.text }}>{title}</h2>
        </div>
        {right}
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>{children}</div>
    </section>
  );
}
export function Donut({ value, total, label, sub, color = T.green, size = 128 }) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} fill="none" stroke="#2A0B3D" strokeWidth="14" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 64 64)" />
        <text x="64" y="60" textAnchor="middle" fill="#FFFFFF" fontFamily="'Martian Mono',monospace" fontWeight="800" fontSize="20">{Math.round(pct * 100)}%</text>
        <text x="64" y="78" textAnchor="middle" fill="rgba(255,255,255,0.62)" fontFamily="'Martian Mono',monospace" fontWeight="800" fontSize="12">{label}</text>
      </svg>
      {sub && <div style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, textAlign: "center", whiteSpace: "pre-line", lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}
export const POS_LABEL = { GKP: "GK", DEF: "DEF", MID: "MID", FWD: "FWD" };
export const riskInfo = (p) => {
  if (p.status === "i") return "Injured";
  if (p.status === "s") return "Suspended";
  if (p.status === "d") return `Doubtful${p.chance_of_playing !== null ? ` · ${p.chance_of_playing}% chance` : ""}`;
  if (p.status === "u") return "Unavailable";
  return null;
};
