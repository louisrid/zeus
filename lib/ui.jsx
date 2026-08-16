"use client";
import React from "react";

/* FPLBOT TYPE PHILOSOPHY — one rule, every surface:
   OUTFIT = language (names, titles, labels, headers, dates, fixture strings). Sentence case.
   IBM PLEX MONO = data values (prices, %, counts, countdown digits, status codes).
   MICHROMA = identity only (page titles, wordmark).
   Hierarchy = size and colour. Weight is NOT a hierarchy tool for numbers.
   Caps only: page titles, wordmark, eyebrows, CODES. Codes inside language = Outfit 500.

   WHY THE NUMBERS ARE LIGHT.
   The old setting was Martian Mono 700. Martian is roughly a third wider per character than a normal
   mono and 700 is close to its heaviest, so a dense table turned into a wall of slabs and nothing could
   stand out because everything already shouted. Plex Mono at 300 gives the same monospaced column
   alignment with a fraction of the ink, which lets colour do the work of emphasis instead of weight.

   SMALL FIGURES STEP UP, THEY DO NOT STAY LIGHT.
   A Light weight thins out as it shrinks, and bench values and chip labels run under 12px. Below
   FN_STEP_UP_SIZE the weight moves to FNM so small numbers stay legible. This is automatic inside
   val(): callers ask for a size, not a weight. */
export const FB = "'Outfit',sans-serif";
export const FN = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
export const FNW = 300;   // mono value weight, the default for every number
export const FNM = 400;   // mono weight for small figures and secondary stacked numbers
export const FN_MAX = 500;          // nothing numeric may exceed this
export const FN_STEP_UP_SIZE = 12;  // at or below this px, weight moves to FNM
export const D = { fontFamily: "'Michroma',sans-serif", fontWeight: 400 };
export const T = {
  bg: "#0D0014", row: "#14041F", card: "#1E0630", plate: "#0A0011", line: "#3A1150",
  // Locks only. Captain and x2 keep magenta; risk keeps pink.
  lock: "#FFD400",
  /* xPTS has its own colour so it can never be mistaken for price or any other metric. Used for every
     projected-points value, label and control, and for nothing else. */
  xp: "#4FD8FF",
  text: "#FFFFFF",
  green: "#00FF85", cyan: "#04F5FF", pink: "#E90052", tag: "#3ECBFF", onTag: "#04202B",
};
export const S = {
  row: 58, plate: 34, chip: 28,
  radius: 18, radiusSm: 12, pad: 24, gap: 18,
  body: 16, name: 16.5, data: 14, cardTitle: 24, label: 12.5,
  btn: 48, btnSm: 40,
};
/* Role helpers — use these, not ad-hoc styles */
/* Enforcement, not convention. These three helpers are the only legal way to set type.
   - solid() rejects any transparent or grey ink. Hierarchy comes from size and weight, never opacity.
   - val() clamps the mono weight at FNW (700). 800 cannot be produced through this API.
   - code() is the only helper that upper-cases, and it is Outfit, not mono. */
const STATE = new Set([T.green, T.cyan, T.pink, T.tag, T.onTag, "#FFFFFF", "#04130A", "#0D0014"]);
export function solid(color) {
  if (typeof color !== "string") return "#FFFFFF";
  if (STATE.has(color)) return color;
  // anything translucent or grey collapses to pure white by design
  if (color.startsWith("rgba") || color.startsWith("hsla") || color.toLowerCase() === "#ffffff") return "#FFFFFF";
  return color;
}
export const lang = (size = S.body, weight = 600, color = "#FFFFFF") => ({ fontFamily: FB, fontSize: size, fontWeight: weight, color: solid(color) });
/* val() owns the weight, not the caller.
   The old signature let any call site pass its own weight, which is how PlayerPlate ended up asking for
   800 while the clamp quietly served 700: the code said one thing and the screen showed another. Weight
   is now derived from size, so a number is light because it is large and firmer because it is small,
   everywhere, without thirty files having to agree. A caller may still pass a weight for a genuine
   exception, but it is clamped to FN_MAX and can never drop below the size-appropriate floor.

   tabular-nums is not cosmetic here. Plex Mono is monospaced, but the moment a figure falls back to a
   system font the digits stop sharing a width and a column of prices visibly wobbles. */
export const val = (size = S.data, color = "#FFFFFF", weight) => {
  const floor = size <= FN_STEP_UP_SIZE ? FNM : FNW;
  const resolved = Number.isFinite(weight) ? Math.min(Math.max(weight, floor), FN_MAX) : floor;
  return {
    fontFamily: FN,
    fontSize: size,
    fontWeight: resolved,
    color: solid(color),
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    fontFeatureSettings: '"tnum" 1',
  };
};
export const code = (size = 13.5, color = "#FFFFFF") => ({ fontFamily: FB, fontSize: size, fontWeight: 500, color: solid(color), textTransform: "uppercase" });

/* Value — a number with no plate. This is the default for numeric cells. Reach for Plate only
   when a value genuinely earns emphasis, never for a whole row of them. */
export const Value = ({ children, color = "#FFFFFF", size = S.data, align = "center" }) => (
  <span style={{ ...val(size, color), textAlign: align, display: "block" }}>{children}</span>
);

