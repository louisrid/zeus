"use client";
import { Lock } from "lucide-react";
import { T } from "../lib/ui";

/* THE LOCK MARK. One shape for both kinds of lock, so they are recognisably the same idea: a rounded
   yellow square with a black lock centred in it. Used by the formation lock button and beside every
   locked player. Yellow appears nowhere else in the product. */
export default function LockMark({ size = 22, on = true }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 6, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: on ? T.lock : T.card, border: on ? "none" : `1px solid ${T.line}` }}>
      <Lock size={Math.round(size * 0.58)} color={on ? "#0D0014" : "#FFFFFF"} strokeWidth={2.6} />
    </span>
  );
}
