"use client";
import React from "react";
import { T, S, val, lang } from "../lib/ui";

/* One plate for every pitch. The compact form is reserved for substitute benches: one line,
   transparent inside the darker outer bench card, with the name flexing and truncating before xPTS. */
/* NAMES THAT FIT.
 *
 * A fixed size means Ndiaye has room to spare and Calvert-Lewin is cut to "Calvert-…". The plate is a
 * fixed width, so the only variable left is the type, and the length of the name is known before it is
 * drawn. This steps the size down for the longer ones and leaves everything else exactly as it was.
 *
 * The floor is deliberate: below about 9px a name stops being readable, so anything longer than the
 * steps allow still ends in an ellipsis rather than shrinking into nothing. In practice nothing in the
 * Premier League reaches that. */
function fitName(name, base, width = null, share = 0.5) {
  const length = String(name || "").length;
  /* Roughly how wide a character is at this face and weight. Measured against the plates rather than
     assumed: 0.58 of the size is close enough that the steps below land where they should. */
  const perCharacter = 0.62;
  const steps = length <= 8 ? base
    : length <= 10 ? base - 0.75
      : length <= 12 ? base - 1.75
        : length <= 15 ? base - 2.75
          : base - 3.5;
  /* Where the plate width is known, the name is also made to fit that width outright rather than trusting
     the steps alone. The dashboard and the predicted line-ups draw narrower plates than the squad pitch,
     and a step that is right at 84px is not right at 66px. */
  /* The name does not get the whole plate. In the compact plate it shares the line with the points and
     any armband, and measures about half the width; in the full plate it sits on its own line and gets
     most of it. Measured from the rendered plates rather than guessed. */
  const room = Number.isFinite(Number(width)) && Number(width) > 0
    ? (Number(width) * share) / (length * perCharacter)
    : Infinity;
  return Math.max(9, Math.min(steps, room));
}

export default function PlayerPlate({
  name, xp, flag = null, captain = false, vice = false, muted = false, width = "100%",
  compact = false, transparent = false,
}) {
  /* THE CAPTAIN'S NUMBER IS ALREADY DOUBLED.
   *
   * The raw figure used to be shown with a small ×2 badge beside it, which meant the shirt reported a
   * number nobody was going to score and left the reader multiplying by two in their head to compare it
   * with anyone else on the pitch. The armband still says who is captain; the points now say what he is
   * expected to return. Nothing else in the app reads this component's output, so no total moves. */
  const raw = xp === null || xp === undefined || !Number.isFinite(Number(xp)) ? null : Number(xp);
  const figure = raw === null ? null : (captain ? raw * 2 : raw);
  const role = (captain || vice) ? (
    <span style={{ width: compact ? 15 : 17, height: compact ? 15 : 17, borderRadius: 8,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      background: captain ? T.tag : "#FFFFFF", ...val(12, "#0D0014") }}>
      {captain ? "C" : "V"}
    </span>
  ) : null;

  if (compact) {
    return (
      <span style={{ width: "100%", minWidth: 0, maxWidth: "100%", flex: "1 1 100%",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 5, overflow: "hidden",
        background: transparent ? "transparent" : "rgba(6,0,12,0.86)",
        borderRadius: transparent ? 0 : 8, padding: transparent ? 0 : "3px 6px" }}>
        {flag && <span style={{ display: "flex", flexShrink: 0 }}>{flag}</span>}
        <span className="zeus-plate-name" style={{ ...lang(fitName(name, 12.25, width, 0.62), 700, muted ? "rgba(255,255,255,0.55)" : "#FFFFFF"),
          flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap", lineHeight: 1.05 }}>
          {name}
        </span>
        {role}
        {figure === null
          ? <span style={{ ...val(12.75, "#FFFFFF"), flexShrink: 0 }}>-</span>
          : <span style={{ ...val(14.25, T.xp), flexShrink: 0 }}>{figure.toFixed(1)}</span>}
      </span>
    );
  }

  return (
    <span style={{ width, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
      background: transparent ? "transparent" : "rgba(6,0,12,0.86)", borderRadius: S.radiusSm,
      padding: transparent ? 0 : "5px 9px 6px", maxWidth: "100%" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: "100%" }}>
        {flag}
        <span className="zeus-plate-name" style={{ ...lang(fitName(name, 13.5, width, 0.62), 700, muted ? "rgba(255,255,255,0.55)" : "#FFFFFF"),
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.15 }}>
          {name}
        </span>
        {role}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        {figure === null
          ? <span style={val(14, "#FFFFFF")}>-</span>
          : <span style={val(16.5, T.xp)}>{figure.toFixed(1)}</span>}
      </span>
    </span>
  );
}