/* NameNumber — the locked name-over-number stack. Name dominates, number sits lighter beneath. */
export const NameNumber = ({ name, number, color = "#FFFFFF", nameSize = S.name, numberSize = 12.5, align = "flex-start" }) => (
  <span style={{ display: "flex", flexDirection: "column", alignItems: align, minWidth: 0 }}>
    <span style={{ ...lang(nameSize, 700), lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{name}</span>
    {number !== null && number !== undefined && <span style={val(numberSize, color, FNM)}>{number}</span>}
  </span>
);

/* Kit colours are keyed by the club a player is published for, not by the club stored against him. A
   summer transfer leaves the stored club trailing the team news by days, and drawing the old shirt in a
   published eleven is the most visible possible way to look wrong. Promoted clubs must be present here or
   they fall through to the placeholder purple, which is what happened to Coventry, Hull and Ipswich. */
export const KITS = {
  ARS: ["#EF0107", "#FFFFFF"], LIV: ["#C8102E", "#8E0C20"], MUN: ["#DA291C", "#1A1A1A"],
  NFO: ["#E53233", "#E53233"], BOU: ["#B50E12", "#000000"], BRE: ["#E30613", "#FFFFFF"],
  MCI: ["#6CABDD", "#6CABDD"], CHE: ["#034694", "#034694"], EVE: ["#003399", "#003399"],
  BHA: ["#0057B8", "#FFFFFF"], CRY: ["#1B458F", "#C4122E"], TOT: ["#FFFFFF", "#132257"],
  NEW: ["#241F20", "#FFFFFF"], FUL: ["#FFFFFF", "#000000"],
  AVL: ["#670E36", "#95BFE5"], SUN: ["#EB172B", "#FFFFFF"],
  LEE: ["#FFFFFF", "#1D428A"],
  COV: ["#78D0F3", "#78D0F3"], HUL: ["#F5A12D", "#000000"], IPS: ["#3A64A3", "#FFFFFF"],
};
/* ClubBar — the club's colour as a rule down the left of the name.
 *
 * Cutting the metric palette from seven hues to three takes a lot of colour out of a dense table, and a
 * table of white numbers on purple is correct but joyless. This puts the colour back somewhere it
 * carries meaning without competing with the data: identity, not measurement. It also gives the eye a
 * fixed left edge to track along a row, which matters more as rows get wider.
 *
 * It reads the same KITS table the shirts do, so a club can never have a bar and a shirt that disagree. */
export function ClubBar({ team, height = 22 }) {
  const [body] = KITS[team] || ["#31114A", "#31114A"];
  return <span aria-hidden="true" style={{ width: 3, height, borderRadius: 2, background: body, flexShrink: 0, display: "block" }} />;
}

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
/* THE INJURY WARNING FLAG: a filled yellow triangle with a thick black exclamation mark. The previous
   icon was a white outline with no fill, which read as decoration rather than a warning. Defined here so
   every surface that shows availability gets the same mark without a circular import. */
export function WarnFlag({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 2.6 22.4 20.6a1.6 1.6 0 0 1-1.4 2.4H3a1.6 1.6 0 0 1-1.4-2.4Z" fill={T.lock} />
      <rect x="10.6" y="8" width="2.8" height="7.4" rx="1.2" fill="#0D0014" />
      <rect x="10.6" y="16.6" width="2.8" height="2.8" rx="1.4" fill="#0D0014" />
    </svg>
  );
}

export function Status({ p }) {
  const s = p.status === "a" ? ["FIT", T.green] : p.status === "d" ? ["DOUBT", T.pink] : ["OUT", T.pink];
  /* A warning carries the flag as well as the word, so it reads as a warning at a glance rather than as
     another value in the row. */
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {p.status !== "a" && <WarnFlag size={15} />}
      <span style={val(S.data, s[1])}>{s[0]}</span>
    </span>
  );
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
      <text x="64" y="60" textAnchor="middle" fill="#FFFFFF" fontFamily={FN} fontWeight={FNW} fontSize="22">{Math.round(pct * 100)}%</text>
      <text x="64" y="80" textAnchor="middle" fill="#FFFFFF" fontFamily={FN} fontWeight={FNM} fontSize="12">{label}</text>
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

/* Budget pill. One definition so the dashboard, builder and squad pitches read identically.
   Dark plate, top right of a pitch. Pink when over budget, because over budget is not a squad. */
export const SQUAD_BUDGET = 100.0;
/* xP for the shown gameweek, as a pill on the pitch. Deliberately the same shape, height and plate as
   BudgetPill, which sits opposite it: two readouts on the pitch that look like siblings.
   A hit is shown as a small red tag beside the number, so the deduction is visible in the figure that
   matters rather than described somewhere else. */
export function XpPill({ label = "xPTS", gross, hit = 0, free = null }) {
  const net = (Number(gross) || 0) - (Number(hit) || 0);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 13px",
      borderRadius: 999, background: "rgba(6,0,12,0.82)", border: `1px solid ${T.line}` }}>
      <span style={lang(13, 600)}>{label}</span>
      <span style={val(15)}>{net.toFixed(1)}</span>
      {hit > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 6px",
          borderRadius: 999, ...val(13, T.pink, 500) }}>-{hit}</span>
      )}
      {free !== null && (
        <>
          <span style={{ width: 1, height: 16, background: T.line }} />
          <span style={lang(13, 600)}>FT</span>
          <span style={val(15, free === 0 ? T.pink : "#FFFFFF")}>{free}</span>
        </>
      )}
    </span>
  );
}

export function BudgetPill({ spend, budget = SQUAD_BUDGET }) {
  const over = spend > budget + 0.001;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 13px",
      borderRadius: 999, background: "rgba(6,0,12,0.82)", border: `1px solid ${over ? T.pink : T.line}` }}>
      <span style={val(15, over ? T.pink : "#FFFFFF")}>{Number(spend).toFixed(1)}</span>
      <span style={lang(13, 600)}>of</span>
      <span style={val(15)}>{Number(budget).toFixed(1)}</span>
    </span>
  );
}
