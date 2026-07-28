"use client";
import React from "react";
import { T, S } from "../lib/ui";

/* THE PITCH SURFACE: the grass, the markings and the rounded frame.
 *
 * Shared so every pitch in the product is the same pitch. The Line-ups page used to draw its own plain
 * gradient with no markings, which made two screens showing the same kind of thing look unrelated.
 */
export const GRASS = "repeating-linear-gradient(0deg, #0B5A2E 0px, #0B5A2E 44px, #0A5029 44px, #0A5029 88px)";
const LINE = "2px solid rgba(255,255,255,0.25)";

export function PitchMarkings() {
  return (
    <>
      <div style={{ position: "absolute", top: -70, left: "50%", transform: "translateX(-50%)", width: 190,
        height: 132, border: LINE, borderRadius: "50%" }} />
      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 300,
        height: 56, border: LINE, borderBottom: "none" }} />
      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 128,
        height: 24, border: LINE, borderBottom: "none" }} />
    </>
  );
}

/* A pitch that lays its rows out back to front, for line-ups whose shape is given rather than derived. */
export default function PitchSurface({ children, minHeight = 520, corners = null }) {
  return (
    <section style={{ position: "relative", background: GRASS, border: `1px solid ${T.line}`,
      borderRadius: S.radius, padding: "26px 14px 18px", overflow: "hidden", minHeight }}>
      {corners}
      <div style={{ position: "relative", display: "flex", flexDirection: "column-reverse",
        justifyContent: "space-between", minHeight: minHeight - 44 }}>
        <PitchMarkings />
        {children}
      </div>
    </section>
  );
}
