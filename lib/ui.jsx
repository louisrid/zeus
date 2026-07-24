"use client";
import React from "react";

/* FPLBOT TYPE PHILOSOPHY — one rule, every surface:
   OUTFIT = language (names, titles, labels, headers, dates, fixture strings). Sentence case.
   MARTIAN MONO = data values (prices, %, counts, countdown digits, status codes). Max weight 700.
   MICHROMA = identity only (page titles, wordmark).
   All text pure #FFFFFF unless it carries state colour. Hierarchy = size + weight only.
   Caps only: page titles, wordmark, eyebrows, CODES. Codes inside language = Outfit 500. */
export const FB = "'Outfit',sans-serif";
export const FN = "'Martian Mono',monospace";
export const FNW = 700;   // mono value weight (700 is the ceiling)
export const FNM = 500;   // mono secondary weight for stacked numbers
export const D = { fontFamily: "'Michroma',sans-serif", fontWeight: 400 };
export const T = {
  bg: "#0D0014", row: "#14041F", card: "#1E0630", plate: "#0A0011", line: "#3A1150",
  text: "#FFFFFF",
  green: "#00FF85", cyan: "#04F5FF", pink: "#E90052", tag: "#FF2ECC",
};
export const S = {
  row: 58, plate: 34, chip: 28,
  radius: 18, radiusSm: 12, pad: 24, gap: 18,
  body: 16, name: 16.5, data: 14, cardTitle: 24, label: 12.5,
  btn: 48, btnSm: 40,
};
/* Role helpers — use these, not ad-hoc styles */
export const lang = (size = S.body, weight = 600, color = "#FFFFFF") => ({ fontFamily: FB, fontSize: size, fontWeight: weight, color });
export const val = (size = S.data, color = "#FFFFFF", weight = FNW) => ({ fontFamily: FN, fontSize: size, fontWeight: weight, color, lineHeight: 1 });
export const code = (size = 13.5, color = "#FFFFFF") => ({ fontFamily: FB, fontSize: size, fontWeight: 500, color, textTransform: "uppercase" });

export const KITS = {
  ARS: ["#EF0107", "#FFFFFF"], LIV: ["#C8102E", "#8E0C20"], MUN: ["#DA291C", "#1A1A1A"],
  NFO: ["#E53233", "#E53233"], BOU: ["#B50E12", "#000000"], BRE: ["#E30613", "#FFFFFF"],
  MCI: ["#6CABDD", "#6CABDD"], CHE: ["#034694", "#034694"], EVE: ["#003399", "#003399"],
  BHA: ["#0057B8", "#FFFFFF"], CRY: ["#1B458F", "#C4122E"], TOT: ["#FFFFFF", "#132257"],
  NEW: ["#241F20", "#FFFFFF"], FUL: ["#FFFFFF", "#000000"], WOL: ["#FDB913", "#FDB913"],
  AVL: ["#670E36", "#95BFE5"], WHU: ["#7A263A", "#1BB1E7"], SUN: ["#EB172B", "#FFFFFF"],
  BUR: ["#6C1D45", "#99D6EA"], LEE: ["#FFFFFF", "#1D428A"],
};
export function Kit({ team, size = 26 }) {
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
export function Face({ code: photo, team, size = 44 }) {
  const [ok, setOk] = React.useState(Boolean(photo));
  if (!ok) return <Kit team={team} size={size * 0.7} />;
  return (
    <img alt="" width={size} height={Math.round(size * 1.27)}
      src={`https://resources.premierleague.com/premierleague/photos/players/110x140/p${photo}.png`}
      onError={() => setOk(false)}
      style={{ width: size, height: Math.round(size * 1.27), objectFit: "cover", borderRadius: 10, background: "#2A0B3D", flexShrink: 0 }} />
  );
}
/* Eyebrow label — one of the few permitted caps surfaces */
export const Label = ({ children, color = "#FFFFFF" }) => (
  <div style={{ color, fontFamily: FB, fontWeight: 700, fontSize: S.label, letterSpacing: "0.14em", textTransform: "uppercase" }}>{children}</div>
);
/* Plate — only where a value earns emphasis (price, ownership, hero counts) */
export const Plate = ({ children, color = "#FFFFFF", w, h = S.plate, bg = T.plate, size = S.data }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, padding: "0 10px",
    background: bg, height: h, minWidth: w, ...val(size, color) }}>
    {children}
  </div>
);
/* Status code — a data value: mono 700, coloured */
export function Status({ p }) {
  const s = p.status === "a" ? ["FIT", T.green] : p.status === "d" ? ["DOUBT", T.pink] : ["OUT", T.pink];
  return <span style={val(S.data, s[1])}>{s[0]}</span>;
}
export function Card({ eyebrow, title, accent = T.green, children, right, pad = S.pad }) {
  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: pad, display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <Label color={accent}>{eyebrow}</Label>
          <h2 style={{ margin: "5px 0 0", ...lang(S.cardTitle, 700) }}>{title}</h2>
        </div>
        {right}
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>{children}</div>
    </section>
  );
}
export function Donut({ value, total, label, color = T.green, size = 140 }) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 128 128">
      <circle cx="64" cy="64" r={r} fill="none" stroke="#2A0B3D" strokeWidth="15" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="15" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 64 64)" style={{ transition: "stroke-dasharray 600ms ease" }} />
      <text x="64" y="60" textAnchor="middle" fill="#FFFFFF" fontFamily="'Martian Mono',monospace" fontWeight="700" fontSize="22">{Math.round(pct * 100)}%</text>
      <text x="64" y="80" textAnchor="middle" fill="#FFFFFF" fontFamily="'Martian Mono',monospace" fontWeight="500" fontSize="12">{label}</text>
    </svg>
  );
}
export const Skeleton = ({ h = S.row, w = "100%", r = S.radiusSm }) => (
  <div className="fb-skel" style={{ height: h, width: w, borderRadius: r }} />
);
export const SkeletonRows = ({ n = 6, h = S.row }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {Array.from({ length: n }).map((_, i) => <Skeleton key={i} h={h} />)}
  </div>
);
export function ErrorCard({ onRetry }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 28, display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
      <Label color={T.pink}>Connection issue</Label>
      <p style={{ ...lang(S.body), lineHeight: 1.6, margin: 0 }}>
        The database could not be reached. The app is fine — this is usually a network blip.
      </p>
      <button onClick={onRetry} className="fb-press" style={{ height: S.btn, padding: "0 26px", borderRadius: 999, background: T.green, ...lang(15, 700, "#04130A"), alignSelf: "flex-start" }}>
        RETRY
      </button>
    </div>
  );
}
export const POS_LABEL = { GKP: "GK", DEF: "DEF", MID: "MID", FWD: "FWD" };
export const riskInfo = (p) => {
  if (p.status === "i") return "Injured";
  if (p.status === "s") return "Suspended";
  if (p.status === "d") return `Doubtful${p.chance_of_playing !== null ? ` — ${p.chance_of_playing}% chance` : ""}`.replace(" — ", " · ");
  if (p.status === "u") return "Unavailable";
  return null;
};
