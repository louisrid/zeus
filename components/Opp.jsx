"use client";
import React from "react";
import { T, lang, val } from "../lib/ui";

/* One opponent tag everywhere. The xs form is intentionally reserved for compact substitute cards. */
export default function Opp({ fx, scale, size = "md", showNumber = true }) {
  const dimensions = size === "xs"
    ? { h: 20, fs: 12, pad: 6, gap: 4, dot: 5, radius: 6 }
    : size === "sm"
      ? { h: 20, fs: 12, pad: 8, gap: 6, dot: 6, radius: 8 }
      : { h: 26, fs: 12.5, pad: 8, gap: 6, dot: 6, radius: 8 };

  if (!fx || !fx.opp) {
    return (
      <span title="Fixture not published yet"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: dimensions.h,
          padding: `0 ${dimensions.pad}px`, borderRadius: dimensions.radius, background: T.plate,
          ...lang(dimensions.fs, 600), whiteSpace: "nowrap", flexShrink: 0 }}>
        TBC
      </span>
    );
  }

  const difficulty = scale ? scale.difficultyOf(fx.oppId, fx.home) : null;
  const tone = difficulty ? difficulty.tone : "#FFFFFF";
  return (
    <span title={difficulty ? `${difficulty.label} · ${difficulty.difficulty}/100 from ${difficulty.basis}` : "Opponent strength unavailable"}
      style={{ display: "inline-flex", alignItems: "center", gap: dimensions.gap, height: dimensions.h,
        padding: `0 ${dimensions.pad}px`, borderRadius: dimensions.radius, background: T.plate,
        maxWidth: "100%", minWidth: 0, whiteSpace: "nowrap", flexShrink: 0, overflow: "hidden" }}>
      <span style={{ width: dimensions.dot, height: dimensions.dot, borderRadius: dimensions.dot / 2,
        background: tone, flexShrink: 0 }} />
      <span style={{ ...lang(dimensions.fs, 700, tone), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {fx.opp}{fx.home ? " (H)" : " (A)"}
      </span>
      {showNumber && difficulty && <span style={val(dimensions.fs, tone, 500)}>{difficulty.difficulty}</span>}
    </span>
  );
}

export function OppRun({ fxList, scale, n = 6 }) {
  const run = scale ? scale.runDifficulty((fxList || []).slice(0, n)) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {(fxList || []).slice(0, n).map((fixture, index) => (
        <Opp key={index} fx={fixture} scale={scale} size="sm" showNumber={false} />
      ))}
      {run && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 20,
          padding: "0 8px", borderRadius: 8, background: T.plate }}>
          <span style={lang(13, 700)}>RUN</span>
          <span style={val(13, run.tone, 500)}>{run.difficulty}</span>
        </span>
      )}
    </div>
  );
}
