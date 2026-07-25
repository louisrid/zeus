"use client";
import React from "react";
import { T, lang, val } from "../lib/ui";

/* The single opponent tag. Every surface that shows who a player faces next uses this and
   nothing else, so colour, shape and wording cannot drift between screens.
   Dark plate, opponent in Outfit, difficulty number in mono, both tinted by band. */
export default function Opp({ fx, scale, size = "md", showNumber = true }) {
  if (!fx) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: size === "sm" ? 20 : 26,
        padding: "0 8px", borderRadius: 8, background: T.plate, ...lang(size === "sm" ? 12 : 12.5, 600) }}>
        NO FIXTURE
      </span>
    );
  }
  const d = scale ? scale.difficultyOf(fx.oppId, fx.home) : null;
  const tone = d ? d.tone : "#FFFFFF";
  const h = size === "sm" ? 20 : 26;
  return (
    <span
      title={d ? `${d.label} · ${d.difficulty}/100 from ${d.basis}` : "Opponent strength unavailable"}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: h, padding: "0 8px", borderRadius: 8,
        background: T.plate, borderLeft: `3px solid ${tone}`, maxWidth: "100%" }}>
      <span style={{ ...lang(size === "sm" ? 12 : 12.5, 700, tone), whiteSpace: "nowrap" }}>
        {fx.opp}{fx.home ? " (H)" : " (A)"}
      </span>
      {showNumber && d && <span style={val(size === "sm" ? 12 : 12.5, tone, 500)}>{d.difficulty}</span>}
    </span>
  );
}

/* Run of fixtures: N tags in a row plus the mean, used on profiles and comparison. */
export function OppRun({ fxList, scale, n = 6 }) {
  const run = scale ? scale.runDifficulty((fxList || []).slice(0, n)) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {(fxList || []).slice(0, n).map((f, i) => <Opp key={i} fx={f} scale={scale} size="sm" showNumber={false} />)}
      {run && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 20, padding: "0 8px", borderRadius: 8, background: T.plate }}>
          <span style={lang(12, 700)}>RUN</span>
          <span style={val(12, run.tone, 500)}>{run.difficulty}</span>
        </span>
      )}
    </div>
  );
}
