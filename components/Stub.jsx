"use client";
import React from "react";
import Link from "next/link";
import { T, FB, FN, FNW } from "../lib/ui";

export default function Stub({ name, line }) {
  return (
    <div style={{ maxWidth: 640, paddingTop: 40, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 16, padding: 28 }}>
        <div style={{ color: T.green, fontFamily: FN, fontWeight: FNW, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase" }}>Arrives with the engine</div>
        <p style={{ color: T.dim, fontFamily: FB, fontSize: 17, lineHeight: 1.6, margin: "12px 0 0" }}>{line}</p>
        <p style={{ color: T.faint, fontFamily: FN, fontWeight: FNW, fontSize: 12, margin: "16px 0 0" }}>
          THE DATABASE IS ALREADY LIVE — EXPLORE IT ON THE PLAYERS PAGE
        </p>
      </div>
      <Link href="/players" style={{ textDecoration: "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", height: 48, padding: "0 24px", borderRadius: 999,
          background: T.green, color: "#04130A", fontFamily: FB, fontSize: 14, fontWeight: 700 }}>
          OPEN PLAYERS
        </span>
      </Link>
    </div>
  );
}
