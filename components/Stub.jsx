"use client";
import React from "react";
import Link from "next/link";
import { T, S, Label, lang } from "../lib/ui";

export default function Stub({ line }) {
  return (
    <div style={{ maxWidth: 640, paddingTop: 40, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: S.radius, padding: 28 }}>
        <Label color={T.green}>Arrives with the engine</Label>
        <p style={{ ...lang(17), lineHeight: 1.6, margin: "12px 0 0" }}>{line}</p>
      </div>
      <Link href="/players" style={{ textDecoration: "none" }}>
        <span className="fb-press" style={{ display: "inline-flex", alignItems: "center", height: S.btn, padding: "0 24px", borderRadius: S.radiusSm,
          background: T.green, ...lang(14, 700, "#04130A") }}>
          OPEN PLAYERS
        </span>
      </Link>
    </div>
  );
}
