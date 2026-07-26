"use client";
import React from "react";
import { T, lang, val } from "../lib/ui";

/* The single opponent tag. Every surface that shows who a player faces next uses this and
   nothing else, so colour, shape and wording cannot drift between screens.
   Dark plate, opponent in Outfit, difficulty number in mono, both tinted by band. */
export default function Opp({ fx, scale, size = "md", showNumber = true }) {
  const h = size === "sm" ? 20 : 26;
  const fs = size === "sm" ? 12 : 12.5;

  // Deliberate state when the fixture genuinely is not published yet. Never a bare dash.
  if (!fx || !fx.opp) {
    return (
      <span title="Fixture not published yet"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: h,
          padding: "0 8px", borderRadius: 8, background: T.plate, ...lang(fs, 600) }}>
        TBC
      </span>
    );
  }
  const d = scale ? scale.difficultyOf(fx.oppId, fx.home) : null;
  const tone = d ? d.tone : "#FFFFFF";
  return (
    <span
      title={d ? `${d.label} · ${d.difficulty}/100 from ${d.basis}` : "Opponent strength unavailable"}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: h, padding: "0 8px", borderRadius: 8,
        background: T.plate, maxWidth: "100%" }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: tone, flexShrink: 0 }} />
      <span style={{ ...lang(fs, 700, tone), whiteSpace: "nowrap" }}>
        {fx.opp}{fx.home ? " (H)" : " (A)"}
      </span>
      {showNumber && d && <span style={val(fs, tone, 500)}>{d.difficulty}</span>}
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
          <span style={lang(13, 700)}>RUN</span>
          <span style={val(13, run.tone, 500)}>{run.difficulty}</span>
        </span>
      )}
    </div>
  );
}
